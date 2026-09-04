import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { JUEGOS, sembrarBiblioteca } from './seed';

/**
 * AUDITORÍA DE ACCESIBILIDAD SOBRE EL RENDER REAL.
 *
 * Qué añade sobre lo que ya había: las dieciocho reglas de `jsx-a11y` del linter leen JSX ESTÁTICO. Saben si a un
 * `<img>` le falta el `alt`, pero no pueden saber nada de lo único que se decide al pintar: el contraste real de
 * cada paleta, los roles que resultan tras componer el árbol y el estado de los controles cuando el usuario ya ha
 * interactuado. Con seis paletas propias × dos temas, el contraste es justo lo que se rompe sin que nadie se
 * entere —basta con retocar un token de color en `_base.scss`—.
 *
 * Se auditan las DOCE combinaciones sobre cinco pantallas:
 *
 *  - La LISTA con una fila desplegada, que es la que más superficie de color tiene: chips de plataforma y género,
 *    notas, insignias, botones de acción y las cajas del detalle.
 *  - El PANEL de estadísticas, que es la que más color PROPIO tiene —rampas de nota, mapas de calor, bandas— y
 *    además mete controles dentro de SVG, que es donde el rol y el foco se rompen sin que nadie se entere. Va con
 *    la biblioteca amplia porque con tres juegos casi todos sus bloques enseñan su estado vacío, y auditar una
 *    pantalla vacía no audita nada.
 *  - AJUSTES, que es donde vive la mayor densidad de texto secundario del proyecto: notas de tarjeta, cajas de
 *    ayuda sobre superficie elevada y los enlaces teñidos con el acento. Cinco de las seis paletas tenían aquí
 *    algún contraste por debajo del 4,5:1 cuando esta pantalla no se auditaba.
 *  - La PUERTA DE ENTRADA del hub social, que es la única pantalla con una barra de progreso: le faltaba el
 *    nombre accesible en las doce combinaciones, y no lo veía nadie porque el hub no se auditaba.
 *  - La RULETA, que es un modal y trae su propio juego de color (marco, pistas, ficha del resultado).
 *
 * Y, aparte del recorrido de axe, una comprobación del ANILLO DE FOCO: axe NO evalúa contraste no textual, así
 * que el `outline` podía ser invisible —el oro de Mar de estrellas sobre su propio turquesa daba 1,05:1— y los
 * veinticuatro recorridos seguían en verde. Ver `--focus-ring` en `_base.scss`.
 *
 * El fichero va aparte del smoke a propósito: aquel se declara "deliberadamente corto" porque un smoke lento se
 * acaba ignorando, y esto son más de sesenta recorridos.
 */

const PALETAS = ['steam', 'persona', 'portal', 'cyberpunk', 'seaofstars', 'grimdark'] as const;
const TEMAS = ['dark', 'light'] as const;

/**
 * Espera a que se apaguen las animaciones de ENTRADA (aparición de tarjetas, apertura de modales…).
 *
 * No es una espera de cortesía: mientras una tarjeta está a mitad de su fundido, TODO lo que hay dentro se
 * compone sobre el fondo con opacidad parcial, y axe mide justo eso — un blanco puro sobre relleno rojo se leía
 * como #dbdadb sobre #a5462a y salían violaciones de contraste que no existen con la pantalla ya quieta.
 *
 * Las animaciones INFINITAS quedan fuera de la espera a propósito: el glitch de Sin futuro o el halo de las
 * insignias no terminan nunca, así que esperarlas colgaría el recorrido.
 */
async function animacionesDeEntradaTerminadas(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity)
      .every((a) => a.playState === 'finished' || a.playState === 'idle'),
  );
}

/** Deja la lista pintada y una fila abierta: es el estado con más color y más controles a la vista. */
async function listaConDetalleAbierto(page: Page): Promise<void> {
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lista del completista');
  const fila = page.locator(`button[aria-controls="game-detail-${JUEGOS[0].id}"]`);
  await fila.click();
  await expect(fila).toHaveAttribute('aria-expanded', 'true');
  await animacionesDeEntradaTerminadas(page);
}

/** Ajustes: notas de tarjeta, cajas de ayuda y enlaces teñidos con el acento, todo junto. */
async function pantallaDeAjustes(page: Page): Promise<void> {
  await page.goto('/ajustes');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // La guía de importación va plegada: es justo donde vivían los enlaces con el acento a pelo.
  const guia = page.locator('.import-guide-link').first();
  if (await guia.count()) await guia.click();
  await animacionesDeEntradaTerminadas(page);
}

/** Puerta de entrada del hub social (sin sesión): pasos, barra de progreso y avisos. */
async function puertaDelHubSocial(page: Page): Promise<void> {
  await page.goto('/social');
  await expect(page.locator('.hub-gateway-progress-track')).toBeVisible();
  await animacionesDeEntradaTerminadas(page);
}

