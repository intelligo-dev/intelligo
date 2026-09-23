# @intelligo-dev/next

The Next.js adapter: the one Intelligo package that imports next/*, binding request context, auth routes and Route Handler guards.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli@beta create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/next](https://intelligo.dev/docs/packages/next).

## Install

```bash
pnpm add @intelligo-dev/next@beta
```

`next` and `better-auth` are peers: the adapter binds into the copies your
application already has.

## Use

Tell the framework where a request's headers come from — once, from the
composition root:

```ts
// lib/intelligo.ts
import { setRequestContextSource } from "@intelligo-dev/core/request-context";
import { nextRequestContext } from "@intelligo-dev/next";

setRequestContextSource(nextRequestContext);
```

Mount Better-Auth's HTTP handlers:

```ts
// app/api/auth/[...all]/route.ts
export { GET, POST } from "@intelligo-dev/next/auth";
```

Guard a Route Handler. The wrapper resolves the caller first and answers a
failed check itself — `401` without a session, `403` without a workspace or
the role, with `{ "error": <code> }` as the body. What the handler throws
propagates unchanged:

```ts
// app/api/invoices/route.ts
import { withRole } from "@intelligo-dev/next/route";

export const GET = withRole(["owner", "admin"], async (request, { workspace }) =>
  Response.json(await listInvoices(workspace.id))
);
```

`withAuth` needs only a session, `withWorkspace` an active workspace.

`ActionResult<T>` is the shape a Server Action returns to its form —
`{ success: true, data }` or `{ success: false, error }` — shared by every
registry item's actions:

```ts
import type { ActionResult } from "@intelligo-dev/next";
```

The subpaths are separate so that binding the request context does not load
the configured Better-Auth server instance.

## Why a package

Every other `@intelligo-dev/*` package has to be usable from a queue worker, a
Hono API, a test, or a product built on something that is not Next. Keeping
every `next/*` import in one package — and having an architecture test refuse
it anywhere else — is what makes that true.

## Licence

Apache-2.0
