import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    // Matches the rest of the monorepo's convention (AGENTS.md): a
    // leading underscore marks an intentionally unused var/arg — used
    // throughout src/ui (copied verbatim from the registry/reference
    // app, where this same rule is configured) and src/ui-overrides.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // src/ui and src/ui-overrides are copied verbatim from the registry
    // and the reference app (scripts/sync-ui.mjs) — real component
    // library code, not this project's own Remotion authoring. Its
    // motion/randomness/native-<img> paths (attachment previews, the
    // skeleton loader's random width) are unreachable in what the film
    // actually renders (no attachments, no loading state), so
    // Remotion's purity rules — written for code this project writes,
    // not for a copied dependency — are noise here rather than signal.
    files: ["src/ui/**", "src/ui-overrides/**"],
    rules: {
      "@remotion/non-pure-animation": "off",
      "@remotion/deterministic-randomness": "off",
      "@remotion/warn-native-media-tag": "off",
    },
  },
];
