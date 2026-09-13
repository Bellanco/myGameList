import { expect, test, type Page } from '@playwright/test';
import { JUEGOS, sembrarBiblioteca } from './seed';

/**
 * EL AVISO TIENE QUE VERSE CUANDO SALTA.
 *
 * De dónde viene esto: el aviso vivía en el flujo del documento, arriba del todo y sin `position`, así que uno
 * disparado con la lista desplazada nacía FUERA DE LA PANTALLA —se medía en `top: -1708` en un Pixel 8 y en
 * `top: -1166` en escritorio—. Se anunciaba por la región viva, pero quien mira no veía nada. Se tapó con un
 * `sticky` bajo la cabecera.
 *
 * AHORA EL AVISO ES UNA CÁPSULA EN EL CARRIL FLOTANTE de abajo a la izquierda, el mismo del aviso de logro y del
 * administrador, así que el problema no puede volver: su sitio no depende de dónde esté el desplazamiento. Lo que
 * se comprueba aquí cambia en consecuencia —ya no tiene sentido preguntar si «se ha pegado sin hacer falta»— pero
 * la regla de fondo es la misma y es la que importa: cuando salta, se ve entero.
 *
 * Y ADEMÁS NO TAPA LA BARRA INFERIOR, que es lo que hay que vigilar en un carril fijo: la barra es la navegación
 * de la app, y un aviso encima de «Listados / Social / Estadísticas» deja la aplicación sin timón hasta que se
 * apaga solo.
 *
 * ES UN RECORRIDO END-TO-END Y NO PUEDE SER OTRA COSA: `position: fixed` no existe en jsdom —ahí todo mide cero y
 * toda caja cae en el mismo sitio—, así que un test de componente daría verde con el carril roto.
 */

/** La cápsula del aviso de la app. El logro y el anuncio comparten carril, así que se pide por su modificador. */
const aviso = (page: Page) => page.locator('.ach-toast.is-notice');

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
  await expect(aviso(page)).toBeVisible();
}

/** Dónde ha quedado el aviso respecto a la ventana. */
async function sitioDelAviso(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ach-toast.is-notice');
    if (!el) return null;
    const caja = el.getBoundingClientRect();
    const barra = document.querySelector('.bottom-nav')?.getBoundingClientRect() || null;
    return {
      arriba: Math.round(caja.top),
      abajo: Math.round(caja.bottom),
      alto: Math.round(caja.height),
      ventana: window.innerHeight,
      barraArriba: barra ? Math.round(barra.top) : null,
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
      expect(sitio, 'el aviso no está en el DOM').not.toBeNull();
      // DENTRO de la ventana: ni por encima del borde superior ni por debajo del inferior.
      expect(sitio!.abajo, `${nombre}: el aviso queda por encima de la pantalla`).toBeGreaterThan(0);
      expect(sitio!.arriba, `${nombre}: el aviso queda por debajo de la pantalla`).toBeLessThan(sitio!.ventana);
      // Y ENTERO, no asomando por un pixel: se tiene que poder leer.
      expect(sitio!.arriba, `${nombre}: el aviso sale cortado por arriba`).toBeGreaterThanOrEqual(0);
      expect(sitio!.abajo, `${nombre}: el aviso sale cortado por abajo`).toBeLessThanOrEqual(sitio!.ventana);
    });

    /**
     * EN LA MITAD DE ABAJO Y SIN TAPAR LA BARRA. Las dos cosas a la vez: que flote donde se decidió —el carril de
     * las cápsulas, no el hueco de antes bajo la cabecera— y que respete la navegación, que es el único elemento
     * que no puede quedar debajo de nada.
     */
    test(`flota abajo, encima de la barra de navegación y sin taparla (${nombre})`, async ({ page }) => {
      await guardarConLaListaDesplazada(page);

      const sitio = await sitioDelAviso(page);
      expect(sitio!.arriba, `${nombre}: el aviso no está en la mitad de abajo`).toBeGreaterThan(sitio!.ventana / 2);
      expect(sitio!.barraArriba, `${nombre}: no se encontró la barra inferior`).not.toBeNull();
      expect(sitio!.abajo, `${nombre}: el aviso se monta sobre la barra inferior`)
        .toBeLessThanOrEqual(sitio!.barraArriba!);
    });

    /**
     * Y SU SITIO NO DEPENDE DEL DESPLAZAMIENTO, que es justo lo que arregla haberlo sacado del flujo: con la
     * página arriba del todo cae en el mismo punto que con la lista bajada.
     */
    test(`sin desplazar cae en el mismo sitio (${nombre})`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme: 'dark' });
      await page.goto('/completados');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(JUEGOS[0].name) }).first().click();
      await page.getByRole('button', { name: /^Editar - / }).first().click();
      await page.getByRole('button', { name: /Guardar/i }).first().click();
      await expect(aviso(page)).toBeVisible();

      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(() => window.scrollY), `${nombre}: la página no ha vuelto arriba`).toBe(0);
      const sitio = await sitioDelAviso(page);
      expect(sitio!.arriba, `${nombre}: el aviso no está en la mitad de abajo`).toBeGreaterThan(sitio!.ventana / 2);
      expect(sitio!.abajo, `${nombre}: el aviso sale cortado por abajo`).toBeLessThanOrEqual(sitio!.ventana);
    });
  });
}
