# app

The executable specification for Intelligo, and the only consumer of
the packages that is not Acme. It exists to answer one question
empirically: **can a product be built on these packages without Support
in the room?** Anything it cannot do without reaching into a private
package or editing a framework file is a boundary defect, not a
missing feature here.

It is deliberately small and deliberately generic. It is not a second
product, not a demo, and not a place to prototype Acme features.

It has a second, equally load-bearing role: it is the **canonical
installed result of the Intelligo registry** (ADR-0010).
Every registry item lands here the same way it would in any consumer's
repository — via `shadcn add`, never hand-written — so a hand-maintained
parallel implementation drifting from what `shadcn build` actually
produces is itself a defect this app exists to catch.

## What it demonstrates

- signup / login / workspace creation (`@intelligo/auth`)
- an assistant route that runs a model call inside the execution
  boundary — entitlement, credit hold, usage, cost, audit
  (`@intelligo/executions`)
- plans and feature gates registered by the _app_, not baked into
  billing (`@intelligo/billing` + the plan registry)
- usage and execution history read back through the packages' own
  query APIs
- real registry items — pages, components, actions — installed
  verbatim from `registry/`, wired to this app's own backend
  composition

## Consuming the registry

`components.json` follows the product application's conventions (style
`new-york`, `rsc: true`, base color `neutral`, CSS variables, aliases
under `@/`). Tailwind v4, `lib/utils.ts` (`cn`), and the local shadcn
primitives in `components/ui/` exist so a registry item's
`registryDependencies` resolve the same way they would in a consumer
project outside this monorepo. The design tokens in `app/globals.css`
are a consumer-owned copy of `packages/ui/src/tokens.css` — this app
does not import `@intelligo/ui` at runtime for styling, because a
registry consumer outside the monorepo can't either.

## What it must never do

- import from `private/*`
- use Support vocabulary in its plans, features, or copy
- work around a package by reaching into its internals
- maintain a page or component that a registry item should have
  installed instead

The dependency-direction test enforces the first; the registry
architecture test enforces the no-orphans/no-private-imports checks on
`registry/`; review enforces the rest.
