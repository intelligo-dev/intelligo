// @ts-check

/**
 * Mutation testing: does the suite actually fail when the code is wrong?
 *
 * Line coverage says a line ran. It does not say an assertion would
 * have noticed had that line computed something else — and the modules
 * scoped below are exactly the ones where the difference is money:
 * a `Math.ceil` silently turned into `Math.floor` eats a fraction of a
 * minor unit on every transaction, and a `>` turned into `>=` bills one
 * request per window for free. Stryker makes those edits for us and
 * reports the ones no test caught.
 *
 * Scope grows deliberately. Every file listed in `mutate` is pure
 * enough that a surviving mutant is a missing assertion rather than a
 * missing database; the test suites that can kill them are listed in
 * `vitest.stryker.config.ts`. `pnpm test:mutation` runs it.
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "pnpm",
  testRunner: "vitest",
  // Named rather than left to the default `@stryker-mutator/*` glob:
  // that glob resolves from Stryker's own directory, which under
  // pnpm's isolated node_modules holds only Stryker's dependencies —
  // the runner is a sibling in the root's node_modules, invisible from
  // there, and the run dies with "no TestRunner plugins were loaded".
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.stryker.config.ts" },
  // Run only the tests that covered the mutated line, per mutant.
  coverageAnalysis: "perTest",
  reporters: ["html", "json", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  mutate: [
    "packages/core/src/money.ts",
    "packages/core/src/prompt.ts",
    "packages/core/src/registry.ts",
    "packages/core/src/documents/classifier.ts",
  ],
  // `break` fails the command. It sits just under the score this scope
  // actually holds (97.6), so a regression is a red build rather than a
  // number someone stops reading. Raise it with the score; never lower
  // it to make a run pass. The survivors that keep it off 100 are
  // whitespace-equivalent regex edits — `\s+` for `\s` where the sweep
  // collapses the difference away — and one `<` for `<=` in `compare`
  // that the branch above it already answered.
  thresholds: { high: 98, low: 95, break: 95 },
};
