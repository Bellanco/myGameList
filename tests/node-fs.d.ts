// Tipos mínimos de `node:fs` para los tests que necesitan leer un fichero del repositorio.
//
// POR QUÉ ESTO Y NO `@types/node`. Solo un test lo necesita —el que comprueba que `grimdark.scss` tiene un sello
// escrito para cada número que sortea `SocialFeedScreen`—, y traerse los tipos completos de Node por eso mete una
// dependencia de desarrollo en un proyecto que hoy no tiene ninguna que apunte al runtime.
//
// POR QUÉ NO `import ... ?raw`, que sería lo idiomático en Vite: Vitest devuelve cadena VACÍA al importar un
// `.scss` así (su pipeline de CSS lo intercepta antes), de modo que el test pasaba a comprobar nada. Con `fs` se
// lee el fichero de verdad.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
