/**
 * `intelligo admin grant <email>`
 *
 * Makes a signed-up user a platform admin by writing `users.role`, the
 * column every admin check reads. `PLATFORM_ADMIN_EMAILS` does the same on
 * first use, but only for a verified address, and a development setup
 * without an email provider never verifies one; this is the way in there.
 *
 * The grant is recorded as an `admin.platform_admin.granted` audit event
 * in the same transaction. Against a production environment the command
 * refuses unless `--force` says the operator means it.
 */

import { randomUUID } from "node:crypto";

/** The role `@intelligo-dev/auth` reads (`PLATFORM_ADMIN_ROLE`). */
export const PLATFORM_ADMIN_ROLE = "platform-admin";

export type GrantResult =
  | { status: "granted"; userId: string; email: string }
  | { status: "already"; userId: string; email: string }
  | { status: "not_found"; email: string }
  | { status: "refused"; email: string };

type QueryFn = (
  sql: string,
  params?: unknown[]
) => Promise<Array<Record<string, unknown>>>;

export async function grantPlatformAdmin(
  email: string,
  query: QueryFn,
  options: { production: boolean; force?: boolean }
): Promise<GrantResult> {
  if (options.production && !options.force) {
    return { status: "refused", email };
  }

  const [user] = await query(
    `SELECT id, email, role FROM users WHERE lower(email) = lower($1)`,
    [email.trim()]
  );
  if (!user) return { status: "not_found", email };

  const userId = String(user.id);
  const found = String(user.email);
  const roles = String(user.role ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (roles.includes(PLATFORM_ADMIN_ROLE)) {
    return { status: "already", userId, email: found };
  }

  await query("BEGIN");
  try {
    await query(
      `UPDATE users SET role = $2, updated_at = now() WHERE id = $1`,
      [userId, [...roles, PLATFORM_ADMIN_ROLE].join(",")]
    );
    await query(
      `INSERT INTO audit_events (id, actor_kind, action, resource_kind, resource_id, metadata)
       VALUES ($1, 'system', 'admin.platform_admin.granted', 'user', $2, $3)`,
      [randomUUID(), userId, JSON.stringify({ email: found, via: "cli" })]
    );
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
  return { status: "granted", userId, email: found };
}

export function formatGrantResult(r: GrantResult): string {
  switch (r.status) {
    case "granted":
      return (
        `✓ ${r.email} is a platform admin. Sign in again if a session was ` +
        `open, then visit /admin.`
      );
    case "already":
      return `✓ ${r.email} is already a platform admin.`;
    case "not_found":
      return `✗ No user with the address ${r.email}. Sign up with it first, then run this again.`;
    case "refused":
      return (
        `✗ NODE_ENV is production. Granting platform admin there is ` +
        `normally PLATFORM_ADMIN_EMAILS's job; pass --force if you mean it.`
      );
  }
}

export function grantExitCode(r: GrantResult): number {
  return r.status === "granted" || r.status === "already" ? 0 : 1;
}
