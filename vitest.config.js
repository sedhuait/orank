const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    pool: "forks",
    globals: true,
    testTimeout: 15000,
    restoreMocks: true,
    include: ["tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.js"],
      exclude: ["scripts/cli.js", "scripts/tracker.js"],
      thresholds: {
        statements: 95,
        branches: 85,
        functions: 95,
        lines: 95,
      },
      reporter: ["text", "text-summary"],
    },
  },
});
