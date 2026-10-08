# intelligo.dev

The public site of the Intelligo framework — `apps/website` in the framework repository — built with Astro (static) + React islands + Tailwind 4. It also serves the framework's **page registry** at `https://intelligo.dev/r/<item>.json`, which is what `shadcn add` installs from.

```bash
pnpm install                  # from the repository root
pnpm --filter website dev        # http://localhost:4003
pnpm --filter website build      # apps/website/dist/
pnpm --filter website type-check # astro check
```

## Keeping it truthful

Everything the site says about the framework — the registry items, the test and page counts, the published version — is pulled from the repository the site lives in by one script and **committed**, so a deploy needs nothing but this directory and the site cannot list a page that does not exist:

```bash
pnpm sync                     # repository root: builds packages/registry/public/r, then syncs
                              # (reads ../../packages/registry, ../../packages, ../../apps/app)
```

It writes `src/data/*.json`, the generated docs pages and `public/llms*.txt`, and the hosted registry: `public/r/<version>/` keeps every release's items (rewritten from the build until npm has that version, frozen from then on, and built from the `v<version>` tag when missing), and `public/r/*.json` is the copy of the release npm serves. `node scripts/sync-framework.mjs --release <version>` adds an earlier release's copy. The sync also installs the registry items' real client components into `src/showcase/app/`, rebuilt from scratch each run — the hero walkthrough and the registry explorer render those, not mock-ups. Four import specifiers are rewritten on install so they run outside Next.js (`@/` → `@showcase/`, `next-intl` → `use-intl`, `next/navigation` and `@intelligo-dev/auth/client` → shims); `src/showcase/overrides/` holds the shims, type stubs, stand-in server actions with fixture data and the shadcn components the catalog shows that nothing installs, and is copied last.

CI re-runs the sync and fails when anything under `apps/website` differs, or when `proof.json` names another version or another npm release than the sync reads. After a release, commit `pnpm sync` so the site serves it.

## Deploying

Static assets on Cloudflare Workers (`wrangler.jsonc`: assets only, no Worker script). `pnpm --filter website deploy` builds and deploys from a machine with a Cloudflare login; a git-connected Workers Build must use **`apps/website` as its root directory** and `pnpm install --frozen-lockfile && pnpm build` (the lockfile is the repository root's).

## Pages

- `/` — the homepage: the film, the count and open source, the quickstart and the FAQ.
- `/product`, `/why`, `/architecture`, `/compare/boilerplates` — what it does, why, the package graph and the rules the tests enforce, and the comparison with a boilerplate.
- `/ui`, `/blocks`, `/blocks/<item>`, `/components`, `/components/<name>` — the registry: every page family and component, live, with its install command.
- `/docs/…` — the documentation (`src/content/docs`; generated pages come from the repository through `scripts/docs.mjs`), with a Markdown copy of each page at `.md` and the search index at `/docs/search.json`.
- `/r/<item>.json`, `/r/registry.json`, `/r/<version>/<item>.json` — the hosted registry: the latest release's items, its index, and every release's.
- `/404` — the not-found page wrangler serves for unknown routes.
- `/og/<path>.png`, `/favicon.svg`, `/robots.txt`, `/sitemap-index.xml`, `/llms.txt` — a social card per page (drawn after the build by `src/lib/og-images.mjs`), the icon, crawler hints, the sitemap and the agent-readable index.

The build writes `dist/_headers` (`src/lib/headers.mjs`): a content security policy that allows the inline scripts that build emitted by their hashes and refuses framing, and JSON with open CORS for `/r/*`. `public/_redirects` holds the moved paths.

Install commands are spelled once, in `src/lib/install.ts`: `pnpm exec shadcn add @intelligo/<item>`, which the scaffold's `components.json` resolves to `https://intelligo.dev/r/<item>.json`.
