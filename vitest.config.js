import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['public/**/*.test.ts'],
    exclude: ['node_modules'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportOnFailure: true,
      all: true,
      include: ['public/ts/**/*.ts'],
      exclude: [
        'node_modules/',
        'public/ts/**/*.test.ts',
        'public/ts/migrate.ts',
        'public/ts/constants.ts',
      ],
    },
  },
});
