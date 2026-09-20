/**
 * LA FOTO DEL CALENDARIO que se sirve desde el propio dominio, para decidir si se ofrece la entrada a los
 * premios sin preguntarle a Firestore.
 *
 * ⚑ POR QUÉ NO SE LEE EL CALENDARIO DIRECTAMENTE. La entrada vive en el menú de Ajustes y en el espacio social,
 * que son cromo del arranque y los ve TODO EL MUNDO, también quien usa sus listas sin cuenta. Una lectura de
 * Firestore desde el navegador es una petición a `firestore.googleapis.com`, y la política de cookies promete
 * que abrir la app sin sincronizar y sin sesión no contacta con ningún servidor ajeno — con un test de extremo a
 * extremo que lo comprueba (`tests/e2e/smoke.test.ts`). Es exactamente el problema del aviso a los usuarios, y
 * se resuelve igual: una Pages Function sobre KV (`functions/api/premios.ts`), mismo origen y cero terceros.
 *
 * LO QUE SE PUBLICA NO ES UN «SÍ/NO», SON LAS FECHAS. Un booleano cocinado se queda viejo solo: «hay votación
 * abierta» deja de ser cierto el día del cierre, y nadie va a entrar al panel a apagarlo. Publicando los cuatro
 * campos que mira `shouldOfferPremios`, el cliente resuelve la respuesta con la hora que tenga en la mano, así
 * que la marca caduca sola y sin que nadie la toque.
 *
 * SIN DEPENDENCIAS: lo importan el cliente, la Pages Function (que Cloudflare compila aparte del bundle de Vite)
 * y el gemelo del servidor de desarrollo. Como `core/constants/tiers.ts`, no puede traerse React ni DOM.
 */

/** Los campos del calendario que necesita `shouldOfferPremios`, y ninguno más. */
export interface PremiosVisibilitySnapshot {
  /** El interruptor del panel: `true` fuerza enseñarla, `false` la oculta, `null` lo deja al calendario. */
  visible: boolean | null;
  /**
   * El CIERRE FORZADO del administrador (`isOpen: false`), que adelanta el cierre sin tocar la fecha. Viaja aquí
   * porque sin él la entrada se seguiría ofreciendo hasta el día del cierre en una edición ya cerrada a mano.
   */
  isOpen: boolean | null;
  /** Instante de apertura, en las ediciones antiguas que lo llevan. */
  opensAtMillis: number | null;
  /** Instante de cierre de la edición en curso. Sin él no hay edición. */
  closesAtMillis: number | null;
  /** Id de la última edición publicada, si la hay. */
  lastPublishedId: string | null;
  /** Sello de la última escritura del calendario: con él se mide si los resultados son recientes. */
  updatedAt: string | null;
}

/** La foto de quien no tiene ninguna: sin edición, sin archivo y sin interruptor. No se ofrece nada. */
export const EMPTY_PREMIOS_SNAPSHOT: PremiosVisibilitySnapshot = {
  visible: null,
  isOpen: null,
  opensAtMillis: null,
  closesAtMillis: null,
  lastPublishedId: null,
  updatedAt: null,
};

/**
 * Sanea lo que venga, de la red o de KV.
 *
 * Se sanea también AL LEER, como el aviso: lo que hay en KV lo escribió esta misma función, pero un valor de una
 * versión anterior —o escrito a mano desde el panel de Cloudflare— no puede llegar al navegador sin pasar por
 * aquí. Cualquier cosa rara cae en la foto vacía, que no ofrece nada: degradar es seguro.
 */
export function sanitizePremiosSnapshot(raw: unknown): PremiosVisibilitySnapshot {
  if (!raw || typeof raw !== 'object') return EMPTY_PREMIOS_SNAPSHOT;
  const data = raw as Record<string, unknown>;

  const visible = data.visible === true ? true : data.visible === false ? false : null;
  const isOpen = data.isOpen === true ? true : data.isOpen === false ? false : null;
  const numero = (valor: unknown): number | null =>
    typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
  const opens = numero(data.opensAtMillis);
  const closes = numero(data.closesAtMillis);
  const publicado = typeof data.lastPublishedId === 'string' && data.lastPublishedId.trim()
    ? data.lastPublishedId.trim().slice(0, 128)
    : null;
  const sello = typeof data.updatedAt === 'string' && data.updatedAt.trim()
    ? data.updatedAt.trim().slice(0, 40)
    : null;

  return {
    visible,
    isOpen,
    opensAtMillis: opens,
    closesAtMillis: closes,
    lastPublishedId: publicado,
    updatedAt: sello,
  };
}

/** ¿Son la misma foto? Para no reescribir KV en cada apertura del panel. */
export function samePremiosSnapshot(
  a: PremiosVisibilitySnapshot | null | undefined,
  b: PremiosVisibilitySnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    a.visible === b.visible
    && a.isOpen === b.isOpen
    && a.opensAtMillis === b.opensAtMillis
    && a.closesAtMillis === b.closesAtMillis
    && a.lastPublishedId === b.lastPublishedId
    && a.updatedAt === b.updatedAt
  );
}
