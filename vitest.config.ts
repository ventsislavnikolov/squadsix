// Tests cover the pure domain; they don't need the Start/Nitro plugins booting.
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/**", "src/routeTree.gen.ts"],
      reporter: [["text", { skipFull: true }], "text-summary"],
    },
  },
});
