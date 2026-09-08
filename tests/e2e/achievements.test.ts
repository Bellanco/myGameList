import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sembrarBiblioteca } from './seed';
import { ACHIEVEMENTS_BY_ID } from '../../src/core/achievements/catalog';

/**
 * LOS LOGROS, EN EL BUILD DE PRODUCCIÓN.
 *
 * QUÉ CUBRE QUE NO CUBRE NADA MÁS. Los unitarios miden las métricas y los de componente pintan el listado en
 * jsdom; ninguno de los dos ve lo único que puede romper esta pantalla al desplegar:
 *
 *  - **el sprite de las medallas vive en un chunk perezoso** y se monta desde dos rutas distintas. Si no entra
 *    en el grafo, cada medalla se queda VACÍA —un `<use>` que apunta a un `symbol` que no existe— y no salta
 *    ningún error: la pantalla se pinta entera, con 400 discos en blanco;
 *  - **la hoja `achievements.scss` se importa desde el componente de la medalla**, no desde `stats.scss`, y con
 *    el CSS con hash del build esa cadena es otra;
 *  - y el catálogo se evalúa aquí sobre una biblioteca de verdad guardada en `localStorage`, no sobre un objeto
 *    de prueba: es el único sitio donde se comprueba que `normalizeGame` y las métricas casan.
 *
 * LOS NOMBRES NO SE ESCRIBEN A MANO. Salen de `ACHIEVEMENTS_BY_ID`, así que si mañana se retoca un rótulo o se
 * intercala un escalón —y con él cambia el romano— el test sigue comprobando lo que quiere comprobar en vez de
 * romperse por un texto.
 */

/** El nombre visible de un escalón y su frase en pasado, tal y como los compone el catálogo. */
function logro(id: string): { nombre: string; hecho: string; meta: string } {
  const def = ACHIEVEMENTS_BY_ID.get(id);
  if (!def) throw new Error(`el catálogo no tiene ${id} — ¿se ha renombrado un id?`);
  return { nombre: def.labels.name, hecho: def.labels.done, meta: def.labels.condition };
}

async function abrirLogros(page: Page): Promise<void> {
  await page.goto('/logros');
  await expect(page.getByRole('heading', { level: 2, name: 'Logros' })).toBeVisible();
  await expect(page.locator('.ach-row').first()).toBeVisible();
}

/** La fila de un logro, localizada por su nombre visible dentro del listado. */
function fila(page: Page, nombre: string) {
  return page.locator('.ach-row').filter({ has: page.locator('.ach-row-name', { hasText: new RegExp(`^${nombre}$`) }) });
}

