import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.base.json sets `jsx: "preserve"` for Next; Vite 8's oxc
  // transform honours it and would hand JSX to the parser untouched.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    name: "@intelligo-dev/ui",
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
