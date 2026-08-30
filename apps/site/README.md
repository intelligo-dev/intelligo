# intelligo.dev

The public site of the [Intelligo framework](https://github.com/intelligo-mn/framework), built with Astro (static) + React islands + Tailwind 4. It also serves the framework's **page registry** at `https://intelligo.dev/r/<item>.json`, which is what `shadcn add` installs from.

```bash
pnpm install
pnpm dev          # http://localhost:4003
pnpm build        # dist/
pnpm type-check   # astro check
```

## Keeping it truthful

Everything the site says about the framework — the registry items, the test/ADR/page counts, the commit history — is pulled from the framework repository by one script and **committed**, so a deploy needs no sibling checkout and the site cannot list a page that does not exist:

```bash
# expects ../intelligo-framework (and, for the commit history, ../intelligo);
# override with INTELLIGO_FRAMEWORK_DIR / INTELLIGO_INCUBATION_DIR
pnpm sync
```

It writes `src/data/registry.json`, `src/data/proof.json` and `public/r/*.json` (run `pnpm registry:build` in the framework first so the built items exist), and installs the registry items' real client components into `src/showcase/app/` — the hero walkthrough and the registry explorer render those, not mock-ups. Four import specifiers are rewritten on install so they run outside Next.js (`@/` → `@showcase/`, `next-intl` → `use-intl`, `next/navigation` and `@intelligo-dev/auth/client` → shims); `src/showcase/overrides/` holds the shims, type stubs and stand-in server actions with fixture data, and is copied last. Re-run `pnpm sync` after a framework release and commit the result.

## Pages

- `/` — the homepage: hero, the reference app, the 30/70 model, the execution boundary, consumer-owned UI, architecture, not-a-boilerplate, engineering proof, quickstart, FAQ, CTA. One question per section (`src/pages/index.astro`).
- `/pages` — the registry explorer, every page family with its install command.
- `/architecture` — the full package graph, the architecture rules as tests, ownership, ADRs.
- `/why-intelligo` — the other half counted in full, and the agent objection.
- `/compare` — the alternatives.
- `/r/<item>.json` — the hosted registry.

Every command the homepage shows is verified against the published packages: `pnpm dlx @intelligo-dev/cli@beta create`, `pnpm exec shadcn add https://intelligo.dev/r/<item>.json`, `pnpm dev`. The scaffold's `components.json` ships an empty `registries` map, so the URL form is the one that works — do not document `shadcn add @intelligo-dev/<item>` until a namespace is configured.

See [BRIEF.md](BRIEF.md) for the copywriting brief.
