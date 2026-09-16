import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Registry source is consumer-owned code, so most of it is proven by
 * the architecture suites and by installing it. What has logic worth
 * pinning on its own — the eve event mapper, the composer's trigger
 * detection — is tested here, from `tests/`, so no test file lands in
 * `base/` where every file must belong to an item.
 */
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      // The one consumer seam the tested hook reads at module load.
      "@/lib/chat-config": path.resolve(
        __dirname,
        "base/chat/lib/chat-config.tsx"
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
