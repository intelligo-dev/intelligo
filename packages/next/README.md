# @intelligo-dev/next

The Next.js adapter: the one package in the framework that imports `next/*`.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/next
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

The two subpaths are separate so that binding the request context does not
load the configured Better-Auth server instance.

## Why a package

Every other `@intelligo-dev/*` package has to be usable from a queue worker, a
Hono API, a test, or a product built on something that is not Next. Keeping
every `next/*` import in one package — and having an architecture test refuse
it anywhere else — is what makes that true.

## Licence

Apache-2.0
