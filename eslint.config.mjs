import { readFileSync } from "node:fs";

import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * The package boundary, at edit time.
 *
 * `tests/architecture/dependency-direction.test.ts` is the authority
 * and stays the authority — it walks every manifest and every import
 * and knows the exact allowed edge per package. What it cannot do is
 * tell you before you run it: a developer importing `@example/product`
 * inside a public package sees a green editor until CI. These rules
 * are the coarse, drift-free half of the same check — the edges that
 * are wrong no matter which package you are in.
 *
 * Read from the same allowlist file the extraction script and the
 * architecture test read, so there is no second list to update.
 */
const allowlist = JSON.parse(
  readFileSync(
    new URL("./config/public-packages.json", import.meta.url),
    "utf8"
  )
);

/** Product application and private vertical — never a package's business. */
const PRIVATE_PATTERNS = [
  {
    group: ["@example/product", "@example/product/*"],
    message:
      "A reusable package must not import the vertical (ADR-0006). Take what you need as a parameter, or register it from the composition root.",
  },
  {
    group: ["@example/product", "@example/product/*", "@/*"],
    message:
      "A reusable package must not import the product application (ADR-0006). `@/...` resolves inside product/app.",
  },
];

/** Packages ADR-0008 dissolved: nothing published may point at one. */
const DISSOLVED_PATTERNS = allowlist.deprecated.map((name) => ({
  group: [`@intelligo-dev/${name}`, `@intelligo-dev/${name}/*`],
  message: `@intelligo-dev/${name} is dissolving (ADR-0008) and is never published. A public package that depends on it cannot be extracted.`,
}));

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          // Catch params are frequently unused on purpose (`catch { }` isn't
          // always possible when the block re-throws a wrapped error).
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Every reusable package: no reaching into private code.
    files: ["packages/*/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: PRIVATE_PATTERNS }],
    },
  },
  {
    // Public packages additionally may not touch the dissolved set.
    files: allowlist.public.map((name) => `packages/${name}/**/*.{ts,tsx}`),
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...PRIVATE_PATTERNS, ...DISSOLVED_PATTERNS] },
      ],
    },
  },
  {
    // The vertical is reusable across products; the application is not.
    files: ["product/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@example/product",
                "@example/product/*",
                "@/*",
              ],
              message:
                "The vertical must not import the product application (ADR-0006) — extracting Support for a second product would become impossible.",
            },
          ],
        },
      ],
    },
  },
  {
    // React packages carry `eslint-disable react-hooks/exhaustive-deps`
    // comments. Without the plugin registered those comments are themselves
    // errors ("rule definition not found"), so the plugin has to be loaded
    // wherever React components live — and having it loaded means the rule
    // actually runs, which is the point.
    files: ["packages/chat/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Warn, not error: the existing components carry deliberate
      // dependency omissions behind disable comments. Tightening to error
      // is a separate, reviewed sweep.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Globs are resolved from this config's directory, so a bare
    // ".next/**" only ignored the repo root's build output — a package's
    // own .next/ was still linted, and minified chunks then reported
    // "rule not found" errors from their inline eslint directives.
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/coverage/**",
    ],
  },
];
