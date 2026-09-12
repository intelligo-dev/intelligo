# @intelligo-dev/auth

Multi-tenant authentication, workspaces and RBAC on Better-Auth.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/auth
```

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

Platform admin is a row (`users.role`), not an environment variable. The
allowlist in `PLATFORM_ADMIN_EMAILS` is promoted into that column on first use,
so the plugin and the guard cannot disagree.

## Licence

Apache-2.0
