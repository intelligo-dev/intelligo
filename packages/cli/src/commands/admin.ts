/**
 * `intelligo admin grant <email>` and `intelligo admin revoke <email>`
 *
 * Makes a signed-up user a platform admin by writing `users.role`, the
 * column every admin check reads. `PLATFORM_ADMIN_EMAILS` does the same on
 * first use, but only for a verified address, and a development setup
 * without an email provider never verifies one; this is the way in there.
 *
 * The grant is recorded as an `admin.platform_admin.granted` audit event
 * in the same transaction, a revoke as `admin.platform_admin.revoked`.
 * Against a production environment either refuses unless `--force` says
 * the operator means it. A revoked address still in
 * `PLATFORM_ADMIN_EMAILS` is promoted again on its next visit, so revoke
 * says so.
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

export type RevokeResult =
  | { status: "revoked"; userId: string; email: string; allowlisted: boolean }
  | { status: "not_admin"; userId: string; email: string }
  | { status: "not_found"; email: string }
  | { status: "refused"; email: string };

export async function revokePlatformAdmin(
  email: string,
  query: QueryFn,
  options: { production: boolean; force?: boolean; allowlist?: string }
): Promise<RevokeResult> {
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
  if (!roles.includes(PLATFORM_ADMIN_ROLE)) {
    return { status: "not_admin", userId, email: found };
  }
  const rest = roles.filter((r) => r !== PLATFORM_ADMIN_ROLE);

  await query("BEGIN");
  try {
    await query(
      `UPDATE users SET role = $2, updated_at = now() WHERE id = $1`,
      [userId, rest.length > 0 ? rest.join(",") : "user"]
    );
    await query(
      `INSERT INTO audit_events (id, actor_kind, action, resource_kind, resource_id, metadata)
       VALUES ($1, 'system', 'admin.platform_admin.revoked', 'user', $2, $3)`,
      [randomUUID(), userId, JSON.stringify({ email: found, via: "cli" })]
    );
    // Sessions opened as an admin end with the role.
    await query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
  const allowlisted = (options.allowlist ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .includes(found.toLowerCase());
  return { status: "revoked", userId, email: found, allowlisted };
}

export function formatRevokeResult(r: RevokeResult): string {
  switch (r.status) {
    case "revoked":
      return r.allowlisted
        ? `✓ ${r.email} is no longer a platform admin, but PLATFORM_ADMIN_EMAILS ` +
            `still lists the address and will promote it again on its next ` +
            `visit. Remove it there too.`
        : `✓ ${r.email} is no longer a platform admin; its sessions have ended.`;
    case "not_admin":
      return `✓ ${r.email} is not a platform admin.`;
    case "not_found":
      return `✗ No user with the address ${r.email}.`;
    case "refused":
      return (
        `✗ NODE_ENV is production. Pass --force to revoke platform admin ` +
        `there.`
      );
  }
}

export function revokeExitCode(r: RevokeResult): number {
  return r.status === "revoked" || r.status === "not_admin" ? 0 : 1;
}
