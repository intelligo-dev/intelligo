/**
 * The quickstart, as the CLI runs it. Every command is one a new app
 * takes, and the output lines are the ones the commands print:
 *   1. `intelligo create` asks which pages to install, scaffolds, then
 *      runs `shadcn add` for the design-system base and the pages
 *      (packages/cli/src/commands/create-flow.ts).
 *   2. `pnpm db:migrate` is the scaffold's script over `intelligo migrate`
 *      (packages/cli/src/commands/migrate.ts).
 *   3. `pnpm dev` is the scaffold's own script, on port 3000.
 * tests/architecture/docs.test.ts holds the file count, the page list and
 * the migration names to the CLI's templates and the migration chain.
 */
export const QUICKSTART = [
  {
    title: "Create",
    cmd: "pnpm dlx @intelligo-dev/cli@beta create my-app",
    note: "Next.js 16, shadcn, Tailwind 4, next-intl and a composition root wired to the execution boundary. It asks which pages you want and installs them as your source.",
    out: [
      "◆ Which pages should be installed? (space to toggle)",
      "● Also installing what they build on: route-error",
      "◆ Scaffolded 28 files in my-app",
      "◇ pnpm install",
      "◇ pnpm exec shadcn add @intelligo/intelligo --yes --overwrite",
      "◇ pnpm exec shadcn add @intelligo/route-error @intelligo/app-shell @intelligo/auth-login @intelligo/auth-signup @intelligo/dashboard --yes --overwrite",
      "",
      "Next",
      "  cd my-app",
      "  cp .env.example .env.local   # then fill it in",
      "  pnpm dev",
      "",
      "5 page(s) installed.",
    ],
  },
  {
    title: "Migrate",
    cmd: "pnpm db:migrate",
    note: "After DATABASE_URL and BETTER_AUTH_SECRET are in .env.local. The framework's schema, applied in one transaction — then drizzle-kit for the tables you add.",
    out: [
      "✓ Applied 3 migration(s):",
      "    0000_baseline",
      "    0001_reconcile_chain_built_databases",
      "    0002_webhook_claim_lease",
    ],
  },
  {
    title: "Run",
    cmd: "pnpm dev",
    note: "Sign up and land in a workspace. Add the chat block and it streams against a built-in stub model — no provider key yet. `pnpm exec intelligo doctor` says what is still missing.",
    out: [
      "▲ ready on http://localhost:3000",
      "sign-up → workspace → dashboard",
    ],
  },
];
