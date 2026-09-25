// Declaración de las preferencias de APARIENCIA sobre la fábrica genérica (`preferenceStore`): qué clave usa
// cada una, cómo se valida, qué pinta en el `<html>` y a qué campo de `publicConfig/{uid}` se replica.
//
// Vive en la capa de vista porque lo específico de cada preferencia es su efecto en el DOM; la fábrica, que es
// la que habla con localStorage y con Firestore, no sabe nada de temas ni de atributos.
//
// La lógica de aplicación debe seguir siendo IDÉNTICA a la de `public/theme-init.js`, que corre antes del primer
// render para evitar el flash de tema/paleta/caja.
import { COVERS_KEY, EFFECTS_KEY, GRID_SIZE_KEY, LIST_SHAPE_KEY, PALETTE_KEY, STEAM_BUTTON_KEY, THEME_KEY, UPPERCASE_KEY } from '../../core/constants/storageKeys';
import { paletteBg, parsePaletteId, type PaletteId } from '../../core/constants/palettes';
import { createPreferenceStore, hydratePreferencesFromCloud } from '../../model/repository/preferenceStore';
import { loadPaletteSkin } from './paletteSkin';

export type ThemePreference = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** Tema del sistema; si no se puede detectar (sin matchMedia o sin coincidencia), por defecto OSCURO. */
function systemDefault(): ThemePreference {
  if (typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(LIGHT_QUERY).matches) {
    return 'light';
  }
  return 'dark';
}

/**
 * Actualiza la barra del navegador / status bar móvil con el `--bg` de la paleta+tema activos. Depende de AMBAS
 * preferencias, así que la disparan las dos al aplicarse.
 *
 * Referencia a `palettePreference`, declarada más abajo: se resuelve al LLAMAR, y para entonces el módulo ya está
 * evaluado (nadie invoca esto durante la evaluación).
 */
export function applyThemeColor(theme: ThemePreference): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', paletteBg(palettePreference.get(), theme));
  }
}

const onOff = {
  serialize: (value: boolean): string => (value ? 'on' : 'off'),
  fromCloud: (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null),
};

/**
 * Modo claro/oscuro. El tema oscuro es el `:root` por defecto, así que para oscuro se RETIRA el atributo y para
 * claro se fija `data-theme="light"`.
 */
export const themePreference = createPreferenceStore<ThemePreference>({
  key: THEME_KEY,
  parse: (raw) => (raw === 'light' || raw === 'dark' ? raw : systemDefault()),
  serialize: (value) => value,
  cloudField: 'theme',
  fromCloud: (value) => (value === 'dark' || value === 'light' ? value : null),
  applyToDom: (theme) => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
    applyThemeColor(theme);
  },
});

/**
 * Paleta de color. TODAS fijan `data-palette` —incluida la de por defecto, que ya lo trae escrito del anti-flash
 * de `index.html`— y cargan su skin (CAPA 3) bajo demanda: los colores ya están en base, así que no hay flash.
 */
export const palettePreference = createPreferenceStore<PaletteId>({
  key: PALETTE_KEY,
  parse: (raw) => parsePaletteId(raw),
  serialize: (value) => value,
  cloudField: 'palette',
  fromCloud: (value) => (typeof value === 'string' ? parsePaletteId(value) : null),
  applyToDom: (palette) => {
    // `loadPaletteSkin` es no-op para las que no tienen skin bajo demanda (la de por defecto, que lo trae en el
    // bundle base), así que no hace falta preguntar por cuál es cuál.
    loadPaletteSkin(palette);
    document.documentElement.setAttribute('data-palette', palette);
    applyThemeColor(themePreference.get());
  },
});

/** Caja del texto de interfaz (mayúsculas sí/no), común a todos los temas. Opt-in. */
export const uppercasePreference = createPreferenceStore<boolean>({
  key: UPPERCASE_KEY,
  parse: (raw) => raw === 'on',
  serialize: onOff.serialize,
  cloudField: 'uppercase',
  fromCloud: onOff.fromCloud,
  applyToDom: (on) => toggleRootFlag('data-uppercase', on),
});

/**
 * Efectos visuales animados de los temas (barridos, glitch, parpadeo CRT, estrellas fugaces…). Activados por
 * defecto. Las reglas CSS cuelgan de `:root[data-effects="on"]`, así que al desactivar se retira el atributo y
 * ninguna regla casa. Al ser decorativos no necesitan anti-flash.
 */
export const effectsPreference = createPreferenceStore<boolean>({
  key: EFFECTS_KEY,
  parse: (raw) => raw !== 'off',
  serialize: onOff.serialize,
  cloudField: 'effects',
  fromCloud: onOff.fromCloud,
  applyToDom: (on) => toggleRootFlag('data-effects', on),
});

/**
 * F5 — FORMA DEL LISTADO. Dos maneras de mirar la misma biblioteca:
 *   · `list`  — renglones: un juego por línea, con el nombre de titular y sus datos debajo. Para recorrer
 *               mucho y buscar uno.
 *   · `grid`  — mosaico: cajas en rejilla, con la nota de protagonista. Para pasear por la colección.
 *
 * Se escribe en `<html>` con `data-list-shape` porque hay CSS que cuelga de ella fuera del listado (la barra de
 * herramientas marca el botón activo), y porque así un tema puede vestir cada forma a su manera sin que ningún
 * componente le pase nada.
 *
 * ES DE ESTE APARATO Y NO DE LA CUENTA (decisión del 20-09-2026). Se sincronizaba con el resto de la apariencia,
 * y eso la convertía en la única preferencia que EMPEORA al seguirte: en el móvil caben dos cuadros y en el
 * monitor ocho, así que quien pasea por la colección en el sofá y busca un título concreto en el escritorio
 * quiere una forma en cada sitio — y con la sincronización puesta, elegir en uno reordenaba el otro. El tema y
 * la paleta sí viajan: esos son la misma decisión en cualquier pantalla.
 */