test.describe('logros · el listado sobre el build', () => {
  test('los techos nuevos se conceden y se dicen en pasado', async ({ page }) => {
    // LA CONSOLA, MENOS UN 403 QUE ESTÁ PREVISTO. `useAchievementsConfig` lee `appConfig/achievements` —las
    // escaleras ocultas y hasta dónde ha abierto la comunidad— y sin sesión las reglas la DENIEGAN: el hook lo
    // trata como «manda el catálogo» y no lanza, pero el navegador escribe el 403 igual. Filtrarlo por lo que es
    // deja el resto de la consola vigilada, que es lo que interesa.
    const errores: string[] = [];
    const previsto = (texto: string) => /403/.test(texto) && /firestore\.googleapis\.com/.test(texto + urls.join(' '));
    const urls: string[] = [];
    page.on('response', (res) => { if (res.status() >= 400) urls.push(res.url()); });
    page.on('console', (msg) => { if (msg.type() === 'error' && !previsto(msg.text())) errores.push(msg.text()); });
    page.on('pageerror', (error) => errores.push(`pageerror: ${error.message}`));

    await sembrarBiblioteca(page, { logros: true });
    await abrirLogros(page);

    // El escalón más alto de cada escalera ampliada, que es lo que la siembra está puesta para alcanzar.
    for (const id of ['anadas-15', 'otra-oportunidad-10', 'reencuentro-15', 'firma-200', 'mania-75', 'palabra-40', 'vocabulario-75']) {
      const { nombre, hecho } = logro(id);
      const row = fila(page, nombre);
      await expect(row, `${id} debería estar en el listado`).toHaveCount(1);
      // Conseguido: sin `is-locked` y con la frase EN PASADO, no con la meta en imperativo.
      await expect(row, `${id} debería estar conseguido`).not.toHaveClass(/is-locked/);
      await expect(row.locator('.ach-row-condition')).toHaveText(hecho);
    }

    expect(errores, `la consola no debería decir nada: ${errores.join(' · ')}`).toEqual([]);
  });

  test('salen también los logros de siempre, y los que faltan lo dicen en imperativo', async ({ page }) => {
    await sembrarBiblioteca(page, { logros: true });
    await abrirLogros(page);

    // Escaleras de las cincuenta primeras: la ampliación no puede haberse comido el catálogo viejo.
    for (const id of ['completados-150', 'criterio-200', 'memoria-larga-15', 'resenas-200', 'luces-y-sombras-75']) {
      const { nombre, hecho } = logro(id);
      const row = fila(page, nombre);
      await expect(row, `${id} debería estar en el listado`).toHaveCount(1);
      await expect(row.locator('.ach-row-condition')).toHaveText(hecho);
    }

    // Y uno que la siembra NO alcanza: se ofrece bloqueado y con la meta en imperativo, que es la mitad útil
    // de abajo del listado.
    const pendiente = logro('completados-250');
    const row = fila(page, pendiente.nombre);
    await expect(row).toHaveClass(/is-locked/);
    await expect(row.locator('.ach-row-condition')).toHaveText(pendiente.meta);
  });

  test('cada medalla tiene su dibujo y su cifra: el sprite entra en el chunk', async ({ page }) => {
    await sembrarBiblioteca(page, { logros: true });
    await abrirLogros(page);

    // NINGÚN `<use>` puede apuntar a un `symbol` que no exista: es el fallo que deja los discos vacíos sin
    // errores en consola, y solo se puede ver con el sprite montado de verdad.
    const huerfanos = await page.evaluate(() => [...document.querySelectorAll('.ach-art use')]
      .map((use) => use.getAttribute('href') || '')
      .filter((href) => !href || !document.querySelector(href)));
    expect(huerfanos, `hay <use> sin symbol: ${huerfanos.slice(0, 5).join(', ')}`).toEqual([]);

    // Y el dibujo se pinta con tamaño real, no colapsado a cero.
    const caja = await page.locator('.ach-row .ach-medal').first().boundingBox();
    expect(caja?.width).toBeGreaterThan(24);

    // La píldora del índice cuadrado dice «15×15», que es el nombre que tiene la cosa.
    const cosechas = fila(page, logro('anadas-15').nombre);
    await expect(cosechas.locator('.ach-step')).toHaveText('15×15');
    // Y la de una magnitud va sin aspa, que en un total mentiría.
    const horas = fila(page, logro('horas-totales-5000').nombre);
    await expect(horas.locator('.ach-step')).toHaveText('5000');
  });

  /**
   * EL CONTADOR CONTRA LO PINTADO, con la resta que hay que hacer: los «primeros pasos» SE PINTAN mientras
   * quede alguno por hacer y NO PUNTÚAN nunca (`SCORING_ACHIEVEMENTS` los excluye, §6.3.1). Sin descontarlos, la
   * cabecera y la lista se llevan exactamente esa diferencia y parece un descuadre cuando es la regla.
   */
  test('las dos cifras cuadran con lo que hay pintado', async ({ page }) => {
    await sembrarBiblioteca(page, { logros: true });
    await abrirLogros(page);

    const cabecera = await page.locator('.ach-figures').first().innerText();
    const [conseguidos] = cabecera.match(/\d+/g) || [];
    const cuenta = await page.evaluate(() => {
      const filas = [...document.querySelectorAll('.ach-row')];
      const esPrimerPaso = (fila: Element) => (fila.querySelector('use')?.getAttribute('href') || '').startsWith('#ach-paso-');
      const hechas = filas.filter((f) => !f.classList.contains('is-locked'));
      return { hechas: hechas.length, hechasSinPasos: hechas.filter((f) => !esPrimerPaso(f)).length };
    });
    expect(Number(conseguidos)).toBe(cuenta.hechasSinPasos);
    expect(cuenta.hechas).toBeGreaterThan(cuenta.hechasSinPasos); // los primeros pasos están, y no cuentan
    expect(cuenta.hechasSinPasos).toBeGreaterThan(40);
  });
});


/**
 * EL AVISO DEL INSTANTE (§7.4 del plan): al guardar algo que cruza un umbral, el logro se dice AHÍ MISMO.
 *
 * Es la mitad del sistema que el listado no puede comprobar. `/logros` enseña lo que tienes; esto comprueba que
 * conseguirlo se NOTA en el momento, que es lo que el §7.4 dice que la derivación pierde «con una facilidad
 * alarmante»: marcas un juego como terminado y la medalla aparece callada tres días después.
 *
 * ⚑ Y COMPRUEBA LA TARJETA, no el banner. Hasta ahora el aviso salía por `StatusBanner` —el de «Juego
 * guardado»—, con el rótulo «Correcto» delante y sin medalla. Ahora es la cápsula de `AchievementToast`: medalla
 * de 64 px, rótulo, nombre con su grado y la descripción en pasado. El banner sigue recibiendo el texto y por eso
 * se comprueba también: su región viva es la que lo ANUNCIA a un lector de pantalla (A11y-4), y perder eso por
 * ganar una tarjeta sería un mal cambio.
 */
