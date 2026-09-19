---
title: Auth, workspaces and roles
description: Guard your own pages, Server Actions and route handlers by session, workspace and role — and see how sign-in, invitations, workspace switching and platform admins work.
order: 5
---

A fresh install already signs users up, gives each one a personal workspace, and keeps every page under `(app)` behind a session. By the end of this page your own code knows who is calling, which workspace they are in, and whether their role allows the action.

## Guard first, then query

Three guards from `@intelligo-dev/auth` cover every server entry point. Each throws an `AuthGuardError` whose `code` is `unauthenticated`, `no_workspace` or `forbidden` — `isAuthGuardError(error)` narrows it, so a transport can answer 401, 404 or 403. None of them redirects.

| Guard                | Returns                                    | Throws                       |
| -------------------- | ------------------------------------------ | ---------------------------- |
| `requireAuth()`      | `{ session, user }`                        | `"Unauthorized"`             |
| `requireWorkspace()` | `{ session, user, workspace, membership }` | `"No active workspace"`      |
| `requireRole(roles)` | the same context                           | `"Insufficient permissions"` |

`workspace` is `{ id, name, slug, logo }` and `membership` is `{ id, role }`. With no session at all, `requireWorkspace()` throws `unauthenticated`, the same as `requireAuth()`. `requireRole` takes an array, such as `requireRole(["owner", "admin"])`, and passes when the member holds any of them.

A Server Action calls the guard, then filters by the workspace it returned:

```ts title="actions/reports.ts"
"use server";

import { requireWorkspace } from "@intelligo-dev/auth";
import { db, workspaceEq } from "@intelligo-dev/core/db";

import { reports } from "@/lib/db/schema";

export async function listReports() {
  const { workspace } = await requireWorkspace();

  return db
    .select()
    .from(reports)
    .where(workspaceEq(reports.workspaceId, workspace.id));
}
```

Every query on a workspace-owned table filters by `workspaceId`, and by `userId` too when the rows are private to one user. `withWorkspaceFilter(column, workspaceId, ...conditions)` adds your other conditions to the scope. The workspace id comes from the guard, never from the request body.

`getAuthSession()` and `getWorkspaceContext()` are the same reads without the throw: they return `null`. Use them where you choose the response yourself, such as a page that redirects or a route handler:

```ts title="app/api/reports/route.ts"
import { getWorkspaceContext } from "@intelligo-dev/auth";

export async function GET() {
  const context = await getWorkspaceContext();
  if (!context) return Response.json({ error: "unauthorized" }, { status: 401 });
  // query with context.workspace.id
}
```

## What each role may do

Workspace roles are `owner`, `admin` and `member`; whoever creates a workspace is its owner. The shipped services and actions enforce this:

| Action                                          | owner | admin | member |
| ----------------------------------------------- | ----- | ----- | ------ |
| List members and pending invitations            | yes   | yes   | yes    |
| Invite, cancel an invitation, remove a member   | yes   | yes   | no     |
| Change a member's role (to `admin` or `member`) | yes   | yes   | no     |
| Rename the workspace, change its slug or logo   | yes   | yes   | no     |
| Checkout, buy credits, open the billing portal  | yes   | no    | no     |
| Transfer ownership, delete the workspace        | yes   | no    | no     |
| Leave the workspace                             | yes\* | yes   | yes    |

\* The only owner cannot leave: `leaveWorkspace` throws `sole_owner` until `transferOwnership` has promoted another member. An invitation grants `admin` or `member`, never `owner`. The installed team page wires invite, cancel, remove, role change, leaving the workspace and transferring ownership. A transfer promotes the other member; you stay an owner until you leave.

## The proxy routes, the server checks

The scaffolded `proxy.ts` is next-intl's locale middleware and nothing else. The session check for everything under `(app)` runs in `app/[locale]/(app)/layout.tsx`: no session redirects to `/login`, unfinished onboarding to `/onboarding`.

For an earlier redirect, `hasSessionCookie(request)` from `@intelligo-dev/auth/edge` tells the proxy whether a session cookie is present. It neither verifies the cookie nor touches the database, so it picks a redirect and nothing more. A forged cookie gets past it and is rejected by the guards, which is why every action and route handler still calls one.

## Sign-in options

