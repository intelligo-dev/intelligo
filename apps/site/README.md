# intelligo.dev

The public site of the Intelligo framework — `apps/site` in the framework repository — built with Astro (static) + React islands + Tailwind 4. It also serves the framework's **page registry** at `https://intelligo.dev/r/<item>.json`, which is what `shadcn add` installs from.

```bash
pnpm install                  # from the repository root
pnpm --filter site dev        # http://localhost:4003
pnpm --filter site build      # apps/site/dist/
pnpm --filter site type-check # astro check
```

## Keeping it truthful

Everything the site says about the framework — the registry items, the test/ADR/page counts, the published version — is pulled from the repository the site lives in by one script and **committed**, so a deploy needs nothing but this directory and the site cannot list a page that does not exist:

```bash
pnpm registry:build           # repository root: build the items into registry/public/r
pnpm --filter site sync       # reads ../../registry, ../../packages, ../../apps/app;
                              # override the root with INTELLIGO_FRAMEWORK_DIR
```

It writes `src/data/registry.json`, `src/data/proof.json` and `public/r/*.json`, and installs the registry items' real client components into `src/showcase/app/` — the hero walkthrough and the registry explorer render those, not mock-ups. Four import specifiers are rewritten on install so they run outside Next.js (`@/` → `@showcase/`, `next-intl` → `use-intl`, `next/navigation` and `@intelligo-dev/auth/client` → shims); `src/showcase/overrides/` holds the shims, type stubs and stand-in server actions with fixture data, and is copied last. Re-run `pnpm --filter site sync` after a framework release and commit the result.

## Deploying

Static assets on Cloudflare Workers (`wrangler.jsonc`: assets only, no Worker script). `pnpm --filter site deploy` builds and deploys from a machine with a Cloudflare login; a git-connected Workers Build must use **`apps/site` as its root directory** and `pnpm install --frozen-lockfile && pnpm build` (the lockfile is the repository root's).

## Pages

- `/` — the homepage: the hero (headline, `create` command, the reference application walkthrough at the fold), then numbered sections — the 30/70 model, the execution boundary, consumer-owned UI, architecture, not-a-boilerplate, engineering proof + open source, quickstart (the one dark band), FAQ, CTA. One question per section (`src/pages/index.astro`).
- `/404` — the not-found page wrangler serves for unknown routes (`src/pages/404.astro`).
- `/pages` — the registry explorer, every page family with its install command.
- `/architecture` — the full package graph, the architecture rules as tests, ownership, ADRs.
- `/why-intelligo` — the other half counted in full, and the agent objection.
- `/compare` — the alternatives.
- `/r/<item>.json` — the hosted registry.
- `/og.png`, `/favicon.svg`, `/robots.txt`, `/sitemap-index.xml` — the social card, icon, crawler hints and the sitemap `@astrojs/sitemap` writes at build time. The card is rendered from `scripts/og.html`; regenerate it after a copy or version change with `npx playwright screenshot --viewport-size=1200,630 scripts/og.html public/og.png`.

Every command the homepage shows is verified against the published packages: `pnpm dlx @intelligo-dev/cli@beta create`, `pnpm exec shadcn add https://intelligo.dev/r/<item>.json`, `pnpm dev`. The scaffold's `components.json` ships an empty `registries` map, so the URL form is the one that works — do not document `shadcn add @intelligo-dev/<item>` until a namespace is configured.

See [BRIEF.md](BRIEF.md) for the copywriting brief.
