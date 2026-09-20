import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { JUEGOS, sembrarBiblioteca } from './seed';
import { PALETTES } from '../../src/core/constants/palettes';

/**
 * AUDITORÍA DE ACCESIBILIDAD SOBRE EL RENDER REAL.
 *
 * Qué añade sobre lo que ya había: las dieciocho reglas de `jsx-a11y` del linter leen JSX ESTÁTICO. Saben si a un
 * `<img>` le falta el `alt`, pero no pueden saber nada de lo único que se decide al pintar: el contraste real de
 * cada paleta, los roles que resultan tras componer el árbol y el estado de los controles cuando el usuario ya ha
 * interactuado. Con ocho paletas propias × dos temas, el contraste es justo lo que se rompe sin que nadie se
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
 *  - La PUERTA DE ENTRADA del hub social, que tuvo la única barra de progreso de la aplicación: le faltaba el
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

// Las paletas SE LEEN DEL REGISTRO, no se listan aquí: una lista a mano se queda corta en cuanto alguien añade
// un tema, y justo entonces es cuando hace falta auditarlo. Ver `docs/temas.md`.
const PALETAS = PALETTES.map((p) => p.id);
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
  // TRES COMPROBACIONES SEGUIDAS EN CALMA, no una. Con una sola quedaba una carrera: una animación ya creada pero
  // que todavía no ha arrancado está en `idle`, que este filtro da por terminada, así que la espera podía pasar
  // justo ANTES de que empezara el fundido y axe medía los colores a medias. Se ve solo con la máquina cargada
  // —la suite repartida entre trabajadores—, y sale como una violación de contraste que no existe: el color final
  // de `.admin-item-name` mide 12,29 sobre su fondo y axe llegó a leer 4,21.
  // El contador vive en `window` y esta función se llama más de una vez por página (tras navegar y tras abrir
  // algo), así que se pone a cero al entrar: si no, la segunda llamada heredaba una calma vieja y daba por buena
  // una pantalla cuya animación aún no había arrancado.
  // Y ANTES DE CONTAR, LAS FUENTES. Cada paleta trae la suya y al llegar repinta: el texto cambia de métrica, la
  // caja se recoloca y eso dispara transiciones NUEVAS después de que la pantalla pareciera quieta. Es lo que
  // dejaba pasar la espera con la máquina cargada, y sale como una violación de contraste que no existe —el
  // `.btn-danger` de la zona de peligro medido a mitad de transición: 4,13 en vez de los 4,6 que da quieto—.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Y CON LAS FUENTES, LO QUE AÚN ESTÁ EN CAMINO. La aplicación precarga en cuanto el navegador está
  // ocioso varios trozos suyos (los modales, sus hojas de estilo), y cada hoja que entra recalcula los estilos y
  // puede arrancar transiciones NUEVAS sobre una pantalla que ya parecía quieta — el mismo fallo que las fuentes,
  // por otra puerta. Mientras la descarga del SDK de sesión ocupaba ese hueco, esos trozos llegaban después de la
  // medición y el problema no se veía; al dejar de descargarlo para quien no ha iniciado sesión, se colaron justo
  // dentro. Esperar a que la red se calme los mete a todos ANTES de contar frames.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => { (window as unknown as { __framesEnCalma?: number }).__framesEnCalma = 0; });
  await page.waitForFunction(() => {
    const quieta = document
      .getAnimations()
      .filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity)
      .every((a) => a.playState === 'finished' || a.playState === 'idle');
    const marca = window as unknown as { __framesEnCalma?: number };
    marca.__framesEnCalma = quieta ? (marca.__framesEnCalma ?? 0) + 1 : 0;
    // DOCE FRAMES Y NO TRES (~200 ms a 60 Hz). Tres bastaban con la máquina desahogada; repartida entre cinco
    // trabajadores, las tres comprobaciones caben en el hueco anterior a que arranque una transición y la espera
    // daba por buena una pantalla que aún se estaba pintando. Doce cuesta un pestañeo y cierra la carrera.
    return (marca.__framesEnCalma ?? 0) >= 12;
  });
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

/**
 * «Datos»: la pantalla más cargada de Ajustes y la que reúne todo lo que aquí se puede romper —notas de tarjeta,
 * cajas de ayuda, formularios, botones de acción, el interruptor de la analítica, los tres documentos y el
 * borrado de la cuenta con su confirmación—. Eran dos pantallas, «Integración» y «Legal», y se auditaban por
 * separado; desde que comparten dirección, un solo recorrido las cubre a las dos.
 */
async function pantallaDeAjustes(page: Page): Promise<void> {
  await page.goto('/ajustes/datos');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Con las dos guías ABIERTAS: dentro hay listas numeradas y enlaces, que es donde el contraste se rompe sin
  // que nadie lo vea —están plegadas casi siempre—.
  for (const guia of await page.locator('.import-guide-row').all()) await guia.click();
  await animacionesDeEntradaTerminadas(page);
}

