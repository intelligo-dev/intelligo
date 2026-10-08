/**
 * The caller's own profile: read, update, delete the account. Each method
 * authorizes itself and throws `ProfileServiceError`. The confirmation email
 * is the `onAccountDeleted` port so its copy and provider stay the
 * consumer's; it is fire-and-forget, since the deletion has already succeeded.
 */

import { getRequestHeaders } from "@intelligo-dev/core/request-context";
import type { ZodType } from "zod";
import { eq } from "drizzle-orm";
import { createLogger } from "@intelligo-dev/core/logger";
import { db } from "@intelligo-dev/core/db";
import { users, sessions } from "@intelligo-dev/core/db/schema";

import { auth } from "../server";
import { requireAuth } from "../helpers";
import { accountDeletionGraceMs } from "../account-deletion";
import {
  deleteWorkspaceWithPort,
  type BeforeDeleteWorkspace,
} from "../workspace/delete";
import { ownedWorkspaces } from "../workspace/ownership";
import {
  preferredLanguageSchema,
  updateProfileSchema,
  type UpdateProfileInput,
} from "./schemas";
import { ProfileServiceError, isProfileServiceError } from "./errors";

const log = createLogger("ProfileService");

export interface ProfileRecord {
  id: string;
  name: string | null;
  email: string;
  image?: string | null;
  emailVerified: boolean;
}

export type ProfileServicePorts = {
  /**
   * Fired after the account has been soft-deleted and its sessions
   * invalidated. Fire-and-forget from the service's perspective — a
   * failure here is logged by the consumer, never surfaced to the
   * caller of `deleteAccount()` (the deletion has already succeeded).
   * No port ⇒ no confirmation email is sent.
   */
  onAccountDeleted?: (input: {
    userId: string;
    email: string;
    name: string;
    /** When the account is purged; it can be restored until then. */
    restorableUntil: Date;
  }) => Promise<void>;
  /**
   * Runs before each workspace the account owns alone is deleted with it —
   * the same port the workspace service takes, and bound to the same thing:
   * a paid subscription keeps billing otherwise.
   */
  beforeDeleteWorkspace?: BeforeDeleteWorkspace;
  /** Defaults to `accountDeletionGraceMs()`. */
  graceMs?: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps requireAuth failures to `forbidden`. */
function toForbidden(error: unknown): ProfileServiceError {
  if (isProfileServiceError(error)) return error;
  return new ProfileServiceError("forbidden", errorMessage(error), {
    cause: error,
  });
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ProfileServiceError(
      "invalid_input",
      result.error.issues.map((issue) => issue.message).join("; ") ||
        "Invalid input",
      { cause: result.error }
    );
  }
  return result.data;
}

/** How recently a session must have signed in to delete its account. */
const FRESH_SESSION_MS = 24 * 60 * 60 * 1000;