test.describe('logros · el aviso del instante', () => {
  /**
   * Completa el juego que está en curso: la escritura que cruza el umbral.
   *
   * Son DOS pasos y no uno: «Pasar a completados» no mueve nada por sí solo, abre el formulario del juego para
   * que la ficha se complete antes de cerrarlo, y el movimiento —y con él la evaluación— ocurre al guardar.
   */
  async function completarElQueCruza(page: Page, cerrados = 9): Promise<void> {
    await page.goto('/en-curso');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /El que cruza el umbral/ }).first().click();
    await page.getByRole('button', { name: /^Pasar a completados/ }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    // El juego ha cambiado de lista: sin esto, lo de abajo mediría el aviso de otra cosa.
    await expect(page.locator('[aria-label^="Lista del completista"]'))
      .toHaveAttribute('aria-label', new RegExp(`${cerrados + 1} juegos`));
  }

  const toast = (page: Page) => page.locator('.ach-toast');

  test('un logro: la cápsula lo nombra, con su medalla y su descripción', async ({ page }) => {
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await completarElQueCruza(page);

    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    const { nombre, hecho } = logro('completados-10');
    await expect(capsula.locator('.ach-toast-kicker')).toHaveText('Has desbloqueado');
    await expect(capsula.locator('.ach-toast-name')).toHaveText(nombre);
    // La DESCRIPCIÓN es el texto en pasado del escalón: el aviso cuenta algo que ya has hecho.
    await expect(capsula.locator('.ach-toast-desc')).toHaveText(hecho);
    // Una medalla de verdad, con su dibujo resuelto del sprite y su cifra de escalón.
    await expect(capsula.locator('.ach-medal')).toHaveCount(1);
    await expect(capsula.locator('.ach-medal .ach-step')).toHaveText('×10');
    // La sombra dice la rareza, y «Créditos finales» es raro. No se escribe en ninguna parte: se ve.
    await expect(capsula).toHaveClass(/is-raro/);
    // Y el banner sigue ANUNCIANDO, que es lo que lo hace accesible.
    await expect(page.locator('.status-banner')).toContainText(`Logro conseguido: ${nombre}`);
  });

  test('varios: una sola cápsula que los cuenta, con sus medallas solapadas', async ({ page }) => {
    await sembrarBiblioteca(page, { alBorde: 'varios' });
    await completarElQueCruza(page);

    const capsula = toast(page);
    await expect(capsula).toHaveCount(1); // UNA cápsula, no una por logro
    await expect(capsula.locator('.ach-toast-name')).toHaveText('2 logros');
    await expect(capsula.locator('.ach-toast-desc'))
      .toHaveText(`${logro('completados-10').nombre} y ${logro('generos-5').nombre}`);
    await expect(capsula.locator('.ach-medal')).toHaveCount(2);
    await expect(page.locator('.status-banner')).toContainText('2 logros conseguidos');
  });

  test('el hito: la mitad de una escalera se dice sin felicitar por nada', async ({ page }) => {
    // Cuatro cerrados y el quinto cruza la mitad de «Créditos finales I» (5 de 10) sin conceder ningún logro.
    await sembrarBiblioteca(page, { alBorde: 'hito' });
    await completarElQueCruza(page, 4);

    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    await expect(capsula.locator('.ach-toast-kicker')).toHaveText('Vas por la mitad');

    /* NO SE CLAVA QUÉ ESCALERA sale, y no es pereza: esa escritura cruza la mitad de VARIAS a la vez —el quinto
       cerrado mueve «Créditos finales» a 5 de 10 y «Partida guardada» a 2 de 3— y el hook anuncia el MÁS
       AVANZADO, que es el que está más cerca de convertirse en medalla. Atar el test a una escalera concreta
       sería atarlo a ese empate, y el empate depende de la siembra, no de la regla. Lo que se comprueba es la
       regla: un hito se dice con su barra, su cifra y la medalla en peltre, y nunca felicita. */
    const cifra = await capsula.locator('.ach-toast-figure').innerText();
    const [valor, umbral, porcentaje] = [...cifra.matchAll(/\d+/g)].map((m) => Number(m[0]));
    expect(porcentaje, `la cifra del hito no cuadra: ${cifra}`).toBe(Math.round((valor / umbral) * 100));
    expect(porcentaje).toBeGreaterThanOrEqual(50);
    expect(porcentaje).toBeLessThan(85); // por encima, el rótulo sería «Casi lo tienes»
    // La barra lleva ese mismo porcentaje, y la medalla va BLOQUEADA: aún no se ha conseguido nada.
    await expect(capsula.locator('.ach-toast-bar > i')).toHaveAttribute('style', new RegExp(`width:\\s*${porcentaje}%`));
    await expect(capsula.locator('.ach-medal')).toHaveClass(/is-locked/);
    // Un hito no tiene rareza: no es un logro, así que la cápsula se queda en peltre.
    await expect(capsula).not.toHaveClass(/is-comun|is-infrecuente|is-raro|is-excepcional/);
    // Y no se cuela como desbloqueo: nada de descripción en pasado ni barrido.
    await expect(capsula.locator('.ach-toast-desc')).toHaveCount(0);
    await expect(capsula.locator('.ach-toast-sheen')).toHaveCount(0);
  });

  test('guardar sin cruzar nada no saca ninguna cápsula', async ({ page }) => {
    // La otra mitad de la regla: el aviso solo cuenta lo que sube EN ESA escritura. Sin esto, cualquier guardado
    // repetiría la medalla de siempre hasta volverse ruido que nadie lee.
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await page.goto('/completados');
    await page.getByRole('button', { name: /Cerrado 1\b/ }).first().click();
    await page.getByRole('button', { name: /^Editar - / }).first().click();
    await page.getByRole('button', { name: /^Guardar/i }).first().click();

    await expect(page.locator('.status-banner')).toBeVisible();
    await expect(toast(page)).toHaveCount(0);
    await expect(page.locator('.status-banner')).not.toContainText(/logro/i);
  });

  /**
   * LA CÁPSULA VIVE FUERA DE LA PANTALLA, y esto es lo que lo comprueba. Se monta en `App`, al lado del banner y
   * por encima del `main`, así que cambiar de sección no se la lleva por delante: el logro se consigue guardando
   * en la lista y se sigue viendo si te vas al panel, al hub o a los propios logros.
   *
   * Y EN `/logros` HAY UNA TRAMPA APARTE: esa pantalla monta el sprite de las medallas, y la cápsula también.
   * Dos `<symbol>` con el mismo `id` son HTML inválido, así que se comprueba que el reparto de dueño único
   * (`AchievementSprite`) deja exactamente uno.
   */
  test('la cápsula se ve en todas las pantallas, no solo en la que la disparó', async ({ page }) => {
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await completarElQueCruza(page);
    await expect(toast(page)).toBeVisible();

    const secciones: Array<[string, () => Promise<unknown>]> = [
      ['listados', () => page.getByRole('button', { name: /^Listados/ }).first().click()],
      ['estadísticas', () => page.getByRole('button', { name: /^Estadísticas/ }).first().click()],
      ['social', () => page.getByRole('button', { name: /^Social/ }).first().click()],
      ['ajustes', () => page.getByRole('button', { name: /^Ajustes/ }).first().click()],
    ];
    for (const [nombre, ir] of secciones) {
      await ir();
      // Sigue en pantalla, con su medalla dibujada y por encima de la barra inferior.
      await expect(toast(page), `la cápsula debería seguir visible en ${nombre}`).toBeVisible();
      await expect(toast(page).locator('.ach-medal')).toHaveCount(1);
      const huerfanos = await page.evaluate(() => [...document.querySelectorAll('.ach-toast .ach-art use')]
        .map((use) => use.getAttribute('href') || '')
        .filter((href) => !href || !document.querySelector(href)));
      expect(huerfanos, `medalla sin dibujo en ${nombre}`).toEqual([]);
    }

    /* Y la pantalla de LOGROS, que es la única que monta el sprite por su cuenta. Se llega por la interfaz y no
       con `page.goto`: una navegación con recarga reinicia la app y se lleva el aviso por delante —que es lo
       correcto, un aviso del instante no sobrevive a un arranque— así que con `goto` este test comprobaría lo
       contrario de lo que quiere. */
    await page.getByRole('button', { name: /^Estadísticas/ }).first().click();
    await page.getByRole('button', { name: 'Ver todos tus logros' }).first().click();
    await expect(page.locator('.ach-row').first()).toBeVisible();
    await expect(toast(page)).toBeVisible();
    const duplicados = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('symbol')].map((s) => s.id).filter((id) => id.startsWith('ach-'));
      return ids.length - new Set(ids).size;
    });
    expect(duplicados, 'hay símbolos del sprite duplicados').toBe(0);
  });

  test('se va sola a los cinco segundos, y se queda si estás leyéndola', async ({ page }) => {
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await completarElQueCruza(page);

    // Con el ratón encima, la cuenta se para: sigue ahí bastante después de los cinco segundos.
    await toast(page).hover();
    await page.waitForTimeout(6000);
    await expect(toast(page)).toBeVisible();

    // Al retirar el ratón, la cuenta arranca de nuevo y se va sola. Sin botón de cerrar.
    await page.mouse.move(0, 0);
    await expect(toast(page)).toHaveCount(0, { timeout: 8000 });
  });
});

