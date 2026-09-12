import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * The package boundary, at edit time.
 *
 * `tests/architecture/dependency-direction.test.ts` is the authority
 * and stays the authority — it walks every manifest and every import
 * and knows the exact allowed edge per package. What it cannot do is
 * tell you before you run it: a developer importing an application
 * alias inside a package sees a green editor until CI. These rules
 * are the coarse, drift-free half of the same check — the edges that
 * are wrong no matter which package you are in.
 */

/** An application's own code — never a package's business. */
const APP_PATTERNS = [
  {
    group: ["@/*"],
    message:
      "A reusable package must not import application code (ADR-0006). `@/...` resolves inside the consuming application; take what you need as a parameter, or register it from the composition root.",
  },
];

/**
 * Packages ADR-0008 dissolved. The same list as
 * `tests/architecture/tree.ts`; nothing in the tree may point at one.
 */
const DISSOLVED_PATTERNS = ["ai", "agents", "chat"].map((name) => ({
  group: [`@intelligo-dev/${name}`, `@intelligo-dev/${name}/*`],
  message: `@intelligo-dev/${name} was dissolved (ADR-0008) and is not published; nothing on npm resolves it.`,
}));

/**
 * Packages ADR-0011 folded into a subpath of another. The same map as
 * `tests/architecture/tree.ts`; the message says where the code went.
 */
const FOLDED_PATTERNS = Object.entries({
  money: "@intelligo-dev/core/money",
  http: "@intelligo-dev/core/request-context and @intelligo-dev/next",
  "billing-core":
    "@intelligo-dev/billing/{plans,plan-registry,payment,quota-types}",
}).map(([name, target]) => ({
  group: [`@intelligo-dev/${name}`, `@intelligo-dev/${name}/*`],
  message: `@intelligo-dev/${name} was folded (ADR-0011); import ${target} instead.`,
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
    // Every package: no reaching into application code, nothing dissolved.
    files: ["packages/*/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...APP_PATTERNS,
            ...DISSOLVED_PATTERNS,
            ...FOLDED_PATTERNS,
          ],
        },
      ],
    },
  },
  {
    // Applications and registry items may not reach for a dissolved
    // package either — it resolves to nothing on npm — nor for a folded
    // one, whose name is deprecated there.
    files: ["apps/*/**/*.{ts,tsx}", "registry/base/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...DISSOLVED_PATTERNS, ...FOLDED_PATTERNS] },
      ],
    },
  },
  {
    // React packages carry `eslint-disable react-hooks/exhaustive-deps`
    // comments. Without the plugin registered those comments are themselves
    // errors ("rule definition not found"), so the plugin has to be loaded
    // wherever React components live — and having it loaded means the rule
    // actually runs, which is the point.
    files: ["packages/ui/**/*.{ts,tsx}"],
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
