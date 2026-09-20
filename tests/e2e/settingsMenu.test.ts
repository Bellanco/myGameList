import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';

/**
 * EL MENÚ DE AJUSTES — cuatro puntos flotando sobre el contenido, sin panel ni velo.
 *
 * ES UN RECORRIDO END-TO-END Y NO PUEDE SER OTRA COSA: lo que hay que comprobar es un `popover` nativo (capa
 * superior, cierre al pulsar fuera, Esc) y la OPACIDAD REAL del contenido, que es lo único que sostiene el
 * contraste de unos rótulos sin fondo. En jsdom no existe ni una cosa ni la otra.
 *
 * Lo que se vigila aquí, por orden de gravedad si se rompe:
 *  · que el contenido se apague al abrirlo —sin eso, los rótulos caen sobre una carátula clara y desaparecen—;
 *  · que se pueda cerrar por las tres vías que la gente intenta: Esc, pulsar fuera y el botón de atrás;
 *  · que el botón de atrás cierre el MENÚ y no la visita, que en un móvil es la diferencia entre deshacer lo
 *    último y perderlo todo.
 */

const menu = (page: Page) => page.locator('.settings-menu');
const pestana = (page: Page) => page.getByRole('button', { name: 'Ajustes' });
/**
 * La opacidad del contenido, ESPERANDO A QUE LA TRANSICIÓN TERMINE. Se lee con `expect.poll` y no de una sola
 * vez porque el apagado dura .22s: una lectura suelta cae a mitad del camino y devuelve 0,84 con todo
 * funcionando. Es el mismo error de medir un color a mitad de un fundido.
 */
async function esperarOpacidad(page: Page, esperada: number): Promise<void> {
  await expect
    .poll(async () => Number(await page.locator('.main').evaluate((n) => getComputedStyle(n).opacity)))
    .toBeCloseTo(esperada, 2);
}

async function abrir(page: Page): Promise<void> {
  await sembrarBiblioteca(page, { amplia: true, theme: 'dark' });
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await pestana(page).click();
  await expect(menu(page)).toBeVisible();
  // Y SE ESPERA A LA ENTRADA DE HISTORIAL, que se empuja en el evento `toggle` —asíncrono— y no en el clic. Sin
  // esta espera, un `goBack()` inmediato se adelanta al empujón y retrocede la visita entera en vez del menú.
  // Una persona no pulsa atrás veinte milisegundos después de abrir; un test sí.
  await expect
    .poll(() => page.evaluate(() => (window.history.state as { settingsMenu?: boolean } | null)?.settingsMenu === true))
    .toBe(true);
}