/**
 * EL MENÚ DE LA PESTAÑA, DESPLEGADO. Es la pantalla más rara de auditar de toda la aplicación: tres rótulos
 * flotando sin panel ni fondo propio, sobre un contenido que baja al 30 %. Lo que axe puede decir aquí —que los
 * enlaces tengan nombre, que el disparador anuncie su estado, que el foco se vea— es justo lo que no se puede
 * comprobar a ojo; lo que NO ve —el `text-shadow` y el contraste real sobre lo que quede debajo— se mide aparte
 * (ver la nota de `SettingsMenu`).
 */
async function menuDeAjustesAbierto(page: Page): Promise<void> {
  // EL PUNTO DE PREMIOS, ENCENDIDO A PROPÓSITO: es el único rótulo de este menú que no usa el color de texto de
  // siempre —va en el ámbar del tema— y el contraste de un amarillo sobre fondo claro es justo lo que se rompe
  // sin que nadie se entere. Fuera de temporada no se pinta, así que sin esto la auditoría nunca lo vería.
  //
  // SE ENCIENDE RESPONDIENDO POR LA API, que es de donde sale la decisión de verdad (`usePremiosVisible`): la
  // caché de este navegador solo decide el PRIMER pintado, y en cuanto `/api/premios` contesta manda ella. Con
  // la caché a secas el punto aparecía y se iba solo —`vite preview` no sirve la función, así que la respuesta
  // es la foto vacía—, y la auditoría cazaba el rótulo o no según lo que tardara el fetch.
  await page.route('**/api/premios', (route) =>
    route.fulfill({ json: { visible: true, updatedAt: new Date().toISOString() } }),
  );
  await page.goto('/completados');
  await page.evaluate(() => localStorage.setItem('mis-listas-premios-visible', 'on'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.locator('.settings-menu')).toBeVisible();
  await expect(page.locator('.settings-menu-point.is-premios')).toBeVisible();
  await animacionesDeEntradaTerminadas(page);
}

/** Puerta de entrada del hub social (sin sesión): los dos pasos, sus botones, el estado y los avisos. */
async function puertaDelHubSocial(page: Page): Promise<void> {
  await page.goto('/social');
  // Se espera al ÚLTIMO de los dos peldaños: con el primero a la vista la lista todavía puede estar pintándose.
  // (Antes se esperaba a la barra de progreso, que se fue con el rediseño a dos pasos: la lista ES el progreso.)
  await expect(page.locator('.hub-gateway-stage').nth(1)).toBeVisible();
  await animacionesDeEntradaTerminadas(page);
}

/**
 * La portada de los premios, SIN SESIÓN, que es lo que ve cualquiera que llegue por un enlace.
 *
 * Es lo único de la sección que se puede auditar sin datos: votar exige sesión y una edición abierta, y montar
 * las dos cosas aquí convertiría un recorrido de contraste en un test de integración con Firestore. Lo que sí
 * cubre —y es lo que importa para el color— son los dos textos atenuados, el distintivo de estado y los botones
 * sobre el acento, que son los papeles nuevos que trae la sección.
 */
async function portadaDePremios(page: Page): Promise<void> {
  await page.goto('/premios');
  await expect(page.locator('.premios-portada__title')).toBeVisible();
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
  await page.goto('/stats');
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
 * El LISTADO DE LOGROS, que es la pantalla con más color PROPIO de toda la app y la que más papeletas tiene de
 * romperse sin que nadie lo note:
 *
 *  - cada medalla lleva un aura de rareza (cuatro colores fijos), un numeral en blanco con `text-shadow` sobre
 *    un triángulo en degradado, y el cuadro pintado con un filtro de turbulencia y relieve;
 *  - los rótulos de rareza usan esos mismos cuatro colores COMO TEXTO, que es donde el contraste sí se mide;
 *  - y todo eso convive con las ocho paletas, que redefinen `--text`, `--surface` y el acento por debajo.
 *
 * Va con la biblioteca AMPLIA para que la lista traiga conseguidos y bloqueados a la vez: los bloqueados llevan
 * el cuadro desaturado y su texto atenuado, que es otro juego de contraste distinto del de los conseguidos.
 */
async function listadoDeLogros(page: Page): Promise<void> {
  await page.goto('/logros');
  await expect(page.getByRole('heading', { level: 2, name: 'Logros' })).toBeVisible();
  await expect(page.locator('.ach-row').first()).toBeVisible();
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

/**
 * EL CONTRASTE DE LA BARRA DE PROGRESO DEL LISTADO, que axe no mira: es contraste NO TEXTUAL —la 1.4.11 pide
 * 3:1— y además se compara contra su propio carril, no contra el fondo de la pantalla.
 *
 * Aquí se rompió una vez y en grande: la barra y su cifra pasaron a llevar el color de la RAREZA, y esos cuatro
 * colores están calibrados para el aura de la medalla —un halo sobre la penumbra del disco—, no para una barra
 * sobre el fondo del panel. Treinta de las cuarenta y ocho combinaciones de paleta, tema y rareza quedaban por
 * debajo del 3:1, con el verde del infrecuente en 1,35:1 sobre el claro de Mar de estrellas. Se arregló mezclando
 * el color con `--text`, que es lo que hace que un mismo valor sirva para los dos temas.
 */
async function contrastesDeLaBarraDeProgreso(page: Page): Promise<Array<{ rareza: string; ratio: number }>> {
  return page.evaluate(() => {
    const RAREZAS = ['comun', 'infrecuente', 'raro', 'excepcional'];
    // `color-mix` se computa como `color(srgb …)` con canales 0-1; `rgb()/rgba()` vienen en 0-255.
    const leer = (valor: string): { rgb: [number, number, number]; a: number } => {
      const n = (valor.match(/[\d.]+(?:e-?\d+)?/g) || []).map(Number);
      const rgb = (valor.startsWith('color(') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3)) as [number, number, number];
      return { rgb, a: n.length > 3 ? n[3] : 1 };
    };
    const sobre = (frente: number[], fondo: number[], alfa: number): [number, number, number] =>
      frente.map((c, i) => c * alfa + fondo[i] * (1 - alfa)) as [number, number, number];
    const luminancia = ([r, g, b]: [number, number, number]): number => {
      const canal = (v: number): number => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    };
    const contraste = (a: [number, number, number], b: [number, number, number]): number => {
      const [x, y] = [luminancia(a), luminancia(b)];
      const [alto, bajo] = x > y ? [x, y] : [y, x];
      return (alto + 0.05) / (bajo + 0.05);
    };
    // El primer fondo OPACO de la cadena: el carril es translúcido y hay que componerlo sobre algo real.
    const fondoDe = (nodo: Element | null): [number, number, number] => {
      let n: Element | null = nodo;
      while (n) {
        const leido = leer(getComputedStyle(n).backgroundColor);
        if (leido.a === 1) return leido.rgb;
        n = n.parentElement;
      }
      return [0, 0, 0];
    };

    const fila = document.querySelector('.ach-row')!;
    const carril = document.createElement('span');
    carril.className = 'ach-row-bar';
    const relleno = document.createElement('i');
    relleno.style.width = '50%';
    carril.appendChild(relleno);
    const caja = document.createElement('p');
    caja.className = 'ach-row-progress';
    caja.appendChild(carril);
    fila.appendChild(caja);

    const previa = fila.getAttribute('data-r');
    const fondo = fondoDe(fila);
    const salida = RAREZAS.map((rareza) => {
      fila.setAttribute('data-r', rareza);
      const c = leer(getComputedStyle(carril).backgroundColor);
      const pista = sobre(c.rgb, fondo, c.a);
      const r = leer(getComputedStyle(relleno).backgroundColor);
      return { rareza, ratio: contraste(sobre(r.rgb, pista, r.a), pista) };
    });

    caja.remove();
    if (previa) fila.setAttribute('data-r', previa); else fila.removeAttribute('data-r');
    return salida;
  });
}

const PANTALLAS = [
  { nombre: 'lista', amplia: false, abrir: listaConDetalleAbierto },
  { nombre: 'panel', amplia: true, abrir: panelDeEstadisticas },
  { nombre: 'ajustes', amplia: false, abrir: pantallaDeAjustes },
  { nombre: 'menú de ajustes', amplia: false, abrir: menuDeAjustesAbierto },
  { nombre: 'hub social', amplia: false, abrir: puertaDelHubSocial },
  { nombre: 'ruleta', amplia: false, abrir: ruletaAbierta },
  { nombre: 'logros', amplia: true, abrir: listadoDeLogros },
  { nombre: 'premios', amplia: false, abrir: portadaDePremios },
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

    test(`barra de progreso de logros con contraste · paleta ${palette} · tema ${theme}`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme, palette, amplia: true });
      await listadoDeLogros(page);
      const flojas = (await contrastesDeLaBarraDeProgreso(page)).filter(({ ratio }) => ratio < 3);
      expect(flojas, `Barra de progreso con menos de 3:1 sobre su carril en ${palette}/${theme}`).toEqual([]);
    });

    test(`anillo de foco visible · paleta ${palette} · tema ${theme}`, async ({ page }) => {
      await sembrarBiblioteca(page, { theme, palette });
      await page.goto('/completados');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const flojos = (await contrastesDelAnilloDeFoco(page)).filter(({ ratio }) => ratio < 3);
      expect(flojos, `Anillo de foco con menos de 3:1 en ${palette}/${theme}`).toEqual([]);
    });
  }
}
