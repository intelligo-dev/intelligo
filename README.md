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

It writes `src/data/registry.json`, `src/data/proof.json` and `public/r/*.json` (run `pnpm registry:build` in the framework first so the built items exist). Re-run it after a framework release and commit the result.

See [BRIEF.md](BRIEF.md) for the structure and copywriting brief.
