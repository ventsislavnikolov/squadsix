// No Start/Nitro plugins: tests import routes, components and server code
// directly, with the server functions and the database mocked.
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Page tests render whole routes in jsdom; leave room for a loaded
    // machine running the pre-push hook.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/**", "src/routeTree.gen.ts"],
      reporter: [["text", { skipFull: true }], "text-summary"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