/**
 * EL AVISO, EN LAS DOCE COMBINACIONES DE PALETA Y TEMA.
 *
 * Por qué hace falta recorrerlas todas y no basta con una: la cápsula NO trae colores propios. Superficie, borde,
 * sombra y el acento de su rótulo son los tokens de cada tema (`--surface-elevated`, `--border`, `--shadow`,
 * `--fg-link`), y dos paletas además le cambian la FORMA —el chaflán del HUD en Sin futuro y el canto recto de
 * Cámara de pruebas—. Con seis paletas y dos temas, eso son doce sitios donde el mismo componente se pinta
 * distinto y uno donde puede romperse.
 *
 * Y LO QUE SE MIDE ES EL CONTRASTE, con axe y las mismas reglas que el resto de la auditoría. Es el fallo que la
 * maqueta ya avisaba: el rótulo va con el acento del tema y es TEXTO NORMAL, así que le toca el 4,5:1 de la
 * 1.4.3 — no el 3:1 de un adorno—. Un acento que cumple sobre el fondo de la app puede no cumplir sobre la
 * superficie elevada de la cápsula, y eso solo se ve mirándolo en las doce.
 */
const PALETAS = ['steam', 'persona', 'portal', 'cyberpunk', 'seaofstars', 'grimdark'] as const;
const TEMAS = ['dark', 'light'] as const;