export function createProfileService(ports: ProfileServicePorts = {}) {
  async function callRequireAuth() {
    try {
      return await requireAuth();
    } catch (error) {
      throw toForbidden(error);
    }
  }

  /** The caller's own profile. */
  async function getProfile(): Promise<ProfileRecord> {
    const { user } = await callRequireAuth();

    return {
      id: user.id,
      name: user.name ?? null,
      email: user.email,
      image: user.image ?? null,
      emailVerified: Boolean(user.emailVerified),
    };
  }

  /**
   * Update the caller's own name/image via the Better-Auth user API.
   * Only the fields present in `input` are sent — omitting a field
   * leaves it unchanged; `image: null` is dropped rather than forwarded
   * (Better-Auth's `updateUser` does not accept `null`).
   */
  async function updateProfile(input: UpdateProfileInput): Promise<void> {
    await callRequireAuth();
    const validated = parseInput(updateProfileSchema, input);
    const hdrs = await getRequestHeaders();

    const updateData: { name?: string; image?: string } = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.image !== undefined && validated.image !== null) {
      updateData.image = validated.image;
    }

    try {
      await auth.api.updateUser({ headers: hdrs, body: updateData });
    } catch (error) {
      log.error("updateUser failed", { error: errorMessage(error) });
      throw new ProfileServiceError(
        "provider_error",
        "Failed to update profile",
        { cause: error }
      );
    }
  }

  /**
   * Record the caller's preferred language (`users.preferred_language`),
   * which emails and a returning session's default locale read. A column
   * Intelligo owns rather than a Better-Auth user field, so it is written
   * directly.
   */
  async function setPreferredLanguage(locale: string): Promise<void> {
    const { user } = await callRequireAuth();
    const validated = parseInput(preferredLanguageSchema, locale);

    try {
      await db
        .update(users)
        .set({ preferredLanguage: validated, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    } catch (error) {
      log.error("setPreferredLanguage failed", { error: errorMessage(error) });
      throw new ProfileServiceError(
        "provider_error",
        "Failed to update the preferred language",
        { cause: error }
      );
    }
  }

  /**
   * Schedule the caller's own account for deletion: soft delete
   * (`users.deletedAt`), invalidate every session (force logout), then
   * fire the `onAccountDeleted` port, if bound, without waiting on it.
   * Signing in and confirming restores the account until the grace
   * period ends (`restoreAccount`); `purgeDeletedAccounts` deletes it
   * after that.
   *
   * Refused as `sole_owner` while the caller is the only owner of a
   * workspace that has other members: those members would be left with
   * nobody who can manage or pay for it. Workspaces the caller owns alone
   * are deleted with the account, each through `beforeDeleteWorkspace`.
   *
   * Only from a session signed in within the last day — a stolen or
   * forgotten one should not end the account — and never from an
   * impersonation, which acts for the user without being them.
   */
  async function deleteAccount(): Promise<void> {
    const { user, session } = await callRequireAuth();
    const current = session as {
      createdAt?: Date | string | null;
      impersonatedBy?: string | null;
    };
    const signedInAt = current.createdAt
      ? new Date(current.createdAt).getTime()
      : 0;
    if (current.impersonatedBy || Date.now() - signedInAt > FRESH_SESSION_MS) {
      throw new ProfileServiceError(
        "reauthentication_required",
        "Sign in again to delete your account."
      );
    }

    const owned = await ownedWorkspaces(user.id).catch((error: unknown) => {
      log.error("deleteAccount: reading owned workspaces failed", {
        error: errorMessage(error),
      });
      throw new ProfileServiceError(
        "provider_error",
        "Failed to delete account",
        { cause: error }
      );
    });
    const blocking = owned.filter((w) => w.owners === 1 && w.members > 1);
    if (blocking.length > 0) {
      throw new ProfileServiceError(
        "sole_owner",
        "Transfer ownership of, or delete, the workspaces you alone own before deleting your account.",
        { meta: { workspaces: blocking.map((w) => w.name) } }
      );
    }

    const hdrs = await getRequestHeaders();
    for (const workspace of owned.filter((w) => w.members === 1)) {
      try {
        await deleteWorkspaceWithPort(
          workspace.id,
          hdrs,
          ports.beforeDeleteWorkspace
        );
      } catch (error) {
        log.error("deleteAccount: deleting an owned workspace failed", {
          workspaceId: workspace.id,
          error: errorMessage(error),
        });
        throw new ProfileServiceError(
          "provider_error",
          "Failed to delete account",
          { cause: error }
        );
      }
    }

    const deletedAt = new Date();
    try {
      await db
        .update(users)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(eq(users.id, user.id));

      await db.delete(sessions).where(eq(sessions.userId, user.id));
      log.warn("Account deleted by its user", { userId: user.id });
    } catch (error) {
      log.error("deleteAccount failed", { error: errorMessage(error) });
      throw new ProfileServiceError(
        "provider_error",
        "Failed to delete account",
        { cause: error }
      );
    }

    if (ports.onAccountDeleted) {
      ports
        .onAccountDeleted({
          userId: user.id,
          email: user.email,
          name: user.name || "",
          restorableUntil: new Date(
            deletedAt.getTime() + (ports.graceMs ?? accountDeletionGraceMs())
          ),
        })
        .catch((err) =>
          log.error("onAccountDeleted port failed", {
            error: errorMessage(err),
          })
        );
    }
  }

  return {
    getProfile,
    updateProfile,
    setPreferredLanguage,
    deleteAccount,
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
