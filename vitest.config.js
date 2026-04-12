import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    globals: true,
    testTimeout: 15000,
    restoreMocks: true,
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.js"],
      exclude: ["scripts/cli.js"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      reporter: ["text", "text-summary"],
    },
  },
});
