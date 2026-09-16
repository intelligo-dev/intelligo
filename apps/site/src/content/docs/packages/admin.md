---
title: "@intelligo-dev/admin"
description: "The operational console: cross-tenant queries, health probes and audited impersonation."
order: 9
label: admin
---

## Install

```bash
pnpm add @intelligo-dev/admin
```

Intelligo-owned rather than consumer-owned source, and deliberately excluded
from the page registry: what an operator can see across every tenant is not a
per-product decision.

Every query is gated behind `requireAdmin`, which reads `users.role` rather
than an environment variable. Products contribute their own integration checks
with `registerIntegrationProbe`.

[npm](https://www.npmjs.com/package/@intelligo-dev/admin) · [source](https://github.com/intelligo-mn/framework/tree/main/packages/admin)
