/**
 * Contratos de datos de la porra de premios («El reto del jugador»).
 *
 * Vienen de una aplicación aparte (`../GA`) que se integra aquí; ver `docs/plan-unificar-premios.md`. Lo que se
 * conserva de allí es el MODELO, que está bien pensado y no se toca sin motivo:
 *
 *  - **Los votos y los ganadores se guardan por `optionId`, nunca por nombre.** Es lo que hace el recuento
 *    independiente del idioma y lo que permite renombrar un nominado sin invalidar un solo voto.
 *  - **El título de una categoría es bilingüe y el nombre de un nominado no.** Un juego se llama igual en todas
 *    partes; «Mejor dirección artística» no. La app pinta hoy solo español (ver `docs/plan-unificar-premios.md`
 *    §7), pero el dato sigue guardándose en los dos idiomas: volver a bilingüe después sería una migración.
 *  - **Todo tolera formas antiguas.** Una opción pudo guardarse como `{ id, es, en }` o como una cadena pelada, y
 *    un voto pudo guardar el nombre en vez del id. Nada de eso se migra: se normaliza al leer
 *    (`resolveOptionId`), porque una migración de datos que se puede evitar es una migración que no se hace.
 */

/** Los dos idiomas del dato. La interfaz pinta español; el modelo guarda los dos. */
export type PremiosLanguage = 'es' | 'en';

/** Título bilingüe de una categoría. */
export interface PremiosTitle {
  es?: string;
  en?: string;
}

/** Un nominado, en su forma actual: id estable + nombre único. */
export interface PremiosOption {
  id: string;
  name: string;
}

/**
 * Un nominado tal y como puede LLEGAR de Firestore: el de arriba, el bilingüe de antes, o una cadena pelada de
 * los datos más viejos. Solo aparece en las entradas; lo que se escribe es siempre `PremiosOption`.
 */
export type PremiosOptionLike =
  | PremiosOption
  | { id?: string; name?: string; es?: string; en?: string }
  | string;

/** Una categoría de premio con sus nominados. */
export interface PremiosCategory {
  id: string;
  title: PremiosTitle | string;
  options: PremiosOptionLike[];
  /** Espejo plano de los ids, por compatibilidad con lecturas antiguas. */
  optionIds?: string[];
  /** Cuántos puntos vale acertarla. Ausente = 1. */
  weight?: number;
  orderIndex?: number;
  isActive?: boolean;
  /**
   * Ganador EMBEBIDO. Solo en archivos históricos y datos sin migrar: hoy los ganadores viven en
   * `premiosAdmin/winners`, porque la colección de categorías es de lectura abierta —hace falta para votar— y un
   * ganador aquí sería un ganador publicado antes de tiempo.
   */
  winner?: string | null;
}

/** Ganadores de una edición: categoría → `optionId` ganador. */
export type PremiosWinnersMap = Record<string, string>;

/** El voto de una persona. Uno por cuenta, reescribible mientras quede cupo de ediciones. */
export interface PremiosBallot {
  userId: string;
  /** Nombre de la cuenta de Google, tal cual, en el momento de votar. */
  userNickname?: string;
  /** El nombre que la persona eligió mostrar. Es el que se valida y el que sale en la clasificación. */
  userDisplayName?: string;
  /**
   * Pseudónimo público de su perfil. Es lo que sobrevive al archivar: el archivo publicado no lleva `userId`
   * (ver `docs/plan-unificar-premios.md` §4.1), y con esto la clasificación reconoce tu fila y enlaza tu perfil
   * sin publicar un identificador real.
   */
  profileId?: string;
  /** Categoría → `optionId` elegido. */
  selections: Record<string, string>;
  season?: number | string;
  /** Primer envío. INMUTABLE. */
  submittedAt?: string;
  updatedAt?: string;
  /** 0 al enviar, +1 por cada corrección. El tope lo aplica el servidor. */
  editCount?: number;
  isActive?: boolean;
}

