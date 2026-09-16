---
title: Package topology
description: Why the framework is the packages it is — one package per runtime target, shared modules as subpaths, and imports that point one way.
order: 5
---

The [package list](/docs/packages) is generated from the repository. The rules behind it are not; they change only deliberately.

## One package per runtime target

A package exists when it has a runtime target, a peer dependency or an adapter of its own. `next` is a package because it is the only code that imports `next/*`; `mastra` is a package because it has Mastra as an optional peer; `cli` is a package because it is a binary.

Shared pure-TypeScript modules are **subpaths**, not packages. That is why money, prompt sanitisation and request context are `@intelligo-dev/core/money`, `/prompt` and `/request-context`, and why billing's `/plans`, `/plan-registry`, `/payment` and `/quota-types` can reach a client bundle without pulling in Stripe or `server-only`. An architecture test walks those subpaths' imports.

## Imports point one way

`core` imports no other framework package. `auth` never imports `billing`, and `executions` imports nothing: services meet through ports bound in your [composition root](/docs/concepts/composition-root). Only `next` imports `next/*`, so every other package runs from a worker, a test or a non-Next server. The dependency-direction test fails the build otherwise; [/architecture](/architecture) draws the real graph.

## No product vocabulary

A publishability test audits every published package for licence metadata, credentials and product-specific language. A change that needs a product's words inside a package is a missing port or registry.

## Everything publishes together

Every package under `packages/` is published at one version by one release commit, except `packages/registry`, a private workspace whose items reach you through the [registry](/docs/registry) instead.
