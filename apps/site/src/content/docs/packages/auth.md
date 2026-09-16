---
title: "@intelligo-dev/auth"
description: "Multi-tenant authentication, workspaces, roles and invitations on Better-Auth."
order: 2
label: auth
---

## Install

```bash
pnpm add @intelligo-dev/auth
```

## Capabilities

- Email/password and OAuth sign-in, email verification, password reset — and the transactional emails behind them
- Multi-tenant workspaces (owner / admin / member) on Better-Auth's organization model, with an active workspace that persists across requests
- The full invitation lifecycle: duplicate prevention, expiry, cancellation, and acceptance with pre- **and** post-verification so a forged id cannot join a workspace — idempotent on retry
- Role changes, member removal, sole-owner protection, ownership transfer, plan-limited workspace creation
- Ports-based services (`createTeamService`, `createWorkspaceService`, `createProfileService`, `createOnboardingService`) with typed errors, unit **and** real-database test suites
- Platform admin is a database row, not an env var — with audited impersonation

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

[npm](https://www.npmjs.com/package/@intelligo-dev/auth) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/auth)
