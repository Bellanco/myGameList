import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LA CABECERA DEL LISTADO — el recuento, el orden y los controles de vista.
 *
 * ES UN RECORRIDO END-TO-END Y NO PUEDE SER OTRA COSA: lo que se vigila es cuánto MIDEN cinco palabras con la
 * letra del tema y si caben en la columna que les toca. En jsdom todo mide cero y un test de componente daría
 * verde con la barra rota, que es justo lo que ya pasó con la barra inferior.
 *
 * Las dos promesas, por orden de gravedad si se rompen:
 *  · las cinco columnas de orden se VEN TODAS, sin carril que arrastrar: lo que hay que arrastrar para
 *    descubrir no lo descubre nadie, y «Puntuación» partida por el canto se lee como un fallo de pintado;
 *  · los controles de vista se quedan pegados al canto DERECHO, que es donde el ojo los busca y donde están en
 *    escritorio: si se sueltan, se pegan al recuento y la barra parece descuadrada.
 */

async function abrir(page: Page, ancho: number): Promise<void> {
  await page.setViewportSize({ width: ancho, height: 820 });
  await sembrarBiblioteca(page, { theme: 'dark' });
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // La cabecera solo se pinta con la vista de tarjetas o en pantalla estrecha; se asegura la de tarjetas.
  const tarjetas = page.getByRole('button', { name: 'Ver tarjetas' });
  if ((await tarjetas.getAttribute('aria-pressed')) === 'false') await tarjetas.click();
  await expect(page.locator('.list-head')).toBeVisible();
  /* SE MIDE CON LA LETRA DE LA APP PUESTA. `fonts.ready` resuelve con las cargas que hubiera EN MARCHA al
     preguntar, así que se PIDE la cara que hace falta y se espera a que esté disponible: con la de reserva,
     las cinco columnas miden bastante más y el escalón se decidiría con un número que no es el real. */
  await page.evaluate(() => document.fonts.load('700 12px "DM Sans"', 'Puntuación').catch(() => []));
  await expect.poll(() => page.evaluate(() => document.fonts.check('700 12px "DM Sans"', 'Puntuación'))).toBe(true);
  await page.evaluate(() => document.fonts.ready);
}

/** Lo que de verdad importa: ¿se ven todas y sin desplazamiento? */
async function medir(page: Page) {
  return page.evaluate(() => {
    const sort = document.querySelector('.list-sort') as HTMLElement;
    const carril = sort.querySelector('.list-sort-chips') as HTMLElement;
    const chips = [...carril.querySelectorAll<HTMLElement>('.list-sort-chip')];
    const cabecera = document.querySelector('.list-head') as HTMLElement;
    const controles = document.querySelector('.view-controls') as HTMLElement;
    const canto = carril.getBoundingClientRect().right;
    return {
      escalon: sort.className,
      desplazamiento: carril.scrollWidth - carril.clientWidth,
      opciones: chips.length,
      asomanPorElCanto: chips.filter((c) => c.getBoundingClientRect().right > canto + 1).length,
      // Distancia de los controles al canto derecho de la barra, descontando su relleno.
      alCantoDerecho: Math.round(cabecera.getBoundingClientRect().right - controles.getBoundingClientRect().right),
    };
  });
}

test.describe('la cabecera del listado', () => {
  /* 390 y 360 son los dos anchos que hay que vigilar: el más común de todos y el otro más común de Android.
     En el primero las cinco entran en una línea cediendo el rótulo y el cuerpo; en el segundo ya no hay letra
     que valga y se parten en dos, que sigue siendo mejor que esconderlas. */
  for (const ancho of [390, 360, 320]) {
    test(`en ${ancho} px se ven las cinco columnas de orden y no hay nada que arrastrar`, async ({ page }) => {
      await abrir(page, ancho);
      const m = await medir(page);
      expect(m.opciones, 'faltan columnas de orden').toBe(5);
      expect(m.desplazamiento, `el orden se quedó con carril (${m.escalon})`).toBeLessThanOrEqual(1);
      expect(m.asomanPorElCanto, `hay columnas cortadas por el canto (${m.escalon})`).toBe(0);
    });
  }

  test('los controles de vista se quedan en el canto derecho, no pegados al recuento', async ({ page }) => {
    await abrir(page, 390);
    const estrecho = await medir(page);
    expect(estrecho.alCantoDerecho, 'los controles se han soltado del canto').toBeLessThan(24);
    // Y en escritorio, lo mismo: es la misma regla, no dos.
    await abrir(page, 1200);
    const ancho = await medir(page);
    expect(ancho.alCantoDerecho, 'los controles se han soltado del canto').toBeLessThan(24);
  });

  test('con sitio de sobra, el rótulo «Ordenar» vuelve', async ({ page }) => {
    // El escalón no puede ser un pestillo de un solo sentido: al ensanchar hay que poder volver a subir.
    await abrir(page, 1200);
    await expect(page.locator('.list-sort')).not.toHaveClass(/is-sin-rotulo/);
    await expect(page.locator('.list-sort-label')).toBeVisible();
  });
});
