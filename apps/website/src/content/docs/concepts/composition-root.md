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

`instrumentation.ts` calls it once per server process:

<!-- snippet: packages/cli/templates/app-scaffold/instrumentation.ts.tpl#register -->

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { composeIntelligo, seedIntelligo } = await import("./lib/intelligo");
    composeIntelligo();
    // The first request finds the plan and billing-settings rows in
    // place. A failure is already logged, and the next request retries.
    await seedIntelligo().catch(() => undefined);
  }
}
```

### Once per process is enough

Every framework registry — plans, features, model prices, the request-context source, the workspace bootstrap — lives on `globalThis`, keyed by a global symbol. A bundler that loads a package or `lib/intelligo.ts` twice still reaches the same maps, so what `register()` bound is what every page, Server Action and Route Handler in that process reads. An app needs no "ensure composed" import at the top of each module that reads a registry; composing in `instrumentation.ts` covers them all. Calling `composeIntelligo()` again is harmless — it binds once — which is why a Route Handler that a test or a worker may invoke without the instrumentation hook still calls it.

`globalThis` is per runtime, though. The Edge runtime is a separate global scope that `register()` does not compose (the scaffold composes only when `NEXT_RUNTIME` is `nodejs`), so code that runs on the Edge and reads a registry has to compose there itself. The scaffold's middleware reads none: it only redirects.

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
