import { expect, test } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * EL SCROLL AL CAMBIAR DE PANTALLA, en el build de producción.
 *
 * QUÉ CUBRE QUE NO CUBRE NADA MÁS. Los de componente prueban el reparto en jsdom —entrar sube, un ancla no
 * toca, un `replace` tampoco—, pero ahí no hay ni layout ni scroll: `window.scrollY` siempre vale 0, así que
 * la mitad que de verdad se nota —VOLVER y encontrarte donde estabas— no se puede comprobar. Aquí sí: hay
 * altura, hay barra y hay historial de verdad.
 *
 * La ventana se estrecha a propósito: con la biblioteca amplia y 600 px de alto hay página de sobra que
 * desplazar, que es la condición para que el test signifique algo.
 */
test.describe('el scroll al cambiar de pantalla', () => {
  test.beforeEach(async ({ page }) => {
    await sembrarBiblioteca(page, { amplia: true });
    await page.setViewportSize({ width: 900, height: 600 });
  });

  test('sube al entrar y vuelve a su sitio al salir', async ({ page }) => {
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Bajar por el listado. Se comprueba que de verdad se movió: si la página no tuviera scroll, el resto del
    // test pasaría sin probar nada.
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    const dondeEstaba = await page.evaluate(() => window.scrollY);

    // ENTRAR en otra pantalla: arriba del todo.
    await page.getByRole('button', { name: /Lista de la vergüenza/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista de la vergüenza');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    // VOLVER: al sitio en el que se estaba, no al principio.
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(dondeEstaba);
  });

  /**
   * Y EN RUTAS ANIDADAS, que es donde más se nota: el listado de reseñas del perfil abre una pantalla propia
   * (`/perfil/resenas/:id`) y se vuelve con su botón. Aquí el cambio no es solo de pestaña: se monta un chunk
   * perezoso, así que al volver la pantalla tarda en tomar su altura — que es justo el caso para el que el hook
   * insiste unos fotogramas en vez de rendirse al primero.
   */
  test('vuelve también desde una pantalla anidada, con su chunk perezoso por medio', async ({ page }) => {
    await page.goto('/perfil');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // El panel se pinta por bloques: sin esperar a que tenga alto, el scroll de abajo no tendría a dónde ir.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight), { timeout: 10_000 })
      .toBeGreaterThan(1200);

    await page.evaluate(() => window.scrollTo(0, 500));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    const dondeEstaba = await page.evaluate(() => window.scrollY);

    await page.getByRole('button', { name: /^Leer tu reseña de/ }).first().click();
    await expect(page.locator('.hub-related-list')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    /* SE COMPRUEBA LA ZONA, NO EL PÍXEL, y no es un test flojo: al pulsar, el navegador desplaza un poco la
       página para enseñar el botón que recibe el foco, así que la posición que se deja no es exactamente la que
       el test fijó. Lo que importa —y lo que estaba roto— es que se vuelve a donde estabas y no al principio. */
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - dondeEstaba)).toBeLessThan(250);
  });

  /**
   * RECARGAR NO ES NAVEGAR. Ahí manda `history.scrollRestoration` del navegador, y pisarlo subiría al principio
   * a quien recarga a media lista sin haber pedido ir a ninguna parte.
   *
   * SE CUENTAN SOLO LAS LLAMADAS DE LA APLICACIÓN, que son las de dos números —`scrollTo(0, y)`, la forma que
   * usa `useScrollOnNavigate`—. El virtualizador del listado llama al suyo con un objeto (`{top: 0}`) nada más
   * montarse, y ese no es asunto de este test: no viene de una navegación y es, de hecho, la razón por la que
   * recargar tampoco conserva la posición aunque nosotros no la toquemos.
   *
   * Y no se comprueba que el navegador CONSIGA restaurar: eso depende de si la lista ha terminado de pintarse
   * cuando él lo intenta, y un test que dependa de esa carrera delata unas veces sí y otras no.
   */
  test('la carga inicial no la mueve la aplicación: ahí manda el navegador', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __movidas: number }).__movidas = 0;
      const original = window.scrollTo.bind(window);
      window.scrollTo = ((...args: unknown[]) => {
        if (args.length === 2) (window as unknown as { __movidas: number }).__movidas += 1;
        return (original as (...a: unknown[]) => void)(...args);
      }) as typeof window.scrollTo;
    });

    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Un momento de gracia por si algún efecto llegara tarde.
    await page.waitForTimeout(700);

    expect(await page.evaluate(() => (window as unknown as { __movidas: number }).__movidas)).toBe(0);
  });
});
