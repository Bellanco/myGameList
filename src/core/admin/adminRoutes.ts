// LAS PANTALLAS DEL PANEL, cada una en su dirección (ver docs/plan-admin-rediseno.md, F1).
//
// Antes el panel era una sola ruta y elegía la vista con un `useState`: recargar o pulsar «atrás» en el navegador
// sacaba del panel en vez de volver a la pantalla anterior, y no había forma de enlazar «la ficha de fulano» ni «los
// que tienen esta señal». Ahora `/admin/*` cuelga de una sola entrada de `APP_ROUTES` y la guarda de acceso sigue
// siendo una: la de `AdminHub`, que monta estas sub-rutas por dentro.
//
// Este módulo es puro (sin React ni router): lo usan la navegación, el buscador del panel y las pruebas.

export const ADMIN_PATHS = {
  today: '/admin',
  users: '/admin/usuarios',
  accounts: '/admin/cuentas',
  community: '/admin/comunidad',
  capacity: '/admin/capacidad',
  log: '/admin/registro',
  announcement: '/admin/aviso',
  achievements: '/admin/logros',
  premios: '/admin/retos',
} as const;

export type AdminScreen = keyof typeof ADMIN_PATHS;

/**
 * El orden del menú, en tres grupos: lo que se mira a diario, lo que se publica y las pantallas de configuración.
 * El grupo decide dónde va el separador; no tiene más significado.
 */
export const ADMIN_MENU: ReadonlyArray<{ screen: AdminScreen; group: 1 | 2 | 3 }> = [
  { screen: 'today', group: 1 },
  { screen: 'users', group: 1 },
  { screen: 'accounts', group: 1 },
  { screen: 'community', group: 1 },
  { screen: 'capacity', group: 1 },
  { screen: 'log', group: 1 },
  { screen: 'announcement', group: 2 },
  { screen: 'achievements', group: 3 },
  { screen: 'premios', group: 3 },
];

/** La ficha de una persona. El id es el del documento de `profiles` (hoy, su uid). */
export function adminUserPath(profileDocId: string): string {
  return `${ADMIN_PATHS.users}/${encodeURIComponent(profileDocId)}`;
}

/**
 * Qué pantalla es esta dirección, y de quién es la ficha si es una. Una dirección del panel que no existe cae en
 * `today`: es la portada, y es lo que hace también el enrutador de dentro (ver `AdminHub`).
 */
export function matchAdminPath(pathname: string): { screen: AdminScreen; userId: string } {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean.startsWith(`${ADMIN_PATHS.users}/`)) {
    const rest = clean.slice(ADMIN_PATHS.users.length + 1);
    let userId = rest;
    try {
      userId = decodeURIComponent(rest);
    } catch {
      // Un `%` suelto: se usa tal cual, que es lo que la ficha buscará y no encontrará.
    }
    return { screen: 'users', userId };
  }
  const entry = (Object.entries(ADMIN_PATHS) as Array<[AdminScreen, string]>).find(([, path]) => path === clean);
  return { screen: entry ? entry[0] : 'today', userId: '' };
}
