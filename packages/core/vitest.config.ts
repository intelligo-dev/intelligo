import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.base.json sets `jsx: preserve` for Next.js. Vite's
  // transformer honours it and emits raw JSX that import analysis cannot
  // parse — which surfaces the moment a test reaches the React email
  // templates. Compile JSX here instead.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    globals: true,
    environment: "node",
  },
});
