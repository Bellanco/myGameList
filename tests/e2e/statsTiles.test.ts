import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LA REJILLA DE CIFRAS DEL PANEL SIEMPRE SALE COMPLETA (`docs/plan-acabado-visual.md` §2.A).
 *
 * El reparto lo decide solo el CSS —doce pistas, consultas de contenedor y `:has()` sobre el número de fichas—, así
 * que solo se puede comprobar midiendo en un navegador de verdad. Se monta una rejilla con 1…8 fichas a cada uno de
 * los anchos que cambian de régimen y se leen los rectángulos: cada fila tiene que llenar el ancho de la rejilla y
 * repartirse como dice la tabla del plan.
 *
 * Se mide sobre el CSS REAL de `stats.scss`, que viaja en el chunk perezoso del panel: por eso se entra en `/stats`
 * antes de montar nada.
 */

/** Filas esperadas (fichas por fila) para cada número de fichas, por régimen de columnas. */
const REPARTO: Record<string, { ancho: number; filas: number[][] }> = {
  // 1 por fila por debajo de 17 rem (teléfonos de 320 px).
  una: { ancho: 240, filas: [[1], [1, 1], [1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1]] },
  // 2 por fila; con número impar, la primera («Juegos») va a todo el ancho.
  dos: { ancho: 320, filas: [[1], [2], [1, 2], [2, 2], [1, 2, 2], [2, 2, 2], [1, 2, 2, 2], [2, 2, 2, 2]] },
  tres: { ancho: 560, filas: [[1], [2], [3], [2, 2], [3, 2], [3, 3], [3, 2, 2], [3, 3, 2]] },
  cuatro: { ancho: 800, filas: [[1], [2], [3], [4], [3, 2], [3, 3], [4, 3], [4, 4]] },
  // En una rejilla ancha (≥ 83 rem) todas caben en una fila: no hay nada que completar.
  ancha: { ancho: 1440, filas: [[1], [2], [3], [4], [5], [6], [7], [8]] },
};

test.describe('rejilla de cifras del panel', () => {
  test.beforeEach(async ({ page }) => {
    await sembrarBiblioteca(page, { amplia: true });
    await page.goto('/stats');
    await expect(page.locator('.stats-tiles').first()).toBeVisible();
  });

  for (const [regimen, { ancho, filas }] of Object.entries(REPARTO)) {
    test(`a ${ancho} px (${regimen}) cada fila se llena y se reparte como en el plan`, async ({ page }) => {
      const medidas = await page.evaluate(({ ancho }) => {
        const resultados: Array<{ filas: number[]; huecos: number[] }> = [];
        for (let n = 1; n <= 8; n += 1) {
          // La tarjeta es la que hace la pregunta de la fila única (`stats-tiles-box`), así que se monta entera.
          const tarjeta = document.createElement('div');
          tarjeta.className = 'stats-card';
          tarjeta.style.cssText = `width:${ancho}px;padding:0;border:0;box-sizing:content-box`;
          const rejilla = document.createElement('div');
          rejilla.className = 'stats-tiles';
          for (let i = 0; i < n; i += 1) {
            const ficha = document.createElement('div');
            ficha.className = 'stat-tile';
            ficha.textContent = String(i + 1);
            rejilla.appendChild(ficha);
          }
          tarjeta.appendChild(rejilla);
          document.body.appendChild(tarjeta);
          const total = rejilla.getBoundingClientRect().width;
          const hueco = parseFloat(getComputedStyle(rejilla).columnGap) || 0;
          const porFila = new Map<number, DOMRect[]>();
          for (const ficha of rejilla.children) {
            const r = ficha.getBoundingClientRect();
            const clave = Math.round(r.top);
            porFila.set(clave, [...(porFila.get(clave) ?? []), r]);
          }
          const ordenadas = [...porFila.entries()].sort(([a], [b]) => a - b).map(([, rs]) => rs);
          resultados.push({
            filas: ordenadas.map((rs) => rs.length),
            // Lo que le falta a cada fila para llegar al ancho de la rejilla (0 = completa).
            huecos: ordenadas.map((rs) => Math.round(total - rs.reduce((suma, r) => suma + r.width, 0) - hueco * (rs.length - 1))),
          });
          tarjeta.remove();
        }
        return resultados;
      }, { ancho });

      medidas.forEach(({ filas: obtenidas, huecos }, index) => {
        expect(obtenidas, `${index + 1} fichas`).toEqual(filas[index]);
        for (const falta of huecos) expect(Math.abs(falta), `${index + 1} fichas: fila incompleta`).toBeLessThanOrEqual(1);
      });
    });
  }
});
