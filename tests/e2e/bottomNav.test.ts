import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * LA BARRA INFERIOR CON CUATRO PESTAÑAS TIENE QUE CABER ENTERA.
 *
 * Ajustes vuelve a la barra desde el botón flotante en el que estuvo, y pasar de tres columnas a cuatro estrecha
 * cada una un 25 %: es justo el cambio que puede sacar un rótulo de su pastilla. `BottomNavigation` lo resuelve
 * MIDIENDO —apila el icono sobre el rótulo, luego aprieta el cuerpo del rótulo y solo al final se queda en
 * icono solo—, y esa medida depende de la tipografía
 * real y del ancho real, dos cosas que en jsdom valen cero: un test de componente daría verde con la barra rota.
 *
 * 280 px es el suelo que promete el componente, y el peor caso posible: el rótulo más largo («Estadísticas») en
 * la columna más estrecha. Lo que no puede ceder en ningún ancho: los 48 px de diana, que la barra no desborde y
 * que los cuatro sigan teniendo nombre para quien usa un lector de pantalla.
 */

const barra = (page: Page) => page.locator('.bottom-nav');

/**
 * ABRE LA PANTALLA CON UN ANCHO DE CONTENIDO EXACTO, no con un viewport de ese tamaño. No es lo mismo, y la
 * diferencia costó dos rojos en integración continua con todo en verde en local:
 *
 * en macOS la barra de desplazamiento FLOTA sobre el contenido y no ocupa nada, pero en el Linux del CI es de
 * las clásicas y se come ~15px de ancho. Un viewport de 390px daba allí 375px de sitio real, y el caso del
 * iPhone SE medía en realidad 360 — un ancho en el que la barra nunca prometió los cuatro nombres—. El test
 * decía una cosa y comprobaba otra.
 *
 * Así que el viewport se ENSANCHA lo que se lleve la barra de desplazamiento, para que `documentElement`
 * termine midiendo justo los px del título del caso en cualquier máquina.
 */
async function abrir(page: Page, ancho: number): Promise<void> {
  await page.setViewportSize({ width: ancho, height: 720 });
  await sembrarBiblioteca(page, { theme: 'dark' });
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const barraDeDesplazamiento = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
  if (barraDeDesplazamiento > 0) {
    await page.setViewportSize({ width: ancho + barraDeDesplazamiento, height: 720 });
    await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(ancho);
  }
  /*
   * Y SE MIDE CON LA LETRA DE LA APP PUESTA, que no es lo mismo que esperar a `document.fonts.ready`.
   *
   * `ready` resuelve con las cargas que hubiera EN MARCHA al preguntar, y el navegador no pide el woff2 hasta
   * que encuentra el primer texto que lo necesita: en una máquina cargada (CI) contesta «ya está» con la letra
   * de reserva todavía puesta. Y la de reserva de Linux mide un 9 % más que DM Sans —«Estadísticas» apilada
   * pasa de 69 a ~75px—, que es justo la diferencia entre que la barra tenga nombres o se quede muda. Así que
   * lo que se espera es que la FAMILIA esté disponible para ese texto.
   */
  // `load()` y no solo esperar: PIDE la cara que hace falta y resuelve cuando está puesta. Esperar a secas
  // dependería de que algo más la hubiera pedido ya.
  await page.evaluate(() => document.fonts.load('700 12px "DM Sans"', 'Estadísticas').catch(() => []));
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('700 12px "DM Sans"', 'Estadísticas')), {
      message: 'la tipografía de la app no llegó a cargarse; con la de reserva la barra se mide un 9 % más ancha',
      timeout: 15_000,
    })
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

/** Por qué salió lo que salió: sin esto, un rojo en otra máquina solo dice «is-icons» y no se puede perseguir. */
function porQue(m: Awaited<ReturnType<typeof medir>>): string {
  return `ancho útil ${m.ancho}px · columna ${m.columna}px · rótulo más ancho ${m.rotuloMax}px · ${m.letra} · DM Sans disponible: ${m.letraDeLaApp}`;
}

