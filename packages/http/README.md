# @intelligo-dev/http

Where request-scoped context comes from, so the rest of the framework
does not have to import a web framework to find out.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/http
```

## Why

`@intelligo-dev/auth` needs the incoming request's headers to resolve a
session, and it used to get them by importing `next/headers` in five files.
That made a package whose subject is authentication unusable outside Next: a
queue worker checking a session, a Hono API, a test that is not running inside
a request.

The framework now asks through `getRequestHeaders()`, and the application says
where they come from — once.

## Use

```ts
// lib/intelligo.ts
import { setRequestContextSource } from "@intelligo-dev/http";
import { nextRequestContext } from "@intelligo-dev/http/next";

setRequestContextSource(nextRequestContext);
```

Outside a request — a background job replaying a webhook, a script acting as a
user — bind them explicitly:

```ts
import { withRequestHeaders } from "@intelligo-dev/http";

await withRequestHeaders(new Headers({ cookie }), () => requireWorkspace());
```

`@intelligo-dev/http/next` is the only file in the framework that imports
`next/*`, and an architecture test keeps it that way. `next` is an optional
peer: installing this package does not require Next, and that subpath is simply
not importable without it.

## Licence

Apache-2.0