export type ListShape = 'list' | 'grid';

export const listShapePreference = createPreferenceStore<ListShape>({
  key: LIST_SHAPE_KEY,
  parse: (raw) => (raw === 'grid' ? 'grid' : 'list'),
  serialize: (shape) => shape,
  applyToDom: (shape) => document.documentElement.setAttribute('data-list-shape', shape),
});

/**
 * TAMAÑO DE LOS CUADROS del mosaico. Tres pasos —apretado, normal, holgado— y no un deslizador continuo: lo que
 * se elige de verdad es «me caben más» o «se ven mejor», y con tres escalones eso son dos pulsaciones en vez de
 * apuntar a un punto de una barra.
 *
 * Cambia el ANCHO MÍNIMO de cuadro que usa `GameTable` para repartir columnas, así que un paso no es un salto
 * fijo de columnas: a 1440 px salen 8, 6 y 5; en un teléfono, 3, 2 y 1.
 *
 * Se escribe en `<html>` con `data-grid-size` para que un tema pueda vestir cada densidad a su manera sin que
 * ningún componente le pase nada, igual que la forma.
 *
 * Y COMO LA FORMA, ES DE ESTE APARATO: cuántos cuadros caben bien depende de la pantalla que se tenga delante,
 * no de quién mira. Ver `listShapePreference`.
 */
export type GridSize = 'sm' | 'md' | 'lg';

export const gridSizePreference = createPreferenceStore<GridSize>({
  key: GRID_SIZE_KEY,
  parse: (raw) => (raw === 'sm' || raw === 'lg' ? raw : 'md'),
  serialize: (size) => size,
  applyToDom: (size) => document.documentElement.setAttribute('data-grid-size', size),
});

/**
 * Visibilidad del botón "Steam Deck" de la barra de filtros. Opt-in y sin efecto en el DOM: solo expone el
 * booleano que consume la Toolbar.
 */
export const steamButtonPreference = createPreferenceStore<boolean>({
  key: STEAM_BUTTON_KEY,
  parse: (raw) => raw === 'on',
  serialize: onOff.serialize,
  cloudField: 'showSteamButton',
  fromCloud: onOff.fromCloud,
});

/**
 * CARÁTULAS DE LOS JUEGOS. Apagada por defecto, y eso es lo importante de esta preferencia: encenderla es lo que
 * autoriza a que el mosaico pida imágenes, y con ellas a que el servidor consulte IGDB por los títulos de tu
 * biblioteca. Sin encenderla, la app no pide ni una sola carátula y las cajas se quedan con su portada de casa.
 *
 * Por eso `parse` exige el `'on'` explícito (mismo criterio que el botón de Steam) en vez de `raw !== 'off'`:
 * ausencia de valor es NO, nunca «supongo que sí».
 */
export const coversPreference = createPreferenceStore<boolean>({
  key: COVERS_KEY,
  parse: (raw) => raw === 'on',
  serialize: onOff.serialize,
  cloudField: 'covers',
  fromCloud: onOff.fromCloud,
});

/**
 * F4 — «de qué listas veo los movimientos». Se declara en `model/repository/feedMovePreference` y se re-exporta
 * AQUÍ a propósito: esta re-exportación es lo que la registra en el arranque, y `hydratePreferencesFromCloud` solo
 * hidrata lo ya declarado (la sesión de Google puede iniciarse sin abrir nunca el hub). El hub, en cambio, importa
 * el módulo pequeño y no este, para no arrastrar las preferencias de apariencia a su chunk.
 */
export { feedMoveTabsPreference } from '../../model/repository/feedMovePreference';

function toggleRootFlag(attribute: string, on: boolean): void {
  const root = document.documentElement;
  if (on) {
    root.setAttribute(attribute, 'on');
  } else {
    root.removeAttribute(attribute);
  }
}

/**
 * Vuelca a local la apariencia guardada en la nube al iniciar sesión y la aplica. Best-effort: si falla se
 * conserva lo local, y nunca re-persiste (evita bucles).
 *
 * Se expone DESDE AQUÍ, y no desde `preferenceStore`, a propósito: importarla arrastra este módulo, y con él la
 * declaración de los stores de arriba. Si se llamara a la función genérica sin haber importado las
 * declaraciones, no habría nada registrado que hidratar y fallaría en silencio.
 */
export function hydrateAppearance(uid: string): Promise<void> {
  return hydratePreferencesFromCloud(uid);
}

/** Temporizador ÚNICO del cross-fade: tema y paleta comparten la misma animación y no deben pisarse. */
let crossFadeTimer: ReturnType<typeof setTimeout> | null = null;

/** Marca el `<html>` mientras cambian los colores para fundirlos (ver `.theme-anim` en `_base.scss`). */
export function startColorCrossFade(): void {
  const root = document.documentElement;
  root.classList.add('theme-anim');
  if (crossFadeTimer) clearTimeout(crossFadeTimer);
  crossFadeTimer = setTimeout(() => root.classList.remove('theme-anim'), 400);
}
