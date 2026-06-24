import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'public/**', 'tests/e2e/**', 'tests/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportOnFailure: true,
      all: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['node_modules/', 'src/main.tsx', 'src/view/components/IconSprite.tsx'],
    },
  },
});
