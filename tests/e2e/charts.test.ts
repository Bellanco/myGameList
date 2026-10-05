import { test, expect, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * La GRÁFICA ANUAL en pantalla estrecha, que es donde sus rótulos se estorban.
 *
 * Lo que se comprueba aquí no es el color ni el orden, sino el SITIO: cuántas cifras y cuántos años se quedan a
 * la vista y si alguno pisa a su vecino. Es la clase de fallo que no rompe ninguna prueba de unidad —el
 * componente pinta lo que tiene que pintar— y que solo existe cuando hay un motor de maquetación midiendo de
 * verdad, así que su sitio es un recorrido de navegador.
 *
 * Viene de un fallo concreto: el reparto lo decidía una regla de CSS que escondía UN RÓTULO DE CADA DOS por
 * debajo de 34 rem. Con ocho años en un móvil se perdían tres cifras —la del último año incluida— aunque
 * sobrase sitio de largo, y a la vez la píldora del récord seguía montándose encima de su vecina, que era el
 * choque que la regla decía evitar. Ahora el reparto se MIDE (`useFittingLabels`), y esto lo vigila.
 */

/**
 * Rótulos y su caja. La visibilidad se pregunta con `checkVisibility` y no mirando una propiedad concreta: lo
 * que esta prueba vigila es si el número SE VE, no con qué mecanismo se esconde.
 */
async function rotulos(page: Page, selector: string) {
  return page.evaluate((sel) => [...document.querySelectorAll(sel)]
    .map((el) => ({ texto: el.textContent ?? '', visible: el.checkVisibility({ visibilityProperty: true }), caja: el.getBoundingClientRect() }))
    .map(({ texto, visible, caja }) => ({ texto, visible, x: caja.x, derecha: caja.right, y: caja.y, abajo: caja.bottom })), selector);
}

type Rotulo = Awaited<ReturnType<typeof rotulos>>[number];

/**
 * Los pares de rótulos VISIBLES que se pisan. Vacío es lo que tiene que devolver siempre.
 *
 * Se miran las DOS direcciones, que es como se reparten: las cifras cuelgan de su punto, así que dos vecinas
 * pueden montarse en horizontal y no estorbarse porque la curva las deja a alturas distintas.
 */
function solapes(fila: Rotulo[]): string[] {
  const vistos = fila.filter((rotulo) => rotulo.visible);
  return vistos.flatMap((rotulo, index) => vistos.slice(index + 1)
    .filter((otro) => rotulo.derecha > otro.x && otro.derecha > rotulo.x && rotulo.abajo > otro.y && otro.abajo > rotulo.y)
    .map((otro) => `${rotulo.texto}/${otro.texto}`));
}

/** Deja la curva anual pintada y quieta: las tarjetas del panel se destapan al llegar a ellas. */
async function graficaAnual(page: Page): Promise<void> {
  await page.goto('/stats');
  await expect(page.locator('.stats-hub')).toBeVisible();
  // Destapadas a mano: mientras la tarjeta espera su turno, sus animaciones están EN PAUSA, y una animación
  // pausada no termina nunca —la espera de abajo se quedaría ahí—.
  await page.evaluate(() => {
    const hub = document.querySelector('.stats-hub');
    hub?.classList.remove('is-watching');
    hub?.querySelectorAll(':scope > *').forEach((tarjeta) => tarjeta.classList.add('is-in'));
  });
  await expect(page.locator('.year-trend').first()).toBeVisible();
  await page.waitForFunction(() => document
    .getAnimations()
    .filter((animacion) => (animacion.effect?.getComputedTiming().iterations ?? 1) !== Infinity)
    .every((animacion) => animacion.playState === 'finished' || animacion.playState === 'idle'));
}

test.describe('gráfica «Año a año» en pantalla estrecha', () => {
  test('con una serie corta no se esconde ningún número ni ningún año', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // La biblioteca amplia son ocho años: caben todos en un móvil, y antes se perdían tres.
    await sembrarBiblioteca(page, { amplia: true });
    await graficaAnual(page);

    const cifras = await rotulos(page, '.year-value');
    const eje = await rotulos(page, '.year-axis span');
    expect(cifras.filter((cifra) => !cifra.visible)).toEqual([]);
    expect(eje.filter((anyo) => !anyo.visible)).toEqual([]);
    // Y el último año de la serie es justo el que no puede faltar: es hasta dónde llega la curva.
    expect(cifras.at(-1)?.visible).toBe(true);
    expect(eje.at(-1)?.visible).toBe(true);
  });

  test('con una serie larga se cae lo justo, y lo que queda no se pisa', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    // La curva larga son veinticuatro años, con el récord pegado al último: en 360 px no caben todas las cifras.
    await sembrarBiblioteca(page, { curva: true });
    await graficaAnual(page);

    const estrecho = await rotulos(page, '.year-value');
    expect(solapes(estrecho)).toEqual([]);
    expect(solapes(await rotulos(page, '.year-axis span'))).toEqual([]);
    // Ni el récord ni el año en curso se caen nunca: el primero es la cifra que se busca y el segundo es
    // dónde estás ahora. Y caen seguidos en cuanto el mejor año es reciente, que es el caso de esta serie.
    await expect(page.locator('.year-value.is-peak')).toBeVisible();
    expect(estrecho.at(-1)?.visible).toBe(true);

    // Al girar el aparato hay más sitio, y se nota: el reparto se mide, no se decide por una consulta de medios.
    const aLaVista = estrecho.filter((cifra) => cifra.visible).length;
    await page.setViewportSize({ width: 800, height: 390 });
    await page.waitForFunction(
      (cuantas) => [...document.querySelectorAll('.year-value')]
        .filter((el) => el.checkVisibility({ visibilityProperty: true })).length > cuantas,
      aLaVista,
    );
    const apaisado = await rotulos(page, '.year-value');
    expect(apaisado.filter((cifra) => cifra.visible).length).toBeGreaterThan(aLaVista);
    expect(solapes(apaisado)).toEqual([]);
  });

  /**
   * La paleta «Sin salida» trae su tipografía de la red (ver `themes/portal.scss`). Hasta que entra, las cifras
   * se pintan con la de reserva y miden otra cosa, y el lienzo NO cambia de tamaño cuando llega la buena: si el
   * reparto no se rehace, se queda hecho con anchos que ya no son los suyos y los rótulos acaban encima unos de
   * otros. Aquí se ve o no se ve.
   */
  test('con la tipografía del tema, el reparto se rehace cuando llegan las letras', async ({ page }) => {
    await page.setViewportSize({ width: 433, height: 900 });
    await sembrarBiblioteca(page, { curva: true, palette: 'portal', theme: 'dark' });
    await graficaAnual(page);

    const cifras = await rotulos(page, '.year-value');
    expect(solapes(cifras)).toEqual([]);
    await expect(page.locator('.year-value.is-peak')).toBeVisible();
    expect(cifras.at(-1)?.visible).toBe(true);
  });
});

