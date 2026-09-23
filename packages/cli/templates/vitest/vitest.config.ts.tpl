import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * The app's test runner.
 *
 * - `@` resolves the way the app's tsconfig resolves it.
 * - `server-only` throws unless the bundler applies React's
 *   `react-server` condition, which a test does not; the stub stands in
 *   for it so a test can import server code.
 * - The `@intelligo-dev/*` packages ship compiled ESM that imports
 *   `server-only` itself. Vitest leaves node_modules to Node, where the
 *   alias above never applies, so they are inlined: transformed by
 *   Vitest like the app's own source, with the alias in effect.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": path.join(root, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    server: {
      deps: {
        inline: [/node_modules\/@intelligo-dev\//],
      },
    },
  },
});