| Option             | On when                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| Email and password | Always                                                                  |
| Email verification | An email provider is configured; with none, sign-up does not require it |
| Password reset     | Always; the link goes through the same email provider                   |
| Google             | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set                   |
| GitHub             | `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set                   |

Without an email provider the verification link only reaches the server console, which is why it is not required then. The login and signup pages show a provider's button only when its variables are set; [Environment](/docs/getting-started/environment) lists them. Sessions last seven days and extend while in use.

In client components, import from `@intelligo-dev/auth/client`: `authClient`, plus `useSession`, `signIn`, `signUp` and `signOut` taken from it. Server code never imports this subpath.

## Invitations and the team service

`createTeamService(ports)` owns membership: `inviteMember`, `cancelInvitation`, `removeMember`, `updateMemberRole`, `acceptInvitation`, `rejectInvitation` and the lists. Each method authorizes itself. What the auth package must not know arrives as a port, bound in a file you own:

<!-- snippet: packages/registry/base/team-settings/lib/team.ts#team -->

```ts title="lib/team.ts"
export const team = createTeamService({
  checkMemberLimit: checkTeamMemberLimit,
  notifyMemberJoined: ({ workspaceId, memberName, memberEmail, ownerId }) =>
    triggerTeamMemberJoinedNotification({
      userId: ownerId,
      workspaceId,
      memberName,
      memberEmail,
    }),
});
```

`checkMemberLimit` is how a plan's seat count reaches invitations without `@intelligo-dev/auth` importing billing. The counts are `TEAM_MEMBER_LIMITS` in `lib/plans.ts`, which the [composition root](/docs/concepts/composition-root) registers with `registerTeamMemberLimits`; a plan left out of that map has one seat, so every invitation on it is refused.

[Plans and features](/docs/guides/plans-and-features) covers the rest of a plan. Leave `sendInvitationEmail` unbound: the auth server already sends the email, with a link to `/accept-invitation/<id>` that is valid for seven days.

Every failure is a `TeamServiceError` with a `code`: `member_limit_reached` (with `meta.limit`), `invitation_not_found`, `sole_owner`, `forbidden`, `invalid_input`, `accept_verification_failed` or `provider_error`. The installed `actions/team.ts` checks `isTeamServiceError(error)`, maps the code to a message in `messages/en/team-settings.json` and returns `{ success: false, error }`; anything unmapped gets the generic message, so internals never reach the UI. The pages are [team-settings](/blocks/team-settings) and [invitation-accept](/blocks/invitation-accept).

## Switching workspaces

The installed switcher calls `authClient.organization.setActive({ organizationId })`; on the server, `switchWorkspace(organizationId)` on the workspace service does the same. The choice persists in `sessions.activeOrganizationId`, and `requireWorkspace()` falls back to the user's first workspace when it is empty or no longer valid. When you call Better-Auth's organization API yourself, pass the `organizationId` from the guard rather than relying on the active one.

The first time a user gets a workspace, `ensureUserWorkspace` calls `onWorkspaceCreated` from `lib/workspace-bootstrap.ts` — the place for trial credits or a welcome notification. See [Config seams](/docs/registry/config-seams).

## Platform admins

A platform admin is a row, not a workspace role: `users.role` holds `platform-admin`. List emails in `PLATFORM_ADMIN_EMAILS`, comma-separated; `requirePlatformAdmin()` promotes a listed user into the column the first time it runs, and throws `"Insufficient permissions"` for anyone with neither. Never gate a cross-workspace surface on `owner`: every signup owns a workspace.

Impersonation goes through `startImpersonation({ targetUserId, reason })` and `stopImpersonation({ targetUserId })` from `@intelligo-dev/admin`. Starting requires a platform admin and a reason, writes the audit event first and aborts if it cannot be written, lasts at most 30 minutes, and refuses another admin as the target; stopping is audited too. `impersonateUser` in `@intelligo-dev/auth` verifies the caller is a platform admin and the target is not, but writes no audit event, so call the admin functions instead.

## Next

- [Plans and features](/docs/guides/plans-and-features) — seat counts and workspace limits per plan
- [Composition root](/docs/concepts/composition-root) — where ports are bound
- [Environment](/docs/getting-started/environment) — OAuth, email and admin variables
