---
title: Composition root and ports
description: One explicit file wires the application together. Packages take ports instead of importing each other, and nothing registers itself on import.
order: 2
label: Composition root
---

## One composition root

`lib/intelligo.ts` is the single place an application wires itself together. `create` generates it once; after that it is yours.

<!-- snippet: packages/cli/templates/app-scaffold/intelligo.ts.tpl#composeIntelligo -->

```ts title="lib/intelligo.ts"
export function composeIntelligo(): void {
  if (!composed) {
    composed = true;
    bind();
  }
  // Every call checks the seed, so a database that was unreachable at
  // boot is seeded by the first request after it comes back.
  seedIntelligo().catch((error: unknown) => {
    log.error("Seeding the plan and billing-settings rows failed", {
      error,
    });
  });
}
```

`instrumentation.ts` calls it once per server process.

## Import side effects are banned

A registration that silently does not happen looks exactly like one that did. So no package populates a registry when it is imported — plans, features, models, renderers and document patterns are all registered explicitly, from the root.

## Ports over dependencies

Packages never reach sideways. `@intelligo-dev/auth` does not import billing; `@intelligo-dev/executions` does not either, and its `/pricing` subpath imports nothing at all. Instead a service takes **ports** — functions it calls — and the composition root binds them:

<!-- snippet: packages/cli/templates/app-scaffold/intelligo.ts.tpl#executions -->

```ts title="lib/intelligo.ts"
export const executions = createBillingExecutions();
```

The same pattern binds `checkMemberLimit` for the team service, `onAccountDeleted` for the profile service, and so on. Swap a port and the service follows; no package has to change.

## One package imports Next.js

Only `@intelligo-dev/next` imports `next/*`. The framework reads a request's headers through `@intelligo-dev/core/request-context`, and the root binds where they come from — `setRequestContextSource(nextRequestContext)`. Everything else stays usable from a queue worker, a Hono API or a test.

## Two thin transports

- **Server Actions** for internal UI mutations: parse → call a service → map its typed error to the UI's shape → revalidate.
- **Route Handlers** for streaming, auth, webhooks, uploads, cron and external clients.

Neither holds business rules. Those live in the package services, tested against a real database.
