import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * The vitest config Stryker runs against.
 *
 * Not `vitest.config.ts`: that one is a `projects` config, and the
 * Stryker vitest runner drives a single project — with a workspace it
 * loses the per-mutant test filtering that makes a run finish. So this
 * is one flat project that carries what every package config carries
 * (the `server-only` alias, JSX compilation) and nothing else.
 *
 * `include` is the set of unit suites that can kill a mutant in the
 * `mutate` scope of stryker.config.mjs; it grows with that scope.
 * Integration suites are excluded on purpose — they gate on
 * `DATABASE_URL` and skip without one, so under mutation testing they
 * would report every mutant they touch as survived.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/core/src/money.test.ts",
      "packages/core/src/prompt.test.ts",
      "packages/core/src/registry.test.ts",
      "packages/core/src/documents/classifier.test.ts",
      "packages/executions/src/pricing.test.ts",
      "packages/executions/src/lifecycle.test.ts",
      "packages/billing/src/plan-registry.test.ts",
      "packages/billing/src/feature-quota.test.ts",
      "packages/billing/src/features.test.ts",
      "packages/billing/src/quota.test.ts",
      "packages/billing/src/quota-settlement.test.ts",
      "packages/billing/src/rate-limit.test.ts",
      "packages/chat/src/windowing.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/*.int.test.ts",
      "**/*.integration.test.ts",
    ],
  },
});
