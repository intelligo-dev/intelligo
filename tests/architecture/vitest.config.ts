import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "architecture",
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
