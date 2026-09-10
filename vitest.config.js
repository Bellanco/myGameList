import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    // `tests/emulacion` fuera: es el emulador del espacio social, que IMPRIME en vez de afirmar (ver
    // `vitest.emulacion.config.js` y `npm run emulate:social`). Lo que de él hay que vigilar en cada commit es su
    // presupuesto de llamadas, y eso vive como test normal en `tests/component/socialHubBudget.test.tsx`.
    exclude: ['node_modules', 'public/**', 'tests/e2e/**', 'tests/integration/**', 'tests/emulacion/**'],
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
