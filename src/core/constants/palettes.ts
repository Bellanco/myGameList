// F1 — Registro de TEMAS (paletas de color). Fuente única para el TS/JS: id, etiqueta, acento y `--bg` de
// cada tema. La apariencia real (colores + "skin") vive en CSS, un bloque por tema, de forma MODULAR: cada
// tema está aislado en `[data-palette="<id>"]` y no afecta a los demás. El tema por defecto es "steam"
// (sin atributo `data-palette`; sus valores viven en `:root`).
//
// ▟ CÓMO AÑADIR UN TEMA NUEVO (aditivo; nada más que tocar: el selector de Ajustes, la persistencia local y la
//   sync en Firestore leen automáticamente de `PALETTES`):
//   1) Aquí: añade el `id` al tipo `PaletteId` y una entrada a `PALETTES` (id, label, accent, bg.dark/light;
//      `accent2` opcional si el tema es de dos colores, para distinguir su muestra en el selector).
//   2) `src/styles/_base.scss` (CAPA 2 · identidad): añade `:root[data-palette="<id>"]` (oscuro) y su gemelo
//      `:root[data-palette="<id>"][data-theme="light"]` con los ~26 tokens; el resto se deriva solo.
//   3) `public/theme-init.js`: añade el `--bg` del tema al mapa `BG` (anti-flash antes del primer render).
//   4) (Opcional) `src/styles/_themes.scss` (CAPA 3 · skin): UN ÚNICO bloque `[data-palette="<id>"]` con la
//      dirección de arte — plantilla §1–§13 en la cabecera del fichero, AUTOCONTENIDA (hover de botones y
//      barra inferior incluidos). Si no lo añades, el tema usa solo sus colores.
//   5) (Solo si usa fuente propia) `index.html`: añade la familia al `<link>` de Google Fonts; su .woff2 solo
//      se descarga cuando ese tema pinta.

import type { ThemePreference } from '../../view/hooks/useTheme';

export type PaletteId = 'steam' | 'persona' | 'portal' | 'cyberpunk' | 'cuphead';

export interface PaletteMeta {
  readonly id: PaletteId;
  readonly label: string;
  /** Color de acento (para la muestra en el selector). */
  readonly accent: string;
  /** Color secundario OPCIONAL para la muestra del selector (temas con dualidad de color, p. ej. el
   *  azul+naranja de "Cámara de pruebas"), para distinguirlos de otros de acento parecido. */
  readonly accent2?: string;
  /** `--bg` de cada tema; debe coincidir con `_base.scss`. */
  readonly bg: { readonly dark: string; readonly light: string };
}

export const DEFAULT_PALETTE: PaletteId = 'steam';

export const PALETTES: readonly PaletteMeta[] = [
  { id: 'steam', label: 'Clásico', accent: '#1a9fff', bg: { dark: '#1a1e24', light: '#f0e9db' } },
  { id: 'persona', label: 'Corazón rebelde', accent: '#ff1f3d', bg: { dark: '#0d0d0d', light: '#f4f1ee' } },
  { id: 'portal', label: 'Cámara de pruebas', accent: '#0091d6', accent2: '#f57a00', bg: { dark: '#12171b', light: '#e7ecf0' } },
  { id: 'cyberpunk', label: 'Sin futuro', accent: '#fcee0a', accent2: '#00f0ff', bg: { dark: '#08090d', light: '#e7eaee' } },
  { id: 'cuphead', label: 'Trato con el diablo', accent: '#e5342a', accent2: '#2f7fc9', bg: { dark: '#1c1209', light: '#eddcac' } },
];

const PALETTE_IDS = new Set<string>(PALETTES.map((p) => p.id));

/** Valida un valor arbitrario (p. ej. de localStorage) y cae a la paleta por defecto si no es válido. */
export function parsePaletteId(raw: string | null | undefined): PaletteId {
  return typeof raw === 'string' && PALETTE_IDS.has(raw) ? (raw as PaletteId) : DEFAULT_PALETTE;
}

/** `--bg` de la paleta para el tema dado (para el `theme-color` del navegador). */
export function paletteBg(id: PaletteId, theme: ThemePreference): string {
  const meta = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  return meta.bg[theme];
}