async function medir(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.bottom-nav') as HTMLElement;
    const inner = nav.querySelector('.bottom-nav-inner') as HTMLElement;
    const botones = [...nav.querySelectorAll<HTMLElement>('.bottom-nav-btn')];
    return {
      desborde: inner.scrollWidth - inner.clientWidth,
      derecha: Math.round(inner.getBoundingClientRect().right),
      // El ancho ÚTIL, que es contra el que la barra tiene que caber: `innerWidth` incluye la barra de
      // desplazamiento donde ésta ocupa sitio (Linux), y ahí sobrarían 15px que no existen.
      ancho: document.documentElement.clientWidth,
      modo: nav.className,
      // LO QUE HACE FALTA PARA ENTENDER UN ROJO EN OTRA MÁQUINA: con qué anchos y con qué letra se decidió.
      columna: Math.round(botones[0]?.getBoundingClientRect().width ?? 0),
      rotuloMax: Math.max(...botones.map((b) => b.querySelector('span')?.scrollWidth ?? 0)),
      letra: (() => {
        const rotulo = botones[0]?.querySelector('span');
        const estilo = rotulo ? getComputedStyle(rotulo) : null;
        return estilo ? `${estilo.fontFamily} a ${estilo.fontSize}` : 'sin rótulo';
      })(),
      letraDeLaApp: document.fonts.check('700 12px "DM Sans"', 'Estadísticas'),
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
    expect(m.modo, porQue(m)).not.toContain('is-icons');
    for (const b of m.botones) {
      expect(b.alto, b.nombre).toBeGreaterThanOrEqual(48);
      expect(b.rotuloVisible, `${b.nombre} · ${porQue(m)}`).toBe(true);
      expect(b.aire, `${b.nombre} va pegado al borde de su pastilla`).toBeGreaterThanOrEqual(10);
    }
  });

  /**
   * 375px ES EL OTRO ANCHO QUE HAY QUE VIGILAR: el del iPhone SE, y el más estrecho en el que la barra sigue
   * prometiendo los cuatro nombres. Va aparte del de 390 porque es el que decide la cuenta por los pelos —la
   * columna mide ~80px y «Estadísticas» apilada pide ~78—, así que es el primero que se cae si alguien recorta
   * el sitio de la barra en pantalla estrecha o ensancha el rótulo. Si este se pone en rojo, la barra se ha
   * quedado muda en medio parque de móviles y el de 390 puede seguir en verde.
   */
  test('en un iPhone SE (375 px) los cuatro nombres siguen a la vista', async ({ page }) => {
    await abrir(page, 375);
    const m = await medir(page);
    expect(m.desborde).toBe(0);
    expect(m.modo, porQue(m)).not.toContain('is-icons');
    for (const b of m.botones) {
      expect(b.rotuloVisible, `${b.nombre} · ${porQue(m)}`).toBe(true);
      expect(b.aire, `${b.nombre} va pegado al borde de su pastilla`).toBeGreaterThanOrEqual(10);
    }
  });

  /**
   * 365 px CAE EN LA FRANJA DE EMERGENCIA, la que va de 360 a 374: ahí el rótulo apilado a su cuerpo normal ya
   * no cabe y la barra bajaba directamente a solo-iconos, que es un salto brutal —de cuatro nombres a ninguno—
   * decidido por dos píxeles. `BottomNavigation` aprieta ahora el cuerpo del rótulo un punto antes de rendirse
   * (escalón `tight`), y esto lo vigila. 360 dp es un ancho corriente en Android, así que no es un caso de
   * laboratorio: es media gama media.
   *
   * No se exige la clase `is-tight`, sino LA PROMESA: que los cuatro sigan teniendo nombre a la vista. Si un día
   * cabe sin apretar, mejor, y el caso sigue valiendo.
   */
  test('en 365 px la barra apreta el nombre antes que quedarse en iconos', async ({ page }) => {
    await abrir(page, 365);
    const m = await medir(page);
    expect(m.desborde).toBe(0);
    expect(m.derecha).toBeLessThanOrEqual(m.ancho);
    expect(m.modo, porQue(m)).not.toContain('is-icons');
    for (const b of m.botones) {
      expect(b.alto, b.nombre).toBeGreaterThanOrEqual(48);
      expect(b.rotuloVisible, `${b.nombre} · ${porQue(m)}`).toBe(true);
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
