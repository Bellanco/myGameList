import { expect, test, type Locator, type Page } from '@playwright/test';
import { JUEGOS, sembrarBiblioteca, type JuegoAmplio } from './seed';

// LA FICHA DE UN JUEGO SOBRE EL BUILD (F6 del plan de la ficha): lo que jsdom no ve. El scroll de la lista de debajo,
// el chunk perezoso en frío, el foco al cerrar, el service worker sin red y el gesto del móvil.

/** 130 juegos: por encima de los 120 a partir de los que la tabla virtualiza (`WINDOW_VIRTUALIZE_MIN_ROWS`). */
const GRANDE: JuegoAmplio[] = Array.from({ length: 130 }, (_unused, i) => ({
  id: 1000 + i,
  name: `Juego de la lista ${String(i + 1).padStart(3, '0')}`,
  grade: 50 + (i % 50),
  score: 3,
  genres: ['Aventura'],
  years: [2020 + (i % 6)],
  semanasAtras: i,
}));

const ficha = (page: Page) => page.locator('dialog.gs-dialog[open] .gs-panel');

/** El botón de un juego que se ve entero en pantalla, lejos de los bordes: pulsarlo no obliga a desplazar nada. */
async function juegoALaVista(page: Page, selector: string): Promise<Locator> {
  const indice = await page.evaluate((sel) => [...document.querySelectorAll(sel)].findIndex((el) => {
    const r = el.getBoundingClientRect();
    return r.top > 160 && r.bottom < innerHeight - 160;
  }), selector);
  expect(indice).toBeGreaterThanOrEqual(0);
  return page.locator(selector).nth(indice);
}

async function listaGrandeBajada(page: Page): Promise<number> {
  await sembrarBiblioteca(page, { amplia: true, biblioteca: GRANDE });
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(300);
  return page.evaluate(() => Math.round(window.scrollY));
}

test.describe('la ficha de un juego · sobre la lista', () => {
  test('abrir y volver atrás no mueven el scroll de la lista (con 130 juegos)', async ({ page }) => {
    const antes = await listaGrandeBajada(page);
    expect(antes).toBeGreaterThan(1000);
    await (await juegoALaVista(page, '.row-toggle')).click();
    await expect(ficha(page)).toBeVisible();
    await expect(page).toHaveURL(/[?&]juego=/);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - antes)).toBeLessThan(2);

    await page.goBack();
    await expect(page.locator('dialog.gs-dialog[open]')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]juego=/);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - antes)).toBeLessThan(2);
  });

  test('recargar con `?juego=` la abre, con el chunk del panel en frío', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto(`/completados?juego=hollow-knight`);
    await expect(page.getByRole('dialog', { name: `Ficha de ${JUEGOS[0].name}` })).toBeVisible();
  });

  test('Esc la cierra y el foco vuelve al juego del que se abrió', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    const fila = page.locator('button.row-toggle', { hasText: JUEGOS[0].name });
    await fila.focus();
    await page.keyboard.press('Enter');
    await expect(ficha(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.gs-dialog[open]')).toHaveCount(0);
    await expect(fila).toBeFocused();
    await expect(page).not.toHaveURL(/[?&]juego=/);
  });

  /* EL DOBLE CLIC: la ficha se abre al primer clic, sin esperar (17-10-2026). Con una pausa de persona, el segundo clic
     cae en el velo, que no cierra y abre el formulario; sin pausa, aún llega a la fila y el formulario espera a la
     ficha. En los dos casos el formulario queda ENCIMA, y Esc lo cierra a él y deja la ficha. */
  for (const [caso, pausa] of [['con pausa de persona', 120], ['sin pausa', 0]] as const) {
    test(`el doble clic abre la ficha y el formulario de edición encima (${caso})`, async ({ page }) => {
      await sembrarBiblioteca(page);
      await page.goto('/completados');
      const caja = await page.locator('button.row-toggle', { hasText: JUEGOS[0].name }).boundingBox();
      if (!caja) throw new Error('sin fila');
      await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
      await page.mouse.down({ clickCount: 1 });
      await page.mouse.up({ clickCount: 1 });
      if (pausa) await page.waitForTimeout(pausa);
      await page.mouse.down({ clickCount: 2 });
      await page.mouse.up({ clickCount: 2 });

      const formulario = page.getByRole('dialog', { name: 'Editar juego' });
      await expect(formulario).toBeVisible();
      await expect(ficha(page)).toBeVisible();
      const encima = await formulario.evaluate((dialog) => {
        const r = dialog.querySelector('.modal')!.getBoundingClientRect();
        return document.elementFromPoint(r.right - 30, r.top + 30)?.closest('dialog') === dialog;
      });
      expect(encima).toBe(true);
      await page.keyboard.press('Escape');
      await expect(formulario).toBeHidden();
      await expect(ficha(page)).toBeVisible();
    });
  }
});

