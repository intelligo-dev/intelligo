/**
 * Profile management service — the durable business rules behind
 * reading the caller's own profile, updating it, and deleting the
 * account, lifted out of the first product's profile actions
 * (page/registry migration, `profile-settings` family, roadmap item 9).
 *
 * Mirrors `createTeamService(ports)` / `createWorkspaceService(ports)`
 * (../team/service.ts, ../workspace/service.ts) one directory over: a
 * factory over optional ports, so this package's allowlisted dependency
 * (`@intelligo-dev/core` only — see
 * tests/architecture/dependency-direction.test.ts) never grows to
 * include an email-sending concern of its own. A consumer binds the
 * account-deletion confirmation email in at its composition root:
 *
 *   const profileService = createProfileService({
 *     onAccountDeleted: ({ email, name }) =>
 *       sendEmail({ to: email, subject: ..., html: ... }), // @intelligo-dev/core/email
 *   });
 *
 * Authorization (`requireAuth`) lives INSIDE each method, not at the
 * transport. Every recognized failure throws `ProfileServiceError` with
 * a stable `code` — no revalidatePath/Sentry/next-intl/toast here; that
 * shaping is the transport's job (a Server Action, a route handler).
 *
 * ---------------------------------------------------------------------
 * Why the confirmation email is a port, not a direct import
 * ---------------------------------------------------------------------
 * The product application's original `deleteAccount()`
 * calls `sendEmail` from
 * `@intelligo-dev/core/email` directly, inline, with a hardcoded English
 * HTML template. `@intelligo-dev/auth` already imports `@intelligo-dev/core/email`
 * elsewhere (`server.ts`'s Better-Auth hooks — verification, password
 * reset, welcome, invitation emails), so nothing in the allowlist
 * (auth → core only) would technically block importing `sendEmail`
 * here too. The port exists anyway, for the same reason
 * `TeamServicePorts.sendInvitationEmail` and
 * `WorkspaceServicePorts.checkWorkspaceLimit` are ports rather than
 * direct calls: this service should not own *content* — copy, subject
 * lines, template shape — for a side effect a consumer may want to
 * localize, skip, or replace with a different provider. `onAccountDeleted`
 * is fire-and-forget by design (matching the original action's `.catch(console.error)`
 * pattern): a failed confirmation email must never block the deletion
 * that already succeeded.
 */

import { headers } from "next/headers";
import type { ZodType } from "zod";
import { eq } from "drizzle-orm";
import { createLogger } from "@intelligo-dev/core/logger";
import { db } from "@intelligo-dev/core/db";
import { users, sessions } from "@intelligo-dev/core/db/schema";

import { auth } from "../server";
import { requireAuth } from "../helpers";
import { updateProfileSchema, type UpdateProfileInput } from "./schemas";
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
  }) => Promise<void>;
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

export function createProfileService(ports: ProfileServicePorts = {}) {
  async function callRequireAuth() {
    try {
      return await requireAuth();
    } catch (error) {
      throw toForbidden(error);
    }
  }

  /**
   * Get the caller's own profile.
   */
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
   * (Better-Auth's `updateUser` does not accept `null`), matching
   * the original action.
   */
  async function updateProfile(input: UpdateProfileInput): Promise<void> {
    await callRequireAuth();
    const validated = parseInput(updateProfileSchema, input);
    const hdrs = await headers();

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
   * Delete the caller's own account: soft delete (`users.deletedAt`),
   * invalidate every session (force logout), then fire the
   * `onAccountDeleted` port, if bound, without waiting on it.
   */
  async function deleteAccount(): Promise<void> {
    const { user } = await callRequireAuth();

    try {
      await db
        .update(users)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));

      await db.delete(sessions).where(eq(sessions.userId, user.id));
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
    deleteAccount,
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