/** La ruleta abierta, que es un modal con su propio juego de color. */
async function ruletaAbierta(page: Page): Promise<void> {
  await page.goto('/completados');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.locator('.fab-roulette').first().click();
  await expect(page.locator('.rl-drum')).toBeVisible();
  await animacionesDeEntradaTerminadas(page);
}

/** Deja el panel de estadísticas pintado con todos sus bloques a la vista. */
async function panelDeEstadisticas(page: Page): Promise<void> {
  await page.goto('/perfil');
  // Las tarjetas se destapan al llegar a ellas; para auditarlas hay que tenerlas todas montadas.
  await expect(page.locator('.stats-hub')).toBeVisible();
  await page.evaluate(() => {
    const hub = document.querySelector('.stats-hub');
    hub?.classList.remove('is-watching');
    hub?.querySelectorAll(':scope > *').forEach((card) => card.classList.add('is-in'));
  });
  await expect(page.locator('.genre-bump-svg')).toBeVisible();
  await animacionesDeEntradaTerminadas(page);
}

/**
 * Los nombres del tambor de la ruleta quedan FUERA del contraste: el tambor los pinta en 3D con opacidad y
 * desenfoque crecientes según se alejan del centro (ver `drumStyle` en `RouletteModal.tsx`), así que los de los
 * extremos bajan a ~1,8:1 A PROPÓSITO. Es el gesto de la máquina, no un descuido de color, y el nombre que
 * cuenta —el del centro, y la ficha del resultado— se pinta nítido y con contraste de sobra.
 */
const EXCLUIDO_DEL_CONTRASTE = '.rl-item';

/** Las violaciones, resumidas para que el fallo diga QUÉ arreglar sin abrir el informe. */
async function violacionesDe(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude(EXCLUIDO_DEL_CONTRASTE)
    .analyze();
  // Con los datos de la primera comprobación: en un fallo de contraste dice los dos colores y el ratio, que es
  // lo que hace falta para arreglarlo sin abrir el informe ni reproducirlo a mano.
  return violations.map(
    (v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')} :: ${JSON.stringify(v.nodes[0]?.any?.[0]?.data)}`,
  );
}

/**
 * El ANILLO DE FOCO, que es lo que axe no mira: `--focus-ring` se dibuja sobre cualquiera de las cuatro
 * superficies de la paleta, así que la 1.4.11 le pide 3:1 contra todas ellas. Se mide el token, y no un
 * elemento concreto enfocado, porque el anillo aparece en decenas de controles repartidos por toda la app y
 * lo que se quiere blindar es el color, no cada sitio donde se usa.
 */
async function contrastesDelAnilloDeFoco(page: Page): Promise<Array<{ sobre: string; ratio: number }>> {
  return page.evaluate(() => {
    const raiz = document.documentElement;
    // El valor calculado de una variable puede ser un `var()` sin resolver: se pinta en un elemento de usar y
    // tirar para que el motor lo resuelva a un color de verdad.
    const resolver = (expresion: string): [number, number, number] => {
      const sonda = document.createElement('span');
      sonda.style.color = expresion;
      raiz.appendChild(sonda);
      const pintado = getComputedStyle(sonda).color;
      sonda.remove();
      const [r, g, b] = pintado.match(/[\d.]+/g)!.map(Number);
      return [r, g, b];
    };
    const luminancia = ([r, g, b]: [number, number, number]): number => {
      const canal = (v: number): number => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    };
    const anillo = luminancia(resolver('var(--focus-ring)'));
    return ['--bg', '--surface', '--surface-elevated', '--surface-hover'].map((sobre) => {
      const fondo = luminancia(resolver(`var(${sobre})`));
      const [alto, bajo] = anillo > fondo ? [anillo, fondo] : [fondo, anillo];
      return { sobre, ratio: (alto + 0.05) / (bajo + 0.05) };
    });
  });
}

const PANTALLAS = [
  { nombre: 'lista', amplia: false, abrir: listaConDetalleAbierto },
  { nombre: 'panel', amplia: true, abrir: panelDeEstadisticas },
  { nombre: 'ajustes', amplia: false, abrir: pantallaDeAjustes },
  { nombre: 'hub social', amplia: false, abrir: puertaDelHubSocial },
  { nombre: 'ruleta', amplia: false, abrir: ruletaAbierta },
] as const;

for (const palette of PALETAS) {
  for (const theme of TEMAS) {
    for (const { nombre, amplia, abrir } of PANTALLAS) {
      test(`sin violaciones de accesibilidad · ${nombre} · paleta ${palette} · tema ${theme}`, async ({ page }) => {
        await sembrarBiblioteca(page, { theme, palette, amplia });
        await abrir(page);
        expect(await violacionesDe(page), `Violaciones en ${nombre} con ${palette}/${theme}`).toEqual([]);
      });
    }

    test(`anillo de foco visible · paleta ${palette} · tema ${theme}`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme, palette });
      await page.goto('/completados');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const flojos = (await contrastesDelAnilloDeFoco(page)).filter(({ ratio }) => ratio < 3);
      expect(flojos, `Anillo de foco con menos de 3:1 en ${palette}/${theme}`).toEqual([]);
    });
  }
}