for (const palette of PALETAS) {
  for (const theme of TEMAS) {
    test(`el aviso se ve y contrasta · paleta ${palette} · tema ${theme}`, async ({ page }) => {
      await sembrarBiblioteca(page, { alBorde: 'varios', palette, theme });
      await page.goto('/en-curso');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.getByRole('button', { name: /El que cruza el umbral/ }).first().click();
      await page.getByRole('button', { name: /^Pasar a completados/ }).first().click();
      await expect(page.getByRole('dialog').first()).toBeVisible();
      await page.getByRole('button', { name: /^Guardar/i }).first().click();

      const capsula = page.locator('.ach-toast');
      await expect(capsula, `sin cápsula en ${palette}/${theme}`).toBeVisible();
      // El ratón encima para que no se vaya a mitad de la auditoría: axe tarda más de lo que vive el aviso.
      await capsula.hover();

      // Se ve DE VERDAD: con su medalla dibujada y una caja de tamaño razonable, no colapsada por el tema.
      await expect(capsula.locator('.ach-medal')).toHaveCount(2);
      const caja = await capsula.boundingBox();
      expect(caja?.height ?? 0, `cápsula demasiado baja en ${palette}/${theme}`).toBeGreaterThan(60);
      expect(caja?.width ?? 0, `cápsula demasiado estrecha en ${palette}/${theme}`).toBeGreaterThan(200);

      // Y la sombra de rareza sigue ahí después de que el tema le cambie la forma: es la trampa del `clip-path`
      // de Sin futuro, que recorta las sombras exteriores y se comía justo la señal de rareza.
      const rareza = await capsula.evaluate((el) => {
        const propia = getComputedStyle(el);
        const capa = getComputedStyle(el, '::before');
        return {
          glow: propia.getPropertyValue('--glow').trim(),
          sombra: propia.boxShadow,
          filtroDeCapa: capa.filter,
          fondoDeCapa: capa.backgroundColor,
        };
      });
      expect(rareza.glow, `sin rareza en ${palette}/${theme}`).not.toBe('');
      // O la lleva la sombra del elemento, o la lleva la capa recortada del tema. Una de las dos, nunca ninguna.
      const dice = rareza.sombra.includes(rareza.glow.replace(/\s/g, ''))
        || rareza.sombra.includes(rareza.glow)
        || rareza.filtroDeCapa.includes('drop-shadow')
        || rareza.fondoDeCapa !== 'rgba(0, 0, 0, 0)';
      expect(dice, `la rareza no se ve en ${palette}/${theme}: ${JSON.stringify(rareza)}`).toBe(true);

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('.ach-toast')
        .analyze();
      const fallos = violations.map(
        (v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${JSON.stringify(v.nodes[0]?.any?.[0]?.data)}`,
      );
      expect(fallos, `Violaciones en el aviso con ${palette}/${theme}`).toEqual([]);
    });
  }
}

/**
 * BIBLIOTECAS GRANDES Y AVALANCHAS. Es el caso normal, no el raro: quien llega a esta app llega con doscientos o
 * trescientos juegos ya catalogados en otra parte, y el catálogo tiene 412 escalones esperándole. Todo lo que el
 * aviso hace bien con un logro puede hacerlo mal con cuarenta.
 *
 * TRES COSAS DISTINTAS QUE SE MIDEN AQUÍ:
 *
 *  1. **Llegar con la biblioteca hecha no dispara nada.** Es el caso de quien actualiza la app y se encuentra el
 *     catálogo ampliado: se le conceden docenas de escalones en la primera evaluación, y ahí NO hay noticia que
 *     dar —no ha hecho nada ahora—. Lo sostiene el «sembrar y callar» del hook, y sin este recorrido nadie se
 *     enteraría de que se rompió hasta ver cuarenta avisos seguidos en producción.
 *  2. **Importar una biblioteca entera saca UNA cápsula.** Aquí sí hay noticia —es una escritura, y sube todo de
 *     golpe— y la regla del §7.4 es «uno por escritura»: una cápsula que los cuenta, no un reguero.
 *  3. **Y con cuarenta logros la cápsula tiene que seguir cabiendo**, en escritorio y en un móvil de 412 px, con
 *     tres medallas y un texto que no desborda.
 */
test.describe('logros · bibliotecas grandes y avalanchas', () => {
  const toast = (page: Page) => page.locator('.ach-toast');

  /** Una biblioteca de 120 juegos con de todo: la que provoca la avalancha al importarse. */
  function bibliotecaGorda() {
    const generos = ['Acción', 'RPG', 'Puzles', 'Estrategia', 'Cartas', 'Aventura', 'Metroidvania', 'Deportes'];
    const c = Array.from({ length: 120 }, (_unused, index) => ({
      id: 9000 + index,
      name: `Importado ${index + 1}`,
      grade: 30 + ((index * 7) % 65),
      score: 3,
      genres: [generos[index % generos.length]],
      platforms: ['PC', 'Switch'][index % 2] ? [generos[index % 2] === 'Acción' ? 'PC' : 'Switch'] : ['PC'],
      years: index % 4 === 0 ? [2018 + (index % 6), 2024] : [2018 + (index % 6)],
      steamDeck: index % 3 === 0,
      replayable: index % 5 === 0,
      retry: false,
      reasons: [],
      strengths: ['Jugabilidad', 'Historia'][index % 2] ? ['Jugabilidad'] : ['Historia'],
      weaknesses: index % 7 === 0 ? [`Defecto ${index}`] : [],
      hours: 5 + (index % 60),
      review: 'Una reseña de prueba con unas cuantas palabras dentro para que cuente.',
    }));
    return { c, v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
  }

  test('llegar con la biblioteca hecha no suelta ni un aviso', async ({ page }) => {
    // 300 juegos y 177 logros concedidos de una vez: es lo que pasa al actualizar la app con el catálogo
    // ampliado. Ninguno es noticia, porque no se ha hecho nada AHORA.
    await sembrarBiblioteca(page, { logros: true });
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Tiempo de sobra para que la evaluación (que entra por `import()` dinámico) haya corrido y pintado.
    await page.waitForTimeout(2500);
    await expect(toast(page)).toHaveCount(0);
    await expect(page.locator('.status-banner')).toHaveCount(0);

    // Y no es que el evaluador no haya corrido: los logros están, solo que sin anunciarse.
    await page.getByRole('button', { name: /^Estadísticas/ }).first().click();
    await page.getByRole('button', { name: 'Ver todos tus logros' }).first().click();
    await expect(page.locator('.ach-row').first()).toBeVisible();
    expect(await page.locator('.ach-row:not(.is-locked)').count()).toBeGreaterThan(100);
  });

  /** Mete un JSON por el input de importación de Ajustes, como haría cualquiera con su copia de seguridad. */
  async function importar(page: Page, datos: unknown): Promise<void> {
    await page.getByRole('button', { name: /^Ajustes/ }).first().click();
    const input = page.locator('input[type="file"][accept=".json"]').first();
    await expect(input).toHaveCount(1);
    /* El fichero se fabrica EN EL NAVEGADOR y no con `setInputFiles`: escribirlo en disco necesita `node:fs` y
       este proyecto no tiene `@types/node` a propósito (ver el `exclude` de `tsconfig.json`). Un `File` en un
       `DataTransfer` es exactamente lo que recibe el input cuando alguien elige un archivo. */
    await input.evaluate((el, json) => {
      const file = new File([json as string], 'biblioteca.json', { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(file);
      (el as HTMLInputElement).files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, JSON.stringify(datos));
  }

  test('importar una biblioteca entera saca UNA cápsula que los cuenta', async ({ page }) => {
    // Se arranca con tres juegos —así la foto previa es pequeña— y llega la biblioteca de 120 de golpe.
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(1200); // que la primera evaluación siembre antes de importar

    await importar(page, bibliotecaGorda());

    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    await capsula.hover(); // que no se vaya a mitad de las comprobaciones

    // UNA cápsula, no una por logro. Y el nombre es la CUENTA, con dos cifras.
    await expect(capsula).toHaveCount(1);
    const nombre = await capsula.locator('.ach-toast-name').innerText();
    const cuantos = Number(/(\d+)/.exec(nombre)?.[1] ?? 0);
    expect(nombre, `el nombre debería contar los logros: ${nombre}`).toMatch(/^\d+ logros$/);
    expect(cuantos, 'una biblioteca de 120 juegos tiene que conceder muchos logros').toBeGreaterThan(20);

    // Tres medallas como mucho, y son las de MAYOR rareza: la sombra de la cápsula es la de la primera.
    await expect(capsula.locator('.ach-medal')).toHaveCount(3);
    await expect(capsula).toHaveClass(/is-raro|is-excepcional/);
    /* Y LAS TRES SON DE ESCALERAS DISTINTAS. Es lo que solo se ve con una avalancha: los tres logros más raros de
       una importación entera son casi siempre tres escalones de la misma escalera, y la cápsula enseñaba tres
       discos idénticos con distinta cifra. */
    const dibujos = await capsula.locator('.ach-medal .ach-fg use').evaluateAll(
      (usos) => usos.map((uso) => uso.getAttribute('href')),
    );
    expect(new Set(dibujos).size, `las tres medallas repiten dibujo: ${dibujos.join(', ')}`).toBe(3);
    // La descripción resume con «X y N más», nunca una lista cortada a mitad de nombre.
    await expect(capsula.locator('.ach-toast-desc')).toHaveText(new RegExp(`y ${cuantos - 1} más$`));
  });

  test('con cuarenta logros la cápsula sigue cabiendo, y en un móvil también', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 }); // Pixel 8
    await sembrarBiblioteca(page);
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(1200);
    await importar(page, bibliotecaGorda());

    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    await capsula.hover();

    const caja = await capsula.boundingBox();
    const ventana = page.viewportSize();
    expect(caja, 'la cápsula debería tener caja').not.toBeNull();
    // Cabe entera en la ventana: ni se sale por la derecha ni por abajo.
    expect(caja!.x).toBeGreaterThanOrEqual(0);
    expect(caja!.x + caja!.width, 'la cápsula se sale por la derecha').toBeLessThanOrEqual(ventana!.width);
    expect(caja!.y + caja!.height, 'la cápsula se sale por abajo').toBeLessThanOrEqual(ventana!.height);
    // Y no ha metido barra de desplazamiento horizontal en la página, que es el síntoma de un fijo que desborda.
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(desborda, 'la página ha ganado desplazamiento horizontal').toBe(false);

    // El texto se recorta en UNA línea: la cápsula mide lo que mide su medalla y un salto de línea la rompe.
    const lineas = await capsula.locator('.ach-toast-desc').evaluate((el) => {
      const alto = el.getBoundingClientRect().height;
      const linea = parseFloat(getComputedStyle(el).lineHeight);
      return Math.round(alto / linea);
    });
    expect(lineas, 'la descripción debería caber en una línea').toBe(1);
  });

  test('dos escrituras seguidas dejan una sola cápsula: la última', async ({ page }) => {
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await page.goto('/en-curso');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /El que cruza el umbral/ }).first().click();
    await page.getByRole('button', { name: /^Pasar a completados/ }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    await expect(toast(page)).toBeVisible();

    // Segunda escritura mientras la primera cápsula vive: se sustituye, no se apila.
    await page.getByRole('button', { name: /^Listados/ }).first().click();
    await page.getByRole('button', { name: /Cerrado 1\b/ }).first().click();
    await page.getByRole('button', { name: /^Editar - / }).first().click();
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    await page.waitForTimeout(600);
    // Como la segunda no sube nada, la cápsula de la primera se queda hasta agotar su vida: lo que no puede
    // haber nunca es DOS.
    expect(await toast(page).count()).toBeLessThanOrEqual(1);
  });

  test('sin efectos y sin animación, el aviso sale igual', async ({ page }) => {
    // Es la promesa de la maqueta: el barrido es un adorno detrás de `data-effects`, y quien pide menos
    // movimiento sigue viendo su logro.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await page.addInitScript(() => document.documentElement.setAttribute('data-effects', 'off'));
    await page.goto('/en-curso');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /El que cruza el umbral/ }).first().click();
    await page.getByRole('button', { name: /^Pasar a completados/ }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.getByRole('button', { name: /^Guardar/i }).first().click();

    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    await capsula.hover();
    await expect(capsula.locator('.ach-toast-name')).toHaveText(logro('completados-10').nombre);
    // El barrido está en el marcado pero no se pinta: es lo que dicen las dos reglas de la hoja.
    const sheen = await capsula.locator('.ach-toast-sheen').evaluate((el) => getComputedStyle(el).display);
    expect(sheen).toBe('none');
  });
});

/**
 * LAS ESQUINAS QUE QUEDABAN. Tres ramas del aviso que ningún recorrido tocaba y que se rompen calladas:
 * el segundo rótulo del hito, el carril compartido con el consentimiento, y lo que pasa al pulsar la cápsula.
 */
test.describe('logros · las esquinas del aviso', () => {
  const toast = (page: Page) => page.locator('.ach-toast');

  async function completar(page: Page, cerrados: number): Promise<void> {
    await page.goto('/en-curso');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /El que cruza el umbral/ }).first().click();
    await page.getByRole('button', { name: /^Pasar a completados/ }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.getByRole('button', { name: /^Guardar/i }).first().click();
    await expect(page.locator('[aria-label^="Lista del completista"]'))
      .toHaveAttribute('aria-label', new RegExp(`${cerrados + 1} juegos`));
  }

  test('la recta final tiene su propio rótulo: «Casi lo tienes»', async ({ page }) => {
    // Ocho cerrados y el noveno deja «Créditos finales I» en 9 de 10: por encima del 85 %, el aviso cambia de
    // voz. Es la otra rama del hito y sin esto solo se probaba la mitad.
    await sembrarBiblioteca(page, { alBorde: 'casi' });
    await completar(page, 8);

    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    await capsula.hover();
    await expect(capsula.locator('.ach-toast-kicker')).toHaveText('Casi lo tienes');
    await expect(capsula.locator('.ach-toast-figure')).toHaveText('9 de 10 · 90 %');
    await expect(capsula.locator('.ach-medal')).toHaveClass(/is-locked/);
  });

  test('con el consentimiento en pantalla, el aviso se sube en vez de taparlo', async ({ page }) => {
    /* El carril de abajo a la izquierda lo comparten los dos, y el consentimiento es el único aviso que tiene
       que ganar: bloquea una decisión legal. Se siembra sin decidirlo para que el banner salga.

       ⚑ Y AQUÍ EL CLIC VA POR EVENTO, no por coordenadas: el banner de consentimiento ocupa el pie de la
       ventana y tapa los botones de la fila, así que un clic normal se queda esperando a que se aparte y uno
       forzado se lo lleva el banner —pulsando «Aceptar» o «Rechazar», que es justo lo que no queremos—.
       `dispatchEvent` va al nodo y se salta el hit-testing. No es un fallo del aviso: el consentimiento gana a
       todo a propósito. */
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await page.addInitScript(() => localStorage.removeItem('mis-listas-analytics-consent'));
    await page.goto('/en-curso');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /El que cruza el umbral/ }).first().dispatchEvent('click');
    await page.getByRole('button', { name: /^Pasar a completados/ }).first().dispatchEvent('click');
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await page.getByRole('button', { name: /^Guardar/i }).first().dispatchEvent('click');

    const consentimiento = page.locator('.consent-banner');
    await expect(consentimiento).toBeVisible();
    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    await capsula.hover();

    const [arriba, abajo] = await Promise.all([capsula.boundingBox(), consentimiento.boundingBox()]);
    expect(arriba, 'la cápsula debería tener caja').not.toBeNull();
    expect(abajo, 'el consentimiento debería tener caja').not.toBeNull();
    // La cápsula queda ENCIMA del consentimiento y sin solaparse con él.
    expect(arriba!.y + arriba!.height, 'el aviso pisa el consentimiento').toBeLessThanOrEqual(abajo!.y + 1);
  });

  test('al pulsar la cápsula se va a los logros y el aviso se cierra', async ({ page }) => {
    await sembrarBiblioteca(page, { alBorde: 'uno' });
    await completar(page, 9);
    await expect(toast(page)).toBeVisible();

    await toast(page).getByRole('button', { name: 'Ver tus logros' }).click();

    // Lleva al listado y se cierra: la cápsula era la invitación, y el detalle ya está en pantalla.
    await expect(page.getByRole('heading', { level: 2, name: 'Logros' })).toBeVisible();
    await expect(page.locator('.ach-row').first()).toBeVisible();
    await expect(toast(page)).toHaveCount(0);
    // Y el logro recién conseguido está ahí, en su fila.
    const { nombre } = logro('completados-10');
    await expect(page.locator('.ach-row').filter({ hasText: nombre }).first()).toBeVisible();
  });
});

/**
 * AL SUBIR UNA VERSIÓN CON MÁS LOGROS, LO QUE YA TENÍAS SE CUENTA.
 *
 * Es el caso que el «sembrar y callar» trataba mal, y no por descuido: la primera evaluación de una sesión no
 * puede anunciar lo que ya estaba, o cada arranque sería una traca. Pero eso metía en el mismo saco dos cosas
 * distintas —la primera vez en este aparato y volver a abrir con noventa y ocho escalones nuevos en el catálogo—
 * y en la segunda sí hay noticia que dar.
 *
 * Lo que las distingue es la MARCA DE AGUA, que ya se guardaba: si existe, este aparato había evaluado antes, y
 * lo conseguido que no figura en ella es exactamente lo que ha caído desde entonces. Sirve igual para el otro
 * camino por el que aparecen logros sin haber hecho nada aquí: la sincronización con otro dispositivo.
 */
test.describe('logros · lo que te esperaba al volver', () => {
  const toast = (page: Page) => page.locator('.ach-toast');

  test('con marca de agua previa, al abrir se cuenta lo que hay de nuevo', async ({ page }) => {
    // La marca que dejaría la versión anterior: tres logros reconocidos. Todo lo demás que la biblioteca de 300
    // juegos concede es «nuevo desde la última vez», que es lo que pasa el día que se despliega la ampliación.
    await sembrarBiblioteca(page, {
      logros: true,
      marcaPrevia: ['completados-10', 'completados-25', 'resenas-5'],
    });
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const capsula = toast(page);
    await expect(capsula).toBeVisible();
    await capsula.hover();
    // Otro rótulo: no lo acabas de hacer, ya lo tenías hecho.
    await expect(capsula.locator('.ach-toast-kicker')).toHaveText('Te estaban esperando');
    const nombre = await capsula.locator('.ach-toast-name').innerText();
    expect(nombre).toMatch(/^\d+ logros nuevos$/);
    expect(Number(/(\d+)/.exec(nombre)?.[1] ?? 0)).toBeGreaterThan(100);
    await expect(capsula.locator('.ach-toast-desc')).toHaveText('Salen de lo que ya tenías en tus listas');
    await expect(capsula.locator('.ach-medal')).toHaveCount(3);
    // Y el banner lo anuncia, como cualquier otro aviso.
    await expect(page.locator('.status-banner')).toContainText(/logros conseguidos/);
  });

  test('y no se repite: al recargar ya no queda nada nuevo que contar', async ({ page }) => {
    await sembrarBiblioteca(page, { logros: true, marcaPrevia: ['completados-10'] });
    await page.goto('/completados');
    await expect(toast(page)).toBeVisible();
    // La marca se guarda con lo anunciado, así que el segundo arranque no tiene noticia.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(toast(page)).toHaveCount(0);
  });

  test('la primera vez de verdad sigue callando', async ({ page }) => {
    // Sin marca de agua no hay «desde la última vez»: es la primera, y no hay nada que contar.
    await sembrarBiblioteca(page, { logros: true });
    await page.goto('/completados');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(toast(page)).toHaveCount(0);
    await expect(page.locator('.status-banner')).toHaveCount(0);
  });
});
