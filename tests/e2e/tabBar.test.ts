import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LA PASTILLA DE LAS LISTAS SUBE A LA FILA DE LA LUPA Y EL TEMA, Y NUNCA SE METE DEBAJO DE ELLOS.
 *
 * `TabBar` mide si cabe al lado de los controles flotantes (que van `fixed` arriba a la derecha) y elige la forma
 * (`tabBarLayout.ts`); en un móvil, siempre en su fila. Esa medida depende de la letra real, del ancho real y de
 * cuándo llega la lupa del buscador —en ocioso, y ensancha el grupo—, tres cosas que en jsdom valen cero: un test de
 * componente daría verde con las pestañas tapadas por los botones.
 */

async function abrir(page: Page, ancho: number, palette?: string): Promise<void> {
  await page.setViewportSize({ width: ancho, height: 800 });
  await sembrarBiblioteca(page, { theme: 'dark', palette, amplia: true, deseos: true });
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Con la lupa ya puesta: es la que ensancha el grupo de controles después del arranque.
  await expect(page.locator('.floating-controls .search-launcher')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function medir(page: Page) {
  return page.evaluate(() => {
    const caja = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
    };
    return {
      barra: document.querySelector('.tabs')?.className ?? '',
      pastilla: caja(document.querySelector('.tabs-inner:not(.is-measure)')),
      controles: caja(document.querySelector('.floating-controls')),
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const palette of [undefined, 'arcade']) {
  for (const ancho of [360, 412, 768, 1100, 1440]) {
    test(`a ${ancho} px${palette ? ` en ${palette}` : ''} la pastilla no pisa los controles ni abre scroll`, async ({ page }) => {
      await abrir(page, ancho, palette);
      const m = await medir(page);
      const porQue = JSON.stringify(m);
      expect(m.pastilla, porQue).not.toBeNull();
      expect(m.controles, porQue).not.toBeNull();
      const p = m.pastilla!;
      const c = m.controles!;
      const misma = p.bottom > c.top && p.top < c.bottom;
      if (misma) expect(p.right, `en la fila de los controles se mete debajo de ellos · ${porQue}`).toBeLessThanOrEqual(c.left);
      expect(m.desborde, `la página se desborda en horizontal · ${porQue}`).toBeLessThanOrEqual(0);
    });
  }
}

// El usuario descartó apretarla a la izquierda de los controles: descentrada respecto a las tarjetas de debajo.
test('en un móvil de 412 px la pastilla va en su fila, debajo de los controles y a todo el ancho', async ({ page }) => {
  await abrir(page, 412);
  const m = await medir(page);
  const porQue = JSON.stringify(m);
  expect(m.barra, porQue).not.toContain('is-inline');
  expect(m.pastilla!.top, porQue).toBeGreaterThanOrEqual(m.controles!.bottom);
  const tarjeta = await page.locator('.toolbar').first().boundingBox();
  expect(Math.abs(m.pastilla!.left - (tarjeta?.x ?? 0)), `no va alineada con las tarjetas · ${porQue}`).toBeLessThanOrEqual(2);
});

test('en escritorio ancho sube con los nombres a la fila de los controles', async ({ page }) => {
  await abrir(page, 1440);
  const m = await medir(page);
  expect(m.barra, JSON.stringify(m)).toContain('is-inline');
  await expect(page.locator('.tabs-inner:not(.is-measure) .tab-text-full').first()).toBeVisible();
});