/**
 * LOS GLOBOS DE LA EVOLUCIÓN DE LAS LISTAS, en el teléfono más estrecho y con el texto del sistema grande (el
 * +30 % con el que usa el móvil el dueño de la app). Un globo oculto MIDE igual (`visibility`), así que uno que se
 * salga del lienzo estira el scroll de la página entera: pasó a 320 px, 14 px de más. Se vigilan las dos cosas, la
 * página sin scroll lateral y cada globo dentro de su lienzo, abierto o no.
 */
test.describe('globos de «Evolución de tus listas» en pantalla estrecha', () => {
  test('a 320 px con el texto grande, ningún globo se sale ni ensancha la página', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 21, fixed: 17 } });
    await sembrarBiblioteca(page, { amplia: true });
    await page.goto('/stats');
    const lienzo = page.locator('.backlog-canvas').first();
    await expect(lienzo).toBeAttached();
    await lienzo.scrollIntoViewIfNeeded();

    const fuera = await page.evaluate(() => {
      const canvas = document.querySelector('.backlog-canvas')!.getBoundingClientRect();
      return [...document.querySelectorAll('.backlog-tip')]
        .map((tip) => tip.getBoundingClientRect())
        .filter((caja) => caja.left < canvas.left - 0.5 || caja.right > canvas.right + 0.5).length;
    });
    expect(fuera).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

    // Y el de en medio, abierto de verdad, se ve entero.
    const hits = page.locator('.backlog-hit');
    await hits.nth(Math.floor((await hits.count()) / 2)).hover();
    const abierto = page.locator('.backlog-hit:hover .backlog-tip');
    await expect(abierto).toBeVisible();
    const [caja, marco] = await Promise.all([abierto.boundingBox(), lienzo.boundingBox()]);
    expect(caja!.x).toBeGreaterThanOrEqual(marco!.x - 0.5);
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(marco!.x + marco!.width + 0.5);
  });
});
