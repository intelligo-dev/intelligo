import { defineConfig } from "vitest/config";
import path from "path";

/**
 * The reference app's own test project.
 *
 * Most of what this app contains is installed source that the registry
 * already covers, so this exists for the part that is genuinely the
 * app's: the seams it binds. A bound seam is where a consumer's
 * decisions live, and nothing else in the suite reaches them.
 *
 * Mirrors the product application's config — same JSX transform, same
 * `@intelligo-dev/*` no-externalize, same `server-only` stub; see that file
 * for why each is needed.
 */
export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  ssr: {
    noExternal: [/^@intelligo\//],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(
        __dirname,
        "../../tests/stubs/server-only.ts"
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
