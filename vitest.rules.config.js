import { defineConfig } from 'vitest/config';

// Config dedicada para los tests de reglas de Firestore (necesitan el emulador).
// Se usa vía `npm run test:rules` (firebase emulators:exec). Entorno node (no jsdom).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/firestore.rules.test.ts'],
  },
});
