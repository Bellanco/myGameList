import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'public/**'],
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
