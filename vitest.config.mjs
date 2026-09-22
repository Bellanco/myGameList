import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Por encima del `asyncUtilTimeout` de Testing Library (3 s, en `tests/setup.ts`) para que, cuando un
    // `findBy*` no encuentre su elemento, el error sea el suyo —que nombra lo que falta— y no un «test timed
    // out» de vitest, que no dice dónde mirar. El valor por defecto (5 s) los dejaba demasiado juntos.
    testTimeout: 10_000,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    // `tests/emulacion` fuera: es el emulador del espacio social, que IMPRIME en vez de afirmar (ver
    // `vitest.emulacion.config.mjs` y `npm run emulate:social`). Lo que de él hay que vigilar en cada commit es su
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
