import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: the build config loads the CRXJS
// plugin and shells out to git for the version string, neither of which should
// run for unit tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
  resolve: {
    alias: { "@": "/src" },
  },
});
