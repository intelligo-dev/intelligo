# @intelligo-dev/admin

The operational console: cross-tenant queries, health probes and impersonation.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/admin@beta
```

Intelligo-owned rather than consumer-owned source, and deliberately excluded
from the page registry: what an operator can see across every tenant is not a
per-product decision.

Every query is gated behind `requireAdmin`, which reads `users.role` rather
than an environment variable. Products contribute their own integration checks
with `registerIntegrationProbe`.

## Licence

Apache-2.0
