import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/domain/**/*.ts', 'src/parse/**/*.ts', 'src/export/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/domain/types.ts'],
      thresholds: {
        'src/domain/**/*.ts': {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
      },
    },
  },
});