test.describe('la ficha de un juego · en el mosaico', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mis-listas-list-shape', 'grid'));
  });

  test('igual que en la lista: no mueve el scroll y Esc devuelve el foco a la caja', async ({ page }) => {
    const antes = await listaGrandeBajada(page);
    const caja = await juegoALaVista(page, '.game-card-open');
    await caja.focus();
    await page.keyboard.press('Enter');
    await expect(ficha(page)).toBeVisible();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - antes)).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.gs-dialog[open]')).toHaveCount(0);
    await expect(caja).toBeFocused();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - antes)).toBeLessThan(2);
  });
});

test.describe('la ficha de un juego · sin conexión', () => {
  test('con el service worker recién instalado y sin red, abre con lo tuyo y sin lo de fuera', async ({ page, context }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    // El primer arranque instala el service worker; hace falta una recarga para que controle la página (como en el
    // smoke). La ficha no se ha abierto nunca.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Sin red de verdad (`setOffline` corta también la del service worker) y con `navigator.onLine` en falso, que es
    // lo que hace un navegador real y Playwright no simula. La recarga deja la página sin nada del panel en memoria:
    // si abre, es que el service worker lo tenía guardado.
    await context.setOffline(true);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
    await page.locator('button.row-toggle', { hasText: JUEGOS[0].name }).click();
    const panel = page.getByRole('dialog', { name: `Ficha de ${JUEGOS[0].name}` });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.gs-sec-datos')).toBeVisible();
    // Lo de fuera (tus amistades) no se pinta, y no hay error que enseñar.
    await expect(panel.locator('.gs-sec-amistades')).toHaveCount(0);
    await expect(page.getByText(/network|Failed to fetch|algo ha ido mal/i)).toHaveCount(0);
  });
});

test.describe('la ficha de un juego · en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /* El panel que entra desborda el `<dialog>`, y `showModal()` enfoca la X, que aún está fuera: con el `overflow` del
     navegador, el diálogo se desplazaba el ancho del panel para enseñarla y la entrada iba de un lado a otro (Firefox).
     Recortado (`overflow: clip`), no hay scroll que mover. */
  test('al entrar, el diálogo no se desplaza para enseñar la X enfocada', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await page.evaluate(() => {
      const registro: number[] = [];
      (window as unknown as { __scroll: number[] }).__scroll = registro;
      const t0 = performance.now();
      const tick = () => {
        const dialogo = document.querySelector('dialog.gs-dialog[open]');
        if (dialogo) registro.push(dialogo.scrollLeft);
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.locator('button.row-toggle', { hasText: JUEGOS[0].name }).tap();
    await expect(ficha(page)).toBeVisible();
    await page.waitForTimeout(700);
    const desplazamientos = await page.evaluate(() => (window as unknown as { __scroll: number[] }).__scroll);
    expect(desplazamientos.length).toBeGreaterThan(5);
    expect(Math.max(...desplazamientos)).toBe(0);
  });

  test('deslizarla a la derecha la cierra y quita `?juego=`; el gesto vertical queda para el scroll', async ({ page }) => {
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await page.locator('button.row-toggle', { hasText: JUEGOS[0].name }).tap();
    const panel = ficha(page);
    await expect(panel).toBeVisible();
    await page.waitForTimeout(500);

    // El scroll vertical se lo queda el navegador: el panel solo reclama el gesto horizontal.
    await expect(panel).toHaveCSS('touch-action', 'pan-y');

    const caja = await panel.boundingBox();
    if (!caja) throw new Error('el panel no tiene caja');
    const x = caja.x + 40;
    const y = caja.y + caja.height / 2;
    const comun = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true };
    await panel.dispatchEvent('pointerdown', { ...comun, clientX: x, clientY: y });
    for (let paso = 1; paso <= 8; paso += 1) {
      await panel.dispatchEvent('pointermove', { ...comun, clientX: x + paso * 30, clientY: y + 2 });
    }
    await panel.dispatchEvent('pointerup', { ...comun, clientX: x + 240, clientY: y + 2 });

    await expect(page.locator('dialog.gs-dialog[open]')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]juego=/);
  });
});
