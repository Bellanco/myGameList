import { expect, test, type Page } from '@playwright/test';
import { JUEGOS, sembrarBiblioteca } from './seed';

/**
 * EL AVISO TIENE QUE VERSE CUANDO SALTA.
 *
 * El banner vivía en el flujo del documento, arriba del todo y sin `position`, así que un aviso disparado con la
 * lista desplazada nacía FUERA DE LA PANTALLA: se medía en `top: -1708` en un Pixel 8 y en `top: -1166` en
 * escritorio. Se anunciaba por la región viva —eso siempre funcionó— pero quien mira no veía nada.
 *
 * Importa más de lo que parece desde que hay logros. El §7.4 del plan existe justo para que el desbloqueo se
 * cuente EN EL INSTANTE, y su propio texto describe el fallo que quiere evitar: «marcas un juego como terminado y
 * el logro aparece callado tres días después. Técnicamente correcto y emocionalmente nulo». Un aviso que salta
 * donde no se ve deja exactamente ese resultado.
 *
 * ES UN RECORRIDO END-TO-END Y NO PUEDE SER OTRA COSA: `position: sticky` no existe en jsdom —ahí todo mide cero
 * y toda caja cae en el mismo sitio—, así que un test de componente daría verde con el banner roto.
 */

/** Baja por la lista, edita un juego y guarda: la escritura que dispara el aviso. */
async function guardarConLaListaDesplazada(page: Page): Promise<void> {
  await sembrarBiblioteca(page, { amplia: true, theme: 'dark' });
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Con 36 juegos, editar algo de la mitad es lo normal; es también donde el aviso se perdía.
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Juego de prueba 20\b/ }).first().click();
  await page.getByRole('button', { name: /^Editar - / }).first().click();
  await page.getByRole('button', { name: /Guardar/i }).first().click();
  await expect(page.locator('.status-banner')).toBeVisible();
}

/** Dónde ha quedado el aviso respecto a la ventana. */
async function sitioDelAviso(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.status-banner');
    if (!el) return null;
    const caja = el.getBoundingClientRect();
    return {
      arriba: Math.round(caja.top),
      abajo: Math.round(caja.bottom),
      alto: Math.round(caja.height),
      ventana: window.innerHeight,
    };
  });
}

for (const [nombre, viewport] of [
  // Pixel 8: 1080×2400 físicos con DPR 2,625 → 412×915 CSS.
  ['Pixel 8', { width: 412, height: 915 }],
  ['escritorio', { width: 1440, height: 900 }],
] as const) {
  test.describe(nombre, () => {
    test.use({ viewport });

    test(`el aviso se ve aunque se guarde con la lista desplazada (${nombre})`, async ({ page }) => {
      await guardarConLaListaDesplazada(page);

      const sitio = await sitioDelAviso(page);
      expect(sitio, 'el banner no está en el DOM').not.toBeNull();
      // DENTRO de la ventana: ni por encima del borde superior ni por debajo del inferior.
      expect(sitio!.abajo, `${nombre}: el aviso queda por encima de la pantalla`).toBeGreaterThan(0);
      expect(sitio!.arriba, `${nombre}: el aviso queda por debajo de la pantalla`).toBeLessThan(sitio!.ventana);
      // Y ENTERO, no asomando por un pixel: se tiene que poder leer.
      expect(sitio!.arriba, `${nombre}: el aviso sale cortado por arriba`).toBeGreaterThanOrEqual(0);
      expect(sitio!.abajo, `${nombre}: el aviso sale cortado por abajo`).toBeLessThanOrEqual(sitio!.ventana);
    });

    /**
     * Y NO SE COME LA PANTALLA CUANDO NO HACE FALTA: con la página sin desplazar, el aviso sigue donde siempre
     * —bajo la cabecera, en el flujo— en vez de flotar sobre el contenido desde el primer momento.
     *
     * Va con la biblioteca PEQUEÑA a propósito: con las 36 fichas no existe el caso, porque pulsar una fila la
     * desplaza a la vista y ya no hay nada «sin desplazar» que comprobar.
     */
    test(`sin desplazar, el aviso sigue en su sitio de siempre (${nombre})`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme: 'dark' });
      await page.goto('/completados');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(JUEGOS[0].name) }).first().click();
      await page.getByRole('button', { name: /^Editar - / }).first().click();
      await page.getByRole('button', { name: /Guardar/i }).first().click();
      await expect(page.locator('.status-banner')).toBeVisible();

      // ARRIBA DEL TODO PARA MEDIR, porque el recorrido puede haberse desplazado por su cuenta: el «Guardar» del
      // editor queda a unos 65 px del borde inferior, y basta con que las fuentes del sistema midan un poco más
      // —las del CI miden más que las de macOS— para que caiga fuera y haya que ir a por él. Eso no dice nada del
      // aviso: el `sticky` es CSS puro, sin memoria, y se lee del desplazamiento de ESTE instante.
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => window.scrollY), `${nombre}: la página no ha vuelto arriba`).toBe(0);
      const sitio = await sitioDelAviso(page);
      // Donde lo pone el flujo, bajo la cabecera. Pegado se quedaría en el `top: .5rem` del sticky, o sea 8.
      expect(sitio!.arriba, `${nombre}: el aviso se ha pegado arriba sin hacer falta`).toBeGreaterThan(8);
    });
  });
}
