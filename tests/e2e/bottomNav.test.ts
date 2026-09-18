import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LA BARRA INFERIOR CON CUATRO PESTAÑAS TIENE QUE CABER ENTERA.
 *
 * Ajustes vuelve a la barra desde el botón flotante en el que estuvo, y pasar de tres columnas a cuatro estrecha
 * cada una un 25 %: es justo el cambio que puede sacar un rótulo de su pastilla. `BottomNavigation` lo resuelve
 * MIDIENDO —baja a icono sobre rótulo y, si tampoco cabe, a icono solo—, y esa medida depende de la tipografía
 * real y del ancho real, dos cosas que en jsdom valen cero: un test de componente daría verde con la barra rota.
 *
 * 280 px es el suelo que promete el componente, y el peor caso posible: el rótulo más largo («Estadísticas») en
 * la columna más estrecha. Lo que no puede ceder en ningún ancho: los 48 px de diana, que la barra no desborde y
 * que los cuatro sigan teniendo nombre para quien usa un lector de pantalla.
 */

const barra = (page: Page) => page.locator('.bottom-nav');

async function abrir(page: Page, ancho: number): Promise<void> {
  await page.setViewportSize({ width: ancho, height: 720 });
  await sembrarBiblioteca(page, { theme: 'dark' });
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // La medida se toma con la tipografía del tema ya cargada: con la de reserva, más estrecha, la barra cree que
  // cabe en una línea y decide de más (es la razón del `document.fonts.ready` del componente).
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function medir(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav') as HTMLElement;
    const inner = nav.querySelector('.bottom-nav-inner') as HTMLElement;
    const botones = [...nav.querySelectorAll<HTMLElement>('.bottom-nav-btn')];
    return {
      desborde: inner.scrollWidth - inner.clientWidth,
      derecha: Math.round(inner.getBoundingClientRect().right),
      ancho: window.innerWidth,
      modo: nav.className,
      botones: botones.map((b) => {
        const rotulo = b.querySelector('span');
        return {
          nombre: (b.textContent || '').trim(),
          alto: Math.round(b.getBoundingClientRect().height),
          // El rótulo puede estar oculto A LA VISTA, pero nunca borrado del DOM.
          rotuloEnElDom: !!rotulo,
          // Y «a la vista» se pregunta de verdad: `sr-only` lo deja en el DOM y fuera de la pantalla.
          rotuloVisible: !!rotulo && !rotulo.classList.contains('sr-only'),
          // CUÁNTO AIRE le queda al rótulo dentro de su pastilla. No basta con preguntar si desborda: el
          // componente promete `BTN_AIR` (10px) porque por debajo de eso el nombre va pegado al borde y la
          // barra se lee apretada aunque técnicamente quepa. Y el desbordamiento del CONTENEDOR no lo ve: la
          // rejilla reparte columnas iguales y un rótulo puede asomar sobre su vecino sin que la barra crezca.
          aire: rotulo ? Math.round(b.getBoundingClientRect().width - rotulo.scrollWidth) : 0,
        };
      }),
    };
  });
}

test.describe('la barra inferior con cuatro pestañas', () => {
  test('en un móvil normal caben las cuatro CON su nombre a la vista', async ({ page }) => {
    // 390px es el ancho más común que hay. Con cuatro columnas, «Estadísticas» a cuerpo de una línea no cabe y
    // la barra se rendía al modo solo-icono: cuatro dibujos mudos y ninguna palabra. Lo que lo evita es que el
    // rótulo baje un paso al apilarse, y esto es lo que lo vigila.
    await abrir(page, 390);
    const m = await medir(page);
    expect(m.botones.map((b) => b.nombre)).toEqual(['Listados', 'Social', 'Estadísticas', 'Ajustes']);
    expect(m.desborde).toBe(0);
    expect(m.derecha).toBeLessThanOrEqual(m.ancho);
    expect(m.modo).not.toContain('is-icons');
    for (const b of m.botones) {
      expect(b.alto, b.nombre).toBeGreaterThanOrEqual(48);
      expect(b.rotuloVisible, b.nombre).toBe(true);
      expect(b.aire, `${b.nombre} va pegado al borde de su pastilla`).toBeGreaterThanOrEqual(10);
    }
  });

  test('en 280 px sigue entrando entera, con sus dianas y sus nombres', async ({ page }) => {
    await abrir(page, 280);
    const m = await medir(page);
    expect(m.desborde).toBe(0);
    expect(m.derecha).toBeLessThanOrEqual(m.ancho);
    for (const b of m.botones) {
      expect(b.alto, b.nombre).toBeGreaterThanOrEqual(48);
      expect(b.rotuloEnElDom, b.nombre).toBe(true);
    }
    // La barra ha tenido que ceder algo para caber: o apila el icono sobre el rótulo, o se queda en icono.
    await expect(barra(page)).toHaveClass(/is-stacked|is-icons/);
  });

  test('la pestaña de Ajustes despliega su menú en vez de navegar', async ({ page }) => {
    // Es la única pestaña que no lleva a una pantalla: abre los cuatro grupos. Lo que sí comparte con las
    // demás es que el destino queda marcado, y eso se comprueba al llegar (ver `settingsMenu.test.ts`).
    await abrir(page, 390);
    const pestana = page.getByRole('button', { name: 'Ajustes' });
    // `true` y no `menu`: lo que despliega es un `<nav>` de enlaces, no un menú ARIA con teclado de flechas.
    await expect(pestana).toHaveAttribute('aria-haspopup', 'true');
    await pestana.click();
    await expect(page.locator('.settings-menu')).toBeVisible();
    await expect(pestana).toHaveAttribute('aria-expanded', 'true');
    // Abrir un menú no es navegar: la dirección no se mueve.
    await expect(page).toHaveURL(/\/completados$/);
  });
});
