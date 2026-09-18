import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';
import { irAAjustes } from './nav';

/**
 * QUE NINGÚN ICONO SALGA HUECO, sobre el build de producción.
 *
 * El sprite general está partido en dos por peso: `IconSprite` (los 36 símbolos que dibuja el arranque, en su
 * chunk) e `IconSpriteRest` (los 15 de las pantallas perezosas, que llega en idle). El reparto no se declara en
 * ningún sitio —`<Icon name="gear" />` se escribe igual esté donde esté—, así que **un icono en la mitad
 * equivocada no produce ningún error**: se pinta un `<svg>` vacío y ya. Ni el build, ni TypeScript, ni los tests
 * de componente en jsdom pueden verlo, porque el reparto solo existe en el grafo de chunks del build.
 *
 * Esto es lo único que lo ve: recorrer las pantallas del build real y preguntar, por cada `<use>` de la página,
 * si el símbolo al que apunta existe en el documento. Cubre los dos fallos posibles del reparto: un símbolo que
 * no está en ninguna mitad y uno que está en la perezosa pero lo dibuja el arranque.
 *
 * `tests/unit/iconSprite.test.ts` cubre la otra mitad del contrato —que el catálogo y los dos sprites cuadren—,
 * que sí se puede comprobar leyendo los ficheros.
 */

/** Los `<use>` de la página cuyo símbolo NO está en el documento. Devuelve los ids que faltan, sin repetir. */
async function iconosHuecos(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const faltan = new Set<string>();
    for (const uso of Array.from(document.querySelectorAll('use'))) {
      const href = uso.getAttribute('href') || uso.getAttribute('xlink:href') || '';
      if (!href.startsWith('#')) continue; // referencias externas: no van por id del documento
      if (!document.getElementById(href.slice(1))) faltan.add(href.slice(1));
    }
    return [...faltan];
  });
}

test.describe('los dos sprites de iconos, sobre el build', () => {
  test('ninguna pantalla deja un icono sin su símbolo', async ({ page }) => {
    await sembrarBiblioteca(page, { amplia: true });

    // 1) EL ARRANQUE, y a propósito lo PRIMERO que se mira: aquí el sprite perezoso puede no haber llegado
    // todavía (entra cuando el navegador queda ocioso), así que es el momento exacto en el que un icono del
    // arranque colocado por error en la mitad perezosa saldría hueco.
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await iconosHuecos(page), 'listados').toEqual([]);

    // Una fila desplegada saca los iconos de acción (editar, eliminar, mover).
    await page.locator('button[aria-controls^="game-detail-"]').first().click();
    expect(await iconosHuecos(page), 'listados · fila abierta').toEqual([]);

    // 2) LAS PANTALLAS PEREZOSAS, que son las que necesitan la segunda mitad del sprite.
    await page.getByRole('button', { name: /^Social/ }).first().click();
    await expect(page).toHaveURL(/\/social/);
    expect(await iconosHuecos(page), 'hub social').toEqual([]);

    await page.getByRole('button', { name: /^Estadísticas|^Perfil/ }).first().click();
    await expect(page).toHaveURL(/\/stats/);
    expect(await iconosHuecos(page), 'estadísticas').toEqual([]);

    // Solo «Filtros» y «Datos»: el menú esconde «Diseño» cuando no hay perfil social (`SettingsMenu`, y
    // `App` además redirige fuera de esa ruta), y este recorrido no abre sesión de Google — en local no hay
    // Firebase. Sus iconos (la paleta, el tema) los cubre el recorrido de accesibilidad, que sí pasa por ahí.
    for (const grupo of ['Filtros', 'Datos']) {
      await irAAjustes(page, grupo);
      expect(await iconosHuecos(page), `ajustes · ${grupo}`).toEqual([]);
    }
  });
});
