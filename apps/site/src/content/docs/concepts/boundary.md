---
title: The boundary
description: Intelligo owns the SaaS infrastructure around an AI product. The agent — and the framework you build it with — stays yours and stays native.
order: 1
---

An AI product is two halves. The interesting half is your agent: the prompts, the tools, the domain knowledge nobody else has. The other half is the same in every AI SaaS — who is signed in, which workspace they belong to, whether their plan allows this request, what it cost, who to bill, and what to tell an auditor later.

Intelligo ships the second half and stays out of the first.

## What Intelligo owns

- **Identity and tenancy** — sessions, workspaces, roles, invitations, platform admin
- **Commerce** — plans, feature gates, quotas, credits with reservations, trials, Stripe and regional payment providers
- **Execution accounting** — every AI run admitted, settled or failed, with usage, cost and audit records
- **Persistence contracts** — conversations, documents, identity facts, notifications
- **Operations** — a Postgres job queue, append-only audit events, the admin console, the CLI
- **The page registry** — the pages for all of the above, installed as your source

## What stays yours

- **The AI framework**, used natively: Mastra, the Vercel AI SDK, or anything else
- **Prompts, tools, workflows, memory, retrieval and evals**
- **Product data** — your own tables beside the framework's
- **Every installed page** — consumer-owned source from the moment it lands

## No agent abstraction, on purpose

There is no `IntelligoAgent`, no `IntelligoTool`, no wrapper around your model calls ([ADR-0003](https://github.com/intelligo-mn/framework/blob/main/docs/adr/0003-ai-framework-boundary.md)). Intelligo records only the narrow boundary of a run — actor, workspace, capability, entitlement, status, usage, cost — through a lifecycle you call from your own code:

```ts
const run = await executions.begin({ workspaceId, userId, capability: "support.reply" });
if (!run.allowed) return refuse(run.reason);
try {
  const result = await supportAgent.generate(messages); // native, untouched
  await run.complete({ usage: result.usage, model: result.model });
} catch (error) {
  await run.fail({ error });
  throw error;
}
```

Competing with agent frameworks on abstractions would couple every product to the framework's runtime limits. Bracketing a run couples it to nothing.

## Rules that keep the boundary

- **No product vocabulary in a framework package.** A change that needs one is a missing port or registry — and that is the better change.
- **Business logic lives in package services behind ports.** Server Actions and Route Handlers are thin callers.
- **Tenant scoping is inside the service.** Every query filters `workspaceId`, and `userId` where the data is user-private; transports gate with `requireWorkspace` / `requireRole` first.
- **Middleware only redirects.** The authoritative checks are server-side, and middleware never touches the database.
- **The rules are tests.** Dependency direction, tenant scoping, registry hygiene and model-id registration fail the build when violated.
