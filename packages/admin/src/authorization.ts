import "server-only";

/**
 * Admin authorization.
 *
 * The console manages Intelligo's own concepts — workspaces,
 * entitlements, credits, executions, audit, jobs — not any product's
 * customer experience (ADR-0002). So its gate is deliberately NOT a
 * workspace role: `owner` is per-tenant, and every self-serve signup
 * owns their own workspace. Gating cross-tenant views on it is how the
 * platform-wide analytics leak in `getAdminStats` happened.
 *
 * Every entry point here goes through `requirePlatformAdmin`, and the
 * fact that a person reached the console at all is itself auditable —
 * a support engineer looking at a customer's ledger is an event
 * someone may later need to explain.
 */

import { requirePlatformAdmin } from "@intelligo/auth";
import { recordAuditEvent } from "@intelligo/audit";

export type AdminActor = {
  userId: string;
  email: string;
};

/**
 * Authorize an admin action and record that it happened.
 *
 * @param action dotted verb for the audit trail, e.g. "admin.executions.viewed"
 * @param resource what was looked at, when it identifies a tenant
 */
export async function requireAdmin(
  action: string,
  resource?: { kind: string; id?: string; workspaceId?: string }
): Promise<AdminActor> {
  const { user } = await requirePlatformAdmin();

  const actor: AdminActor = { userId: user.id, email: user.email ?? "" };

  // Non-blocking: an audit write failing must not deny a support
  // engineer access mid-incident. Destructive actions use
  // requireAdminOrRefuse below, where the opposite is true.
  await recordAuditEvent({
    workspaceId: resource?.workspaceId ?? null,
    actorId: actor.userId,
    actorKind: "support",
    action,
    resourceKind: resource?.kind ?? "admin",
    resourceId: resource?.id ?? null,
  });

  return actor;
}

/**
 * Authorize a destructive or impersonating action, refusing it if the
 * audit trail cannot be written.
 *
 * Reading a customer's data unrecorded is bad; changing it or acting
 * as them unrecorded is worse — there would be no way to answer "who
 * did this" afterwards. So here the audit write is part of the
 * contract, not a side effect.
 */
export async function requireAdminOrRefuse(
  action: string,
  resource: { kind: string; id?: string; workspaceId?: string }
): Promise<AdminActor> {
  const { user } = await requirePlatformAdmin();
  const actor: AdminActor = { userId: user.id, email: user.email ?? "" };

  const { recordAuditEventOrThrow } = await import("@intelligo/audit");
  await recordAuditEventOrThrow({
    workspaceId: resource.workspaceId ?? null,
    actorId: actor.userId,
    actorKind: "support",
    action,
    resourceKind: resource.kind,
    resourceId: resource.id ?? null,
  });

  return actor;
}
