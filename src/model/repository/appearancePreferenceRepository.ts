// F1 — Sincronización de apariencia (paleta + modo claro/oscuro) POR CUENTA vía Firestore `publicConfig/{uid}`.
//
// Diseño LOCAL-FIRST + nube:
//   - localStorage sigue siendo la fuente para el anti-flash (`public/theme-init.js`) y para la sesión sin cuenta;
//     `useTheme`/`usePalette` lo gestionan y aplican al DOM.
//   - Con sesión de Google, la nube manda: al entrar se HIDRATA (se vuelca a localStorage y se avisa a los hooks
//     para que re-lean y apliquen), y cada cambio local se REPLICA a Firestore.
// A diferencia de la escala de puntuación (solo nube), la apariencia funciona siempre en local aunque no haya sesión.
import { getPublicConfig, setPublicConfig } from './firebaseRepository';
import { PALETTE_KEY, THEME_KEY } from '../../core/constants/storageKeys';
import { parsePaletteId, type PaletteId } from '../../core/constants/palettes';

/** Evento que emiten la hidratación para que `useTheme`/`usePalette` re-lean localStorage y apliquen. */
export const APPEARANCE_HYDRATED_EVENT = 'mgl:appearance-hydrated';

let currentUid: string | null = null;

/** Fija/limpia el uid de la sesión; sin uid, los cambios locales no se replican a la nube. */
export function setAppearanceUid(uid: string | null): void {
  currentUid = uid;
}

/** Replica el modo claro/oscuro a la nube (best-effort; requiere sesión). */
export function persistThemePreference(theme: 'dark' | 'light'): void {
  if (currentUid) void setPublicConfig(currentUid, { theme });
}

/** Replica la paleta a la nube (best-effort; requiere sesión). */
export function persistPalettePreference(palette: PaletteId): void {
  if (currentUid) void setPublicConfig(currentUid, { palette });
}

/**
 * Hidrata apariencia desde Firestore al iniciar sesión: vuelca a localStorage lo que haya en la nube y avisa a
 * los hooks. Best-effort: si falla (reglas/offline/sin Firebase) se conserva lo local. No re-persiste (evita bucles).
 */
export async function hydrateAppearance(uid: string): Promise<void> {
  try {
    const cfg = await getPublicConfig(uid);
    let changed = false;
    if (cfg?.theme === 'dark' || cfg?.theme === 'light') {
      try { localStorage.setItem(THEME_KEY, cfg.theme); } catch { /* sin persistencia */ }
      changed = true;
    }
    if (typeof cfg?.palette === 'string') {
      try { localStorage.setItem(PALETTE_KEY, parsePaletteId(cfg.palette)); } catch { /* sin persistencia */ }
      changed = true;
    }
    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(APPEARANCE_HYDRATED_EVENT));
    }
  } catch {
    // permission-denied / offline / Firebase ausente → se conserva la apariencia local.
  }
}
