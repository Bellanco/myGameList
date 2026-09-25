import type { PaletteId } from '../../core/constants/palettes';

// Carga bajo demanda de los skins de tema (CAPA 3, `src/styles/themes/<id>/<id>.scss`), sacados del bundle
// base (auditoría #4). Los COLORES de cada paleta viven en su `themes/<id>/_colors.scss` (CAPA 2, en el
// bundle base), así que en el primer paint las paletas ya se ven con sus colores correctos; el skin
// (tipografía/formas/sombras/texturas) entra un instante después al activarse la paleta. La paleta
// por defecto no descarga nada: su skin va en el bundle base.
//
// Un tema, una hoja: grimdark cargaba también la de cyberpunk porque su glitch vivía allí y reutilizaba dos
// keyframes. Ya es suyo (ver el glitch de vox en `grimdark.scss`), así que ningún tema arrastra el skin de otro.
const SKIN_LOADERS: Partial<Record<PaletteId, () => Promise<unknown>>> = {
  arcade: () => import('../../styles/themes/arcade/arcade.scss'),
  witcher: () => import('../../styles/themes/witcher/witcher.scss'),
  persona: () => import('../../styles/themes/persona/persona.scss'),
  portal: () => import('../../styles/themes/portal/portal.scss'),
  cyberpunk: () => import('../../styles/themes/cyberpunk/cyberpunk.scss'),
  grimdark: () => import('../../styles/themes/grimdark/grimdark.scss'),
  seaofstars: () => import('../../styles/themes/seaofstars/seaofstars.scss'),
  // `forja` NO está aquí a propósito: es la paleta POR DEFECTO y su skin viaja en el bundle base
  // (`styles/index.scss`), porque es la que pinta el primer fotograma. `arcade` sí entra aquí desde que
  // dejó de ser la de por defecto: su skin es de los más pesados (rejilla del horizonte, pegatinas,
  // teclas de consola) y no tiene por qué descargarlo quien nunca elige ese tema.
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
