/**
 * EL CONTRATO DE LOS DOS SPRITES DE ICONOS.
 *
 * El sprite general está partido en dos: `IconSprite` (los 36 símbolos que dibuja el arranque, va en su chunk) y
 * `IconSpriteRest` (los 15 que solo pintan pantallas perezosas, que llega en idle). El reparto es una decisión de
 * PESO, no de significado, así que nada en el código dice a qué mitad pertenece un icono: `<Icon name="gear" />`
 * se escribe igual esté donde esté.
 *
 * Y ahí está el fallo que estas pruebas existen para cazar: un icono que no esté en NINGUNO de los dos no
 * rompe nada —no hay error, no falla el build, no se queja TypeScript—, simplemente se pinta un hueco. Es la
 * clase de avería que se descubre semanas después y en una pantalla que nadie mira.
 *
 * Lo que se afirma:
 *  1. Todo nombre del catálogo (`IconName`) está declarado EXACTAMENTE UNA VEZ entre los dos sprites. Dos veces
 *     sería `id` duplicado en el documento —HTML inválido, y el navegador se queda con el primero—.
 *  2. Ningún sprite declara un símbolo que no esté en el catálogo (un nombre que nadie puede escribir).
 *  3. Todo icono que el código referencia de verdad existe en alguno de los dos.
 *  4. Los filtros del `<defs>` siguen en el sprite del ARRANQUE, porque los referencia el CSS desde el primer
 *     pintado y un `filter: url(#id)` que no resuelve deja la pieza sin su textura.
 *
 * Lo que NO se puede afirmar aquí —que el sprite del arranque lleve todo lo que el arranque dibuja— necesita el
 * grafo de módulos del build; de eso se ocupa el recorrido de extremo a extremo, que comprueba sobre la página
 * real que ningún `<use>` apunta a un símbolo ausente.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CATALOGO = readFileSync('src/core/constants/icons.ts', 'utf8');
const ARRANQUE = readFileSync('src/view/components/IconSprite.tsx', 'utf8');
const RESTO = readFileSync('src/view/components/IconSpriteRest.tsx', 'utf8');

/** Los nombres que admite `IconName`, leídos de su unión de tipos. */
const nombresDelCatalogo = [...CATALOGO.matchAll(/^\s*\|\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]);

const declarados = (fuente: string): string[] =>
  [...fuente.matchAll(/<symbol[^>]*id="icon-([a-z0-9-]+)"/g)].map((m) => m[1]);

const enArranque = declarados(ARRANQUE);
const enResto = declarados(RESTO);

describe('los dos sprites de iconos', () => {
  it('declara cada nombre del catálogo exactamente una vez, entre los dos', () => {
    const todos = [...enArranque, ...enResto];
    const faltan = nombresDelCatalogo.filter((n) => !todos.includes(n));
    const repetidos = todos.filter((n, i) => todos.indexOf(n) !== i);

    expect(faltan).toEqual([]);
    expect(repetidos).toEqual([]);
  });

  it('no declara símbolos que el catálogo no admita', () => {
    const sobran = [...enArranque, ...enResto].filter((n) => !nombresDelCatalogo.includes(n));
    expect(sobran).toEqual([]);
  });

  it('el sprite del arranque conserva los filtros de textura que usa el CSS', () => {
    // `filter: url(#wt-desgarro)` en las hojas de «Plata y acero»: la definición tiene que estar en el documento
    // desde el primer pintado, así que no puede irse al sprite perezoso.
    expect(ARRANQUE).toContain('id="wt-desgarro"');
    expect(ARRANQUE).toContain('id="wt-desgarro-pliego"');
    // Se afirma sobre los ids, no sobre la etiqueta `<defs>`: un símbolo puede traer su propio `<defs>` dentro
    // (un recorte, un degradado suyo) y eso viaja con él sin problema. Lo que no puede mudarse son estos dos.
    expect(RESTO).not.toContain('id="wt-desgarro');
  });

  it('el reparto sigue siendo el medido: ninguna mitad se queda vacía ni se lo lleva todo', () => {
    // Cotas amplias a propósito: esto no vigila un número exacto —que cambiará al añadir iconos— sino que el
    // reparto siga existiendo. Si una mitad se vacía, alguien deshizo la partición sin querer.
    expect(enArranque.length).toBeGreaterThan(20);
    expect(enResto.length).toBeGreaterThan(5);
  });
});
