import { defineConfig } from 'vitest/config';

// Config dedicada para los tests de reglas de Firestore (necesitan el emulador).
// Se usa vía `npm run test:rules` (scripts/run-rules-tests.mjs). Entorno node (no jsdom).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/firestore.rules.test.ts'],
  },
});