test.describe('el menú de la pestaña de Ajustes', () => {
  test('mientras está cerrado no se ve, aunque sus rótulos existan en el DOM', async ({ page }) => {
    // UN POPOVER CERRADO LO ESCONDE EL NAVEGADOR con un `display: none` de su hoja de agente, y cualquier
    // `display` que declare el autor GANA a esa regla: con `display: flex` escrito en la regla de base, los
    // tres rótulos se quedaban pintados sobre los listados todo el rato mientras `:popover-open` seguía
    // diciendo que no. No es una comprobación teórica: es el fallo que tuvo esta pantalla.
    await sembrarBiblioteca(page, { theme: 'dark' });
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(menu(page)).toBeHidden();
    await esperarOpacidad(page, 1);
  });

  test('se despliega, se anuncia y apaga lo que hay debajo', async ({ page }) => {
    await abrir(page);
    await expect(pestana(page)).toHaveAttribute('aria-expanded', 'true');
    // 0.3 es la cifra medida: con una carátula blanca detrás deja el rótulo en 6,4:1, por encima del 4,5 que
    // pide el texto normal. Si alguien la sube, el contraste se va por debajo sin que ningún test de a11y chille.
    await esperarOpacidad(page, 0.3);
    // Sin espacio social no hay nada que enseñar en «Diseño»: ese punto no se pinta.
    await expect(page.getByRole('link', { name: 'Diseño' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Filtros' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Datos' })).toBeVisible();
  });

  test('Esc lo cierra y devuelve la luz al contenido', async ({ page }) => {
    await abrir(page);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(pestana(page)).toHaveAttribute('aria-expanded', 'false');
    await esperarOpacidad(page, 1);
  });

  test('pulsar fuera lo cierra', async ({ page }) => {
    await abrir(page);
    await page.mouse.click(30, 120);
    await expect(menu(page)).toBeHidden();
    await esperarOpacidad(page, 1);
  });

  test('elegir un grupo lleva a su pantalla y SE QUEDA ahí', async ({ page }) => {
    await abrir(page);
    await page.getByRole('link', { name: 'Datos' }).click();
    await expect(page).toHaveURL(/\/ajustes\/datos$/);
    await expect(menu(page)).toBeHidden();
    // Y NO VUELVE SOLA: cerrar el menú consume la entrada de historial que se empujó al abrirlo, y con una
    // navegación normal ese retroceso corría contra ella y deshacía el salto —se abría el grupo y la pantalla
    // se volvía a los listados una fracción de segundo después—. Se elige el grupo REEMPLAZANDO esa entrada.
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/ajustes\/datos$/);
    // Y el atrás lleva a donde se estaba, no a un paso intermedio invisible.
    await page.goBack();
    await expect(page).toHaveURL(/\/completados$/);
    await esperarOpacidad(page, 1);
  });

  test('el botón de atrás cierra el menú, no la visita', async ({ page }) => {
    await abrir(page);
    await page.goBack();
    await expect(menu(page)).toBeHidden();
    // Y se sigue donde se estaba: el menú no es una pantalla, no debe robar sitio en el historial.
    await expect(page).toHaveURL(/\/completados$/);
    await esperarOpacidad(page, 1);
  });

  test('apaga también los botones de acción, y no se pueden pulsar', async ({ page }) => {
    // Con el menú abierto, un botón a plena luz en la esquina contraria se lee como un error de pintado. Y hay
    // algo peor que lo estético: el cierre por pulsar-fuera del `popover` no se come el clic, así que sin
    // `pointer-events: none` el mismo toque que cierra el menú abriría el formulario de juego nuevo.
    await abrir(page);
    const fab = page.locator('.fab');
    // Los botones de acción se van del todo: nacen en la misma esquina que el menú y a media luz se dibujaban
    // detrás de los rótulos. El carril de avisos y los flotantes, que no estorban, se quedan a media asta.
    await expect.poll(async () => Number(await fab.evaluate((n) => getComputedStyle(n).opacity))).toBeCloseTo(0, 2);
    await expect
      .poll(async () => Number(await page.locator('.ach-toast-stack').evaluate((n) => getComputedStyle(n).opacity)))
      .toBeCloseTo(0.3, 2);
    for (const sel of ['.fab', '.fab-roulette', '.ach-toast-stack', '.floating-controls']) {
      const punteros = await page.locator(sel).evaluate((n) => getComputedStyle(n).pointerEvents);
      expect(punteros, sel).toBe('none');
    }
    // El toque cierra el menú y no deja nada abierto detrás.
    await fab.click({ force: true });
    await expect(menu(page)).toBeHidden();
    await expect(page.locator('.modal-overlay, dialog[open]')).toHaveCount(0);
    await esperarOpacidad(page, 1);
  });

  test('`/ajustes` a secas entra en el primer grupo, no en una portada', async ({ page }) => {
    // La dirección existía antes de que Ajustes se partiera en cuatro, así que sigue habiendo enlaces y
    // marcadores apuntando ahí. Un índice que solo repite el menú que acabas de usar es un paso de más: se
    // entra directamente al grupo que existe para todo el mundo.
    await sembrarBiblioteca(page, { theme: 'dark' });
    await page.goto('/ajustes');
    await expect(page).toHaveURL(/\/ajustes\/datos$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Datos/);
  });

  test('con el aviso de consentimiento en pantalla, el menú sigue saliendo de su pestaña', async ({ page }) => {
    // EL MENÚ SE ANCLA A LA BARRA, SIEMPRE. Antes se subía lo que midiera el aviso para no escribir encima de
    // su texto, y el resultado era un menú a media altura, despegado de la pestaña que acababa de abrirlo: un
    // menú que no sale de donde está el dedo no se lee como el menú de esa pestaña. Ahora el que se aparta es
    // el aviso, que con el menú abierto ya estaba inerte.
    //
    // NO se usa `sembrarBiblioteca` aquí: siempre deja el consentimiento decidido —para que el aviso no estorbe
    // en el resto de recorridos— y es justo lo que este caso necesita que NO pase.
    await page.addInitScript(() => localStorage.setItem('mis-listas-theme', 'dark'));
    await page.goto('/completados');
    const aviso = page.locator('.consent-banner');
    await expect(aviso).toBeVisible();
    await pestana(page).click();
    await expect(menu(page)).toBeVisible();

    // Pegado a la barra: el hueco es el de siempre (.55rem), no la altura de un aviso de por medio.
    //
    // SE MIDE CON `poll` Y NO DE UNA VEZ. El menú se apoya en `--bottom-nav-h`, que publica la barra con un
    // `ResizeObserver`: mientras la tipografía de la app termina de llegar, la barra cambia de escalón y el
    // valor se reescribe. Una lectura suelta cae a veces en ese hueco —en una máquina cargada, con los cinco
    // trabajadores a la vez— y mide el sitio que el menú ocupaba hace un fotograma.
    const huecoConLaBarra = async () => {
      const cajaMenu = await menu(page).boundingBox();
      const cajaBarra = await page.locator('.bottom-nav').boundingBox();
      return cajaBarra!.y - (cajaMenu!.y + cajaMenu!.height);
    };
    await expect
      .poll(huecoConLaBarra, { message: 'el menú no se ha pegado a la barra' })
      .toBeLessThan(24);
    expect(await huecoConLaBarra(), 'el menú se ha despegado de la barra').toBeGreaterThanOrEqual(0);

    // Y EL AVISO SE VA DEL TODO mientras dure el menú: es lo que ocupa el sitio del que el menú sale y lo más
    // alto de la pila (z-index 130). `visibility` además de la opacidad, o sus dos botones seguirían en el
    // tabulador: se podría «Aceptar» con el teclado sin ver lo que se acepta.
    await expect.poll(async () => Number(await aviso.evaluate((n) => getComputedStyle(n).opacity))).toBeCloseTo(0, 2);
    /* LA `visibility` TAMBIÉN SE ESPERA, y no es una precaución de más: es discreta, así que la transición la
       mantiene en `visible` hasta el FINAL y salta de golpe al terminar —que es exactamente para lo que está
       ahí, ver la regla en `_overlays-and-responsive.scss`—. La opacidad, en cambio, cruza el umbral de este
       `poll` un poco antes de ese final. Medido en esta misma pantalla: la opacidad baja de 0,005 a los 227 ms
       y la visibility salta a los 260, o sea DOS FOTOGRAMAS en los que lo de arriba ya se cumple y esto
       todavía no. Una lectura suelta aquí cae dentro de esa ventana en cuanto la máquina va cargada, y eso es
       lo que tumbaba este caso en CI sin que hubiera nada roto. */
    await expect
      .poll(async () => aviso.evaluate((n) => getComputedStyle(n).visibility), {
        message: 'el aviso no se ha quitado del tabulador',
      })
      .toBe('hidden');
    // `pointer-events` no se transiciona: en cuanto la clase está puesta, el aviso ya es inerte.
    expect(await aviso.evaluate((n) => getComputedStyle(n).pointerEvents)).toBe('none');

    // VUELVE ENTERO AL CERRAR: no se ha decidido nada, así que el aviso tiene que seguir ahí para decidirlo.
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect.poll(async () => Number(await aviso.evaluate((n) => getComputedStyle(n).opacity))).toBeCloseTo(1, 2);
    await expect(aviso).toBeVisible();
  });
});
