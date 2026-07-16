import type { PaletteId } from '../../core/constants/palettes';

// Carga bajo demanda de los skins de tema (CAPA 3, `src/styles/themes/*.scss`), sacados del bundle
// base (auditoría #4). Los COLORES y el layout de cada paleta viven en `_base.scss` (CAPA 2, en el
// bundle base), así que en el primer paint las paletas ya se ven con sus colores correctos; el skin
// (tipografía/formas/sombras/texturas) entra un instante después al activarse la paleta. La paleta
// por defecto (steam) no tiene skin → no descarga nada.
//
// Acoplamiento conocido: 7 reglas de grimdark viven en la sección de cyberpunk y reutilizan sus
// @keyframes de glitch. Por eso, al activar grimdark cargamos también el skin de cyberpunk (evita
// mover keyframes entre archivos y el riesgo de romper animaciones).
const SKIN_LOADERS: Partial<Record<PaletteId, () => Promise<unknown>>> = {
  persona: () => import('../../styles/themes/persona.scss'),
  portal: () => import('../../styles/themes/portal.scss'),
  cyberpunk: () => import('../../styles/themes/cyberpunk.scss'),
  cuphead: () => import('../../styles/themes/cuphead.scss'),
  grimdark: () => Promise.all([
    import('../../styles/themes/grimdark.scss'),
    import('../../styles/themes/cyberpunk.scss'),
  ]),
};

const requested = new Set<PaletteId>();

/**
 * Carga (una sola vez) la hoja de skin de la paleta indicada. No-op para la paleta por defecto o si
 * ya se solicitó. Best-effort: ante un fallo de carga permite reintentar en el próximo cambio.
 */
export function loadPaletteSkin(palette: PaletteId): void {
  const loader = SKIN_LOADERS[palette];
  if (!loader || requested.has(palette)) {
    return;
  }
  requested.add(palette);
  void loader().catch(() => {
    requested.delete(palette);
  });
}
