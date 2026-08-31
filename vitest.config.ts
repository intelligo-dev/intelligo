import { defineConfig } from "vitest/config";
import path from "node:path";
import { globSync } from "node:fs";

// Single root vitest config for the whole monorepo. Replaces the
// previous split between vitest.config.ts (resolve.alias) and
// vitest.workspace.ts (project list) — vitest 4's `test.projects`
// field accepts the same project paths the deprecated
// `defineWorkspace` used to take.
//
// Projects are discovered rather than listed: a hand-maintained list
// silently omits a new package's tests.
//
// Why the alias lives here:
//   When vitest's workspace runner transforms a test file, the
//   underlying Vite SSR resolver uses the root resolver for the module
//   graph, NOT the per-project vitest.config.ts. So an alias every
//   project needs has to be defined at the root.
const projects = globSync(
  ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],
  { cwd: __dirname }
)
  .map((p) => p.split(path.sep).join("/"))
  .sort();

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws unless the bundler applies React's
      // react-server condition, which vitest's node environment does
      // not. Aliasing it to an empty module here beats a
      // vi.mock("server-only") in every test that transitively reaches
      // a server module.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    projects: [...projects, "tests/architecture/vitest.config.ts"],
  },
});
