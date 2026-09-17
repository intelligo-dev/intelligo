# app

The executable specification for Intelligo, and the one consumer of
the packages that lives in this repository. It exists to answer one
question empirically: **can a product be built on these packages
without any real product's domain in the room?** Anything it cannot do
without editing a framework file is a boundary defect, not a missing
feature here.

It is deliberately small and deliberately generic. It is not a second
product, not a demo, and not a place to prototype product features.

It has a second, equally load-bearing role: it is the **canonical
installed result of the Intelligo registry**.
Every registry item lands here the same way it would in any consumer's
repository — via `shadcn add`, never hand-written — so a hand-maintained
parallel implementation drifting from what `shadcn build` actually
produces is itself a defect this app exists to catch.

## What it demonstrates

- signup / login / workspace creation (`@intelligo-dev/auth`)
- an assistant route that runs a model call inside the execution
  boundary — entitlement, credit hold, usage, cost, audit
  (`@intelligo-dev/executions`)
- plans and feature gates registered by the _app_, not baked into
  billing (`@intelligo-dev/billing` + the plan registry)
- usage and execution history read back through the packages' own
  query APIs
- real registry items — pages, components, actions — installed
  verbatim from `registry/`, wired to this app's own backend
  composition

## Consuming the registry

The design tokens in `app/globals.css` are the `intelligo` registry base:
shadcn base-nova with status, layer and motion tokens, exactly
what `shadcn add https://intelligo.dev/r/intelligo.json` writes. They are
consumer-owned; re-value them to re-theme every installed page.

## What it must never do

- import an `@intelligo-dev/*` package this repository does not publish
- use a real product's vocabulary in its plans, features, or copy
- work around a package by reaching into its internals
- maintain a page or component that a registry item should have
  installed instead

The dependency-direction test enforces the first; the registry
architecture test enforces the no-orphans/no-private-imports checks on
`registry/`; review enforces the rest.
