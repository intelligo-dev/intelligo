/**
 * Settings that keep the auth endpoints behind the framework's services
 * and tell the rate limiter who a request is from. Pure, so they are
 * testable without starting Better-Auth.
 */

/**
 * Organization endpoints the team and workspace services wrap. Called
 * over HTTP they would skip what the services apply around them — the
 * plan's member and workspace limits, the subscription cancelled before
 * a workspace is deleted, the refusal to leave or delete a last
 * workspace — so the router answers them 404. The services call the
 * same endpoints server-side through `auth.api`, which the router never
 * sees. `set-active` and the reads stay open: the workspace switcher
 * calls `set-active` from the browser.
 */
export const SERVICE_ONLY_ORGANIZATION_PATHS = [
  "/organization/create",
  "/organization/update",
  "/organization/delete",
  "/organization/invite-member",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/cancel-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
  "/organization/leave",
] as const;

/**
 * Admin endpoints the framework wraps: impersonation goes through
 * `impersonateUser` (the allowlist check) and `@intelligo-dev/admin`'s
 * `startImpersonation` (the reason and the audit event).
 */
export const SERVICE_ONLY_ADMIN_PATHS = ["/admin/impersonate-user"] as const;

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Where the client's address is read from. `AUTH_IP_HEADERS` names the
 * headers in order (default `x-forwarded-for`); `AUTH_TRUSTED_PROXIES`
 * lists the proxies in front of the app (CIDRs), so a forwarded chain is
 * read up to the first hop that is not one of them. Behind more than one
 * proxy without it, no client address resolves and every client shares
 * one rate-limit bucket.
 */
export function ipAddressOptions(env: Record<string, string | undefined>): {
  ipAddressHeaders?: string[];
  trustedProxies?: string[];
} {
  const headers = list(env.AUTH_IP_HEADERS).map((h) => h.toLowerCase());
  const proxies = list(env.AUTH_TRUSTED_PROXIES);
  return {
    ...(headers.length > 0 ? { ipAddressHeaders: headers } : {}),
    ...(proxies.length > 0 ? { trustedProxies: proxies } : {}),
  };
}

/**
 * Why a display name is refused, or null when it is fine. A user's name
 * reaches other people's inboxes (an invitation names its inviter, a
 * personal workspace is named after its owner), so the server holds it
 * to what the sign-up form allows — at most 50 characters — and keeps
 * links out of it.
 */
export function displayNameProblem(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length > 50) return "A name is at most 50 characters.";
  if (/:\/\/|\bwww\./i.test(trimmed)) return "A name cannot contain a link.";
  return null;
}
