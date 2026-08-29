import { defineConfig } from "vitest/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { globSync } from "node:fs";

// Single root vitest config for the whole monorepo. Replaces the
// previous split between vitest.config.ts (resolve.alias) and
// vitest.workspace.ts (project list) — vitest 4's `test.projects`
// field accepts the same project paths the deprecated
// `defineWorkspace` used to take.
//
// Projects are discovered rather than listed. A hand-maintained list
// silently omits a new package's tests, and it named private/* paths
// that do not exist in the extracted public tree, where `pnpm test`
// then failed on a missing project file (ADR-0001).
//
// Why the alias lives here:
//   product/app server-action sources import from `@/lib/...`. When
//   vitest's workspace runner transforms a test file under
//   product/app/actions/__tests__/*, the underlying Vite SSR resolver
//   uses the root resolver for the module graph, NOT the per-project
//   vitest.config.ts. So the @ alias has to be defined at the root
//   for `pnpm test` from the repo root to find `@/lib/validations/...`.
//
// Why tests/e2e is excluded:
//   Those specs are Playwright (test.describe from @playwright/test,
//   not vitest). They live outside any of the workspace projects, but
//   pnpm test from the root would otherwise discover them and crash
//   with "test.describe was called in a configuration file".
const projects = globSync(
  [
    "packages/*/vitest.config.ts",
    "apps/*/vitest.config.ts",
    "private/*/vitest.config.ts",
  ],
  { cwd: __dirname }
)
  .map((p) => p.split(path.sep).join("/"))
  .sort();

const igniteRoot = path.resolve(__dirname, "./product/app");

export default defineConfig({
  resolve: {
    alias: {
      // Absent in the extracted public tree, where nothing imports it.
      ...(existsSync(igniteRoot) ? { "@": igniteRoot } : {}),
      // `server-only` throws unless the bundler applies React's
      // react-server condition, which vitest's node environment does
      // not. Aliasing it to an empty module here beats a
      // vi.mock("server-only") in every test that transitively reaches
      // a server module.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "tests/e2e/**",
    ],
    projects: [...projects, "tests/architecture/vitest.config.ts"],
  },
});
