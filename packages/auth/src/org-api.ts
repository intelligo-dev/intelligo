/**
 * Typed wrapper for Better-Auth organization plugin endpoints.
 *
 * The plugin endpoints (`/organization/...`) are added at runtime by
 * Better-Auth's organization plugin and are not present on the inferred
 * `auth.api` type. Without a wrapper, consumers had to reach for
 * `as any as Record<...>` casts or `@ts-expect-error` comments — both
 * lose all type information.
 *
 * This module declares the explicit input/output shapes for every
 * organization endpoint the team service calls and exposes them under
 * the plugin's HTTP path names (`/organization/invite-member`, etc.),
 * which is the vocabulary the rest of this package's `team/` module
 * uses.
 *
 * (Ported from the product application’s Better-Auth type wrapper as part of the
 * team-settings backend extraction — packages/auth owns the org-api
 * contract now; acme's copy is retired at cutover.)
 *
 * IMPORTANT — found while wiring the real-DB integration test for this
 * extraction: acme's original module built `orgApi` as
 * `auth.api as unknown as OrgApi`, i.e. a bare type-cast that assumes
 * `auth.api` is keyed by these HTTP path strings. It is not. Better-Auth's
 * organization plugin (`better-auth@1.6.30`,
 * `plugins/organization/organization.mjs`) exposes each endpoint on
 * `auth.api` under its own camelCase *server* id, which does not always
 * match the path or the *client* SDK name documented alongside it:
 *
 *   path                                  | auth.api key (server) | authClient.organization.* (client)
 *   /organization/invite-member           | createInvitation       | inviteMember
 *   /organization/get-invitation          | getInvitation          | getInvitation
 *   /organization/accept-invitation       | acceptInvitation       | acceptInvitation
 *   /organization/reject-invitation       | rejectInvitation       | rejectInvitation
 *   /organization/cancel-invitation       | cancelInvitation       | cancelInvitation
 *   /organization/remove-member           | removeMember           | removeMember
 *   /organization/update-member-role      | updateMemberRole       | updateMemberRole
 *   /organization/leave                   | leaveOrganization      | leave
 *   /organization/list                    | listOrganizations      | list
 *   /organization/set-active              | setActiveOrganization  | setActive
 *   /organization/list-user-invitations   | listUserInvitations    | listUserInvitations
 *
 * A bare `auth.api as unknown as OrgApi` cast type-checks (TypeScript
 * cannot see through the cast) but throws `TypeError: ... is not a
 * function` at runtime for every call whose row above differs in the
 * first two columns — i.e. invite-member, leave, list, and set-active
 * unconditionally, since their server ids aren't just a casing change
 * of the path. This was invisible in acme's test suite because
 * `actions/__tests__/team.test.ts` mocks `@/types/better-auth` (the
 * whole `orgApi` object) rather than exercising the cast against a
 * real `auth.api`, and only surfaced once this extraction's
 * `service.integration.test.ts` called the real thing. It is a live
 * bug in acme's shipped team-management actions today, not a
 * hypothetical — worth a fix there independent of this migration.
 *
 * `orgApi` below is therefore a real object, not a cast: each path key
 * forwards to the correctly-named `auth.api` method. The `OrgApi`
 * type and every call site elsewhere in this package (`team/service.ts`
 * and its tests) are unaffected — they only ever see the path-keyed
 * shape.
 */

import { auth } from "./server";

export interface OrgEndpointOptions<
  TBody = Record<string, unknown>,
  TQuery = Record<string, unknown>,
> {
  headers: Headers;
  body?: TBody;
  query?: TQuery;
}

export type OrgRole = "owner" | "admin" | "member";

export interface OrgListItem {
  id: string;
  name: string;
  slug?: string;
}

export interface OrgInvitation {
  id: string;
  email: string;
  role: OrgRole;
  status: "pending" | "accepted" | "rejected" | "canceled";
  expiresAt: string | Date;
  organizationId: string;
  organizationName?: string;
  inviterEmail?: string;
  inviterId?: string;
}

