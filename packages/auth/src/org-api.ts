/**
 * Typed access to Better-Auth's organization-plugin endpoints, which the
 * inferred `auth.api` type does not include. Keys are the plugin's HTTP
 * paths; each forwards to the plugin's server id, which is not always the
 * path in camelCase (`/organization/invite-member` is `createInvitation`,
 * `/organization/list` is `listOrganizations`), so a blanket cast of
 * `auth.api` would type-check and then throw "is not a function".
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
 * Better-Auth types these methods loosely; each is cast to its `OrgApi`
 * member signature below, which relaxes only parameter and return types,
 * never which method a key names.
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
