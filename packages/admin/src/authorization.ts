import "server-only";

/**
 * The console's gate is the platform admin role, never a workspace role:
 * `owner` is per-tenant and every self-serve signup owns a workspace, so it
 * cannot guard cross-tenant views. Every entry point is audited.
 */

import { requirePlatformAdmin } from "@intelligo-dev/auth";
import {
  recordAuditEvent,
  recordAuditEventOrThrow,
} from "@intelligo-dev/audit";

export type AdminActor = {
  userId: string;
  email: string;
};

/**
 * The platform admin behind this request, recording the promotion when
 * `PLATFORM_ADMIN_EMAILS` just made one, so the trail says when and who.
 */
async function platformAdmin(): Promise<AdminActor> {
  const { user, promoted } = await requirePlatformAdmin();
  const actor: AdminActor = { userId: user.id, email: user.email ?? "" };
  if (promoted) {
    await recordAuditEvent({
      workspaceId: null,
      actorId: actor.userId,
      actorKind: "system",
      action: "admin.platform_admin.granted",
      resourceKind: "user",
      resourceId: actor.userId,
      metadata: { email: actor.email, via: "allowlist" },
    });
  }
  return actor;
}

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
  const actor = await platformAdmin();

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
  resource: { kind: string; id?: string; workspaceId?: string },
  metadata?: Record<string, unknown>
): Promise<AdminActor> {
  const actor = await platformAdmin();

  await recordAuditEventOrThrow({
    workspaceId: resource.workspaceId ?? null,
    actorId: actor.userId,
    actorKind: "support",
    action,
    resourceKind: resource.kind,
    resourceId: resource.id ?? null,
    ...(metadata ? { metadata } : {}),
  });

  return actor;
}