/**
 * Minimal member shape read off `auth.api.getFullOrganization()`.
 * `getFullOrganization` is not part of the org-plugin's typed
 * `/organization/...` surface — it lives on the base `auth.api` — so
 * it is called directly rather than through `orgApi` below.
 */
export interface OrgMember {
  id?: string;
  userId: string;
  role: string;
}

export interface OrgApi {
  "/organization/invite-member": (
    opts: OrgEndpointOptions<{
      email: string;
      role: Exclude<OrgRole, "owner">;
      organizationId: string;
    }>
  ) => Promise<OrgInvitation | null>;

  "/organization/get-invitation": (
    opts: OrgEndpointOptions<never, { id: string }>
  ) => Promise<OrgInvitation>;

  "/organization/accept-invitation": (
    opts: OrgEndpointOptions<{ invitationId: string }>
  ) => Promise<unknown>;

  "/organization/reject-invitation": (
    opts: OrgEndpointOptions<{ invitationId: string }>
  ) => Promise<unknown>;

  "/organization/cancel-invitation": (
    opts: OrgEndpointOptions<{ invitationId: string }>
  ) => Promise<unknown>;

  "/organization/remove-member": (
    opts: OrgEndpointOptions<{
      memberIdOrEmail: string;
      organizationId: string;
    }>
  ) => Promise<unknown>;

  "/organization/update-member-role": (
    opts: OrgEndpointOptions<{
      memberId: string;
      role: OrgRole;
      organizationId: string;
    }>
  ) => Promise<unknown>;

  "/organization/leave": (
    opts: OrgEndpointOptions<{ organizationId: string }>
  ) => Promise<unknown>;

  "/organization/list": (
    opts: OrgEndpointOptions
  ) => Promise<OrgListItem[] | null>;

  "/organization/set-active": (
    opts: OrgEndpointOptions<{ organizationId: string }>
  ) => Promise<unknown>;

  "/organization/list-user-invitations": (
    opts: OrgEndpointOptions
  ) => Promise<OrgInvitation[] | null>;
}

/**
 * `auth.api`'s organization-plugin methods are typed loosely by
 * Better-Auth (broad `Record<string, unknown>`-ish body/query types
 * driven by its own zod schemas) — each is cast to its specific
 * `OrgApi` member signature at the point of use below, which is the
 * same trust boundary the rest of this codebase already accepts for
 * these calls (see the module doc comment above for why a *blanket*
 * cast is not safe: it hides the wrong key entirely, whereas casting
 * per-member here only relaxes the parameter/return types).
 */
const api = auth.api as unknown as Record<
  string,
  (opts: OrgEndpointOptions<never, never>) => Promise<unknown>
>;

export const orgApi: OrgApi = {
  "/organization/invite-member":
    api.createInvitation as OrgApi["/organization/invite-member"],
  "/organization/get-invitation":
    api.getInvitation as OrgApi["/organization/get-invitation"],
  "/organization/accept-invitation":
    api.acceptInvitation as OrgApi["/organization/accept-invitation"],
  "/organization/reject-invitation":
    api.rejectInvitation as OrgApi["/organization/reject-invitation"],
  "/organization/cancel-invitation":
    api.cancelInvitation as OrgApi["/organization/cancel-invitation"],
  "/organization/remove-member":
    api.removeMember as OrgApi["/organization/remove-member"],
  "/organization/update-member-role":
    api.updateMemberRole as OrgApi["/organization/update-member-role"],
  "/organization/leave": api.leaveOrganization as OrgApi["/organization/leave"],
  "/organization/list": api.listOrganizations as OrgApi["/organization/list"],
  "/organization/set-active":
    api.setActiveOrganization as OrgApi["/organization/set-active"],
  "/organization/list-user-invitations":
    api.listUserInvitations as OrgApi["/organization/list-user-invitations"],
};
