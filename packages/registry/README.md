# @intelligo-dev/registry

The source of the Intelligo page registry: `registry.json` (the official shadcn
registry schema) and `base/<item>/**`, one directory per item.

**Never published.** Items are not a runtime dependency; they install into an
application as consumer-owned source through the standard shadcn CLI
. This directory is a private workspace so the toolchain
owns it — its own dependencies, `lint`, `type-check` and a turbo task the site
and the CLI build on — and it lives under `packages/` because that is where a
Turborepo keeps private tooling workspaces.

```bash
pnpm registry:build                       # → packages/registry/public/r/*.json
pnpm --filter @intelligo-dev/registry lint
```

`apps/site` publishes the built items at `https://intelligo.dev/r/<item>.json`;
a checkout can install straight from the built artifacts:

```bash
cd apps/app && pnpm exec shadcn add "$PWD/../../packages/registry/public/r/<item>.json" --yes
```

`requires.json` records what the shadcn schema cannot: which items and scaffold
files each item imports, and the feature keys it gates on.
`tests/architecture/registry.test.ts` proves it matches the code.
