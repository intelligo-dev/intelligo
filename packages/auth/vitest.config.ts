import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.base.json sets `jsx: "preserve"` for Next; Vite 8's oxc
  // transform honours it and would hand JSX to the parser untouched.
  // Needed here because the team-service integration test imports
  // `../server`, which pulls in `@intelligo/core/email`'s .tsx
  // templates transitively.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    globals: true,
    environment: "node",
  },
});