/** Una fila de la clasificación, ya con su puesto denso. */
export interface PremiosLeaderboardEntry {
  rank: number;
  /** Solo en vivo: el archivo publicado NO lo lleva. */
  userId: string;
  profileId: string;
  nickname: string;
  points: number;
}

/**
 * `premiosConfig/voting`: el calendario y el estado de la edición en curso.
 *
 * CADA FECHA VIAJA EN DOS FORMATOS Y SIEMPRE JUNTOS: `<x>At` en ISO, que lee el cliente, y `<x>AtMillis` en
 * epoch, que es lo que comparan las reglas de Firestore —no saben parsear una cadena ISO—. Quitar una fecha deja
 * los DOS campos a null: con el epoch vivo y el ISO en null seguiría vigente un plazo que el panel da por
 * borrado.
 */
export interface PremiosVotingConfig {
  /** Cierre forzado del administrador. Puede cerrar antes de tiempo, nunca abrir fuera de plazo. */
  isOpen?: boolean;
  opensAt?: string | null;
  opensAtMillis?: number | null;
  closesAt?: string | null;
  closesAtMillis?: number | null;
  resultsAt?: string | null;
  resultsAtMillis?: number | null;
  season?: number | string;
  seasonId?: string;
  seasonName?: string;
  /** Id de la última edición archivada: con él se resuelve el archivo por id, sin listar la colección. */
  lastPublishedId?: string;
  /**
   * ¿Se ofrece la sección en la navegación? Lo decide el administrador; ausente = se ofrece si hay edición
   * abierta o resultados recientes (ver `core/premios/visibility`).
   */
  visible?: boolean;
  /** Última escritura del calendario. Publicar una edición la toca, así que hace de fecha de publicación. */
  updatedAt?: string;
}

/** Una categoría congelada dentro de un archivo publicado. */
export interface PremiosCategorySnapshot {
  id: string;
  title: PremiosTitle | string;
  winner: string | null;
  weight: number;
  options: PremiosOptionLike[];
}

/**
 * Una fila de la clasificación YA ARCHIVADA.
 *
 * No lleva `userId`, y es lo que distingue este tipo del de la clasificación en vivo: el archivo es de lectura
 * pública, así que no puede publicar el identificador real de ninguna cuenta. Tampoco lleva foto — la cara se
 * resuelve al pintar, con la reciprocidad del hub, que es dinámica (decisión del 20-09-2026).
 */
export interface PremiosArchivedEntry {
  rank: number;
  profileId: string;
  nickname: string;
  points: number;
}

/** Una edición archivada: lo único que queda de ella cuando se publica. */
export interface PremiosSeasonResult {
  season: number;
  seasonId: string;
  name: string;
  winners: PremiosWinnersMap;
  categoriesSnapshot: PremiosCategorySnapshot[];
  leaderboard: PremiosArchivedEntry[];
  totalBallots: number;
}

/**
 * UNA EDICIÓN GANADA. Vive en `profiles/{uid}.palmares` y lo escribe SOLO el administrador al publicar.
 *
 * POR QUÉ NO ES UN LOGRO DEL CATÁLOGO, aunque se enseñe como uno: el catálogo es derivación pura de la
 * biblioteca —la misma biblioteca produce siempre los mismos logros, se calcule cuando se calcule— y su espejo
 * publicado es un mapa de bits cuyo orden está congelado. Ganar una porra no se deriva de nada: es un hecho
 * externo que alguien concede. Meterlo en el catálogo rompería el contrato de todos los espejos ya publicados.
 *
 * Así que va por su carril, y se PINTA como una medalla (ver `PalmaresMedal`): misma forma, mismo disco en
 * penumbra, mismo lenguaje. Para quien lo mira es un logro más —uno especial, en su perfil—; para el código es
 * un dato concedido que no contamina lo que se deriva.
 */
export interface PalmaresEntry {
  /** Clave del archivo de esa edición. */
  seasonId: string;
  /** Nombre visible, congelado en el momento de conceder: el archivo puede renombrarse después. */
  seasonName: string;
  /** Puesto DENSO, 1..5. Los empatados comparten puesto. */
  rank: number;
  awardedAt: number;
}
