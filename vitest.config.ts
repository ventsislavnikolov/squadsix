// Tests cover the pure domain; they don't need the Start/Nitro plugins booting.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ['src/**/*.test.ts'] },
})
