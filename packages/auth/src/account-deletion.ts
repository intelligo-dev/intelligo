/**
 * An account's deletion after the profile service schedules it: a grace
 * period in which signing in and confirming restores the account, then a
 * purge.
 *
 * During the grace period the user can still sign in, but
 * `getAuthSession` treats that session as signed out, so every page and
 * route refuses it. The one thing it reaches is the restore screen, which
 * reads `getPendingDeletion` and calls `restoreAccount`.
 *
 * `purgeDeletedAccounts`, called from the maintenance route, deletes each
 * account whose grace period has ended. Deleting the user row takes their
 * sessions, memberships, conversations, documents, facts, memories and
 * profile snapshots with it; usage, finance and execution rows stay with
 * the user cleared. The memory audit is erased before that
 * (`eraseUserFromMemoryAudit`), and so is whatever the `beforePurge` port
 * erases — the app's audit events, say.
 */

import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@intelligo-dev/core/db";
import { users } from "@intelligo-dev/core/db/schema";
import { eraseUserFromMemoryAudit } from "@intelligo-dev/core/identity";
import { createLogger } from "@intelligo-dev/core/logger";
import { getRequestHeaders } from "@intelligo-dev/core/request-context";

import { auth } from "./server";
import { ProfileServiceError } from "./profile/errors";

const log = createLogger("AccountDeletion");

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a deleted account can be restored when nothing says otherwise. */
export const DEFAULT_ACCOUNT_DELETION_GRACE_DAYS = 30;

/**
 * The grace period: `ACCOUNT_DELETION_GRACE_DAYS` when it is a positive
 * number, 30 days otherwise. The restore screen and the purge both read
 * it, so they agree on when an account is gone.
 */
export function accountDeletionGraceMs(
  env: Record<string, string | undefined> = process.env
): number {
  const days = Number(env.ACCOUNT_DELETION_GRACE_DAYS);
  return (
    (Number.isFinite(days) && days > 0
      ? days
      : DEFAULT_ACCOUNT_DELETION_GRACE_DAYS) * DAY_MS
  );
}

export type PendingDeletion = {
  userId: string;
  email: string;
  name: string;
  deletedAt: Date;
  /** When the purge takes the account; restoring is possible until then. */
  restorableUntil: Date;
  /** False once the grace period has ended and the purge has yet to run. */
  restorable: boolean;
};

type SessionWithDeletion = {
  session: { createdAt?: Date | string | null; impersonatedBy?: string | null };
  user: {
    id: string;
    email: string;
    name?: string | null;
    deletedAt?: Date | string | null;
  };
};

async function currentSession(): Promise<SessionWithDeletion | null> {
  return (await auth.api.getSession({
    headers: await getRequestHeaders(),
  })) as SessionWithDeletion | null;
}

/**
 * The signed-in account's scheduled deletion, or null when there is no
 * session or the account is not scheduled for deletion.
 */
export async function getPendingDeletion(
  options: { graceMs?: number } = {}
): Promise<PendingDeletion | null> {
  const current = await currentSession();
  const deletedAt = current?.user.deletedAt;
  if (!current || !deletedAt) return null;

  const deleted = new Date(deletedAt);
  const restorableUntil = new Date(
    deleted.getTime() + (options.graceMs ?? accountDeletionGraceMs())
  );
  return {
    userId: current.user.id,
    email: current.user.email,
    name: current.user.name ?? "",
    deletedAt: deleted,
    restorableUntil,
    restorable: Date.now() < restorableUntil.getTime(),
  };
}

/**
 * Restore the signed-in account. Only from a session signed in after the
 * account was deleted — deleting it ended every older one — and never
 * from an impersonation. Throws `ProfileServiceError`: `forbidden` with
 * no session, `not_scheduled` for an account that is not scheduled for
 * deletion, `restore_expired` once the grace period has ended, and
 * `reauthentication_required` for a session that is not a fresh sign-in.
 */
export async function restoreAccount(
  options: { graceMs?: number } = {}
): Promise<void> {
  const current = await currentSession();
  if (!current) {
    throw new ProfileServiceError("forbidden", "Not signed in.");
  }
  const pending = await getPendingDeletion(options);
  if (!pending) {
    throw new ProfileServiceError(
      "not_scheduled",
      "This account is not scheduled for deletion."
    );
  }
  if (!pending.restorable) {
    throw new ProfileServiceError(
      "restore_expired",
      "This account can no longer be restored."
    );
  }
  const signedInAt = current.session.createdAt
    ? new Date(current.session.createdAt).getTime()
    : 0;
  if (
    current.session.impersonatedBy ||
    signedInAt < pending.deletedAt.getTime()
  ) {
    throw new ProfileServiceError(
      "reauthentication_required",
      "Sign in again to restore your account."
    );
  }

  await db
    .update(users)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(users.id, pending.userId), isNotNull(users.deletedAt)));
  log.warn("Account restored by its user", { userId: pending.userId });
}

export type PurgeDeletedAccountsOptions = {
  /** Defaults to `accountDeletionGraceMs()`. */
  graceMs?: number;
  /** The most accounts one run purges. Default 100. */
  limit?: number;
  /**
   * Runs for each account before its row is deleted, while its id still
   * finds what references it — to erase what the framework cannot reach
   * from here, such as `eraseActorFromAuditEvents` from
   * `@intelligo-dev/audit`. A throw skips that account until the next run.
   */
  beforePurge?: (userId: string) => Promise<void>;
};

/**
 * Delete every account whose grace period has ended. Returns how many
 * were purged and the ids that failed (each is retried on the next run).
 */
export async function purgeDeletedAccounts(
  options: PurgeDeletedAccountsOptions = {}
): Promise<{ purged: number; failed: string[] }> {
  const cutoff = new Date(
    Date.now() - (options.graceMs ?? accountDeletionGraceMs())
  );
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)))
    .orderBy(users.deletedAt)
    .limit(options.limit ?? 100);

  let purged = 0;
  const failed: string[] = [];
  for (const { id } of due) {
    try {
      await options.beforePurge?.(id);
      await eraseUserFromMemoryAudit(id);
      await db
        .delete(users)
        .where(and(eq(users.id, id), isNotNull(users.deletedAt)));
      purged += 1;
    } catch (error) {
      failed.push(id);
      log.error("Purging a deleted account failed", {
        userId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { purged, failed };
}
