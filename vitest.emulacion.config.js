import { defineConfig } from 'vitest/config';

// Config dedicada al EMULADOR del espacio social (`tests/emulacion/`). Se usa vía `npm run emulate:social`.
//
// Va aparte —y `vitest.config.js` excluye esa carpeta— por dos motivos. Uno, el emulador no afirma nada: imprime
// lo que el hub hace (lecturas de gist, consultas de Firestore, aciertos de caché, renders) para poder mirarlo, y
// un fichero que solo imprime no tiene sitio en una suite que se lee por rojo o verde. Y dos, su salida es
// deliberadamente ruidosa: mezclada con 1.800 tests no la leería nadie.
//
// Lo que sí vigila la suite es el PRESUPUESTO que el emulador descubrió: ver
// `tests/component/socialHubBudget.test.tsx`, que corre con `npm test` como cualquier otro.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/emulacion/**/*.test.tsx'],
    // `verbose` y `silent: false` no son cosmética: con el reporter por defecto vitest se guarda la salida de
    // consola de los ficheros que pasan, y aquí ESA SALIDA ES EL RESULTADO. Sin las dos, `npm run emulate:social`
    // imprime «4 passed» y nada más.
    reporters: ['verbose'],
    silent: false,
  },
});
