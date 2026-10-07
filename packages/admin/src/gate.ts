import "server-only";

import { requirePlatformAdmin } from "@intelligo-dev/auth";

/**
 * The read models are cross-tenant, so each checks for itself that a
 * platform admin is asking: a page that forgot `requireAdmin` refuses
 * rather than listing every tenant. Records nothing — the page's
 * `requireAdmin` records the visit.
 */
export async function assertPlatformAdmin(): Promise<void> {
  await requirePlatformAdmin();
}
