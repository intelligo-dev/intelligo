import { defineConfig } from "vitest/config";

// The root config discovers projects with
// `globSync("packages/*/vitest.config.ts")`, so a package without this
// file is not merely untested — it is invisible to `pnpm test`, and
// tests written inside it would never run. This package holds the
// plan, feature, payment, trial, seat and rate-limit registries: the
// whole per-product extension seam.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
