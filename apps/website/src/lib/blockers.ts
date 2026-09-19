/**
 * Every `✓` line under a `pnpm vitest run <path>` command is the title
 * of a test under that path, word for word; the paths under `shadcn add`
 * are targets the named blocks write. tests/architecture/docs.test.ts
 * holds both to it.
 */
export const BLOCKERS = [
  {
    tag: "verification",
    title: "You can't review code you didn't write.",
    body: "Tenancy bugs don't show up in a demo. They show up when a second workspace sees the first one's data.",
    evidence: [
      "$ pnpm vitest run packages/core/src/documents",
      "✓ getDocument throws not_found for another workspace/user's document",
      "✓ saveDocument throws forbidden when a different user owns the id",
      "✓ deleteDocumentVersions throws not_found for an id outside the actor's scope",
    ],
  },
  {
    tag: "cost",
    title: "The same login page, rebuilt from zero.",
    body: "Days and millions of tokens on infrastructure that has nothing to do with what makes your product yours.",
    evidence: [
      "$ pnpm exec shadcn add @intelligo/auth-login @intelligo/auth-signup",
      "✓ app/[locale]/(auth)/login/page.tsx",
      "✓ components/auth/auth-card.tsx",
      "✓ messages/en/auth-login.json",
    ],
  },
  {
    tag: "entropy",
    title: "Messy code teaches messier code.",
    body: "A model writes in the style of what surrounds it. Start clean and every commit inherits that.",
    evidence: [
      "$ pnpm vitest run tests/architecture",
      "✓ package dependency direction",
      "✓ every model id used in the source is in the shipped catalogue",
      "✓ imports no unpublished, dissolved, or @intelligo-dev/ui path",
    ],
  },
];
