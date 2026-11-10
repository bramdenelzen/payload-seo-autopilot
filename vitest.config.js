import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({ ignoreConfigErrors: true, projects: ['./dev/tsconfig.json'] })],
  test: {
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 60_000,
    include: ['src/**/*.spec.ts', 'dev/**/int.spec.ts'],
    testTimeout: 30_000,
  },
})
