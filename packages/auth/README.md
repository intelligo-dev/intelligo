# @intelligo-dev/auth

Multi-tenant authentication on Better-Auth: sign-up, workspaces, invitations and role-based access control.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli@beta create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/auth](https://intelligo.dev/docs/packages/auth).

## Install

```bash
pnpm add @intelligo-dev/auth@beta better-auth drizzle-orm zod
```

`better-auth`, `drizzle-orm` and `zod` are peers: the guards read the
Better-Auth instance and the database client the application already has.

## What it owns

Sessions and accounts, organizations as workspaces, membership roles
(`owner` / `admin` / `member`), invitations, platform-admin impersonation, and
the guards every transport starts with: `requireAuth`, `requireWorkspace`,
`requireRole`, `requirePlatformAdmin`.

The team, workspace, profile and onboarding services live here too, behind
ports the composition root binds — auth never imports billing.

## Use

```ts
import { requireWorkspace } from "@intelligo-dev/auth";

const { user, workspace, membership } = await requireWorkspace();
```

A guard that refuses throws an `AuthGuardError`; `isAuthGuardError(error)`
narrows it and `error.code` picks the status: `unauthenticated` (no session,
401), `no_workspace` (signed in, member of no workspace) or `forbidden`
(lacking the role, 403).

`impersonateUser` checks that the caller is a platform admin and that the
target is not one before it swaps the session. Products call
`startImpersonation` from `@intelligo-dev/admin`, which adds the audit event
and the mandatory reason.

`hasSessionCookie(request)` from `@intelligo-dev/auth/edge` is for an optional
optimistic redirect in a consumer's `proxy.ts`. It reads cookie presence only
and is never authorization; the scaffold does not use it.

Platform admin is a row (`users.role`), not an environment variable. The
allowlist in `PLATFORM_ADMIN_EMAILS` is promoted into that column on first use,
so the plugin and the guard cannot disagree.

## Licence

Apache-2.0
