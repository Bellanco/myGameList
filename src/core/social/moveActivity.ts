// Actividad de LISTA del canal social: el mensaje de «apuntó», «empezó», «terminó» o «dejó» un juego.
//
// Se deriva del sello `enteredAt` del propio juego (ver `GameItem.enteredAt`), que registra cuándo entró en cada
// lista la PRIMERA vez y nunca se reescribe. Eso es lo que hace que esto sea una PROYECCIÓN y no un registro de
// eventos: la misma biblioteca produce siempre los mismos mensajes, con la misma fecha, se publique una vez o
// veinte, desde este dispositivo o desde otro. No hay cola de eventos que se pueda perder ni duplicar, y la
// publicación puede ir a rebufo de una escritura que ya iba a ocurrir en vez de pedir la suya.
//
// La contrapartida de derivar del sello estable: solo hay un mensaje por (juego, lista). Volver a una lista de la
// que se salió —una rejugada— no genera uno nuevo, porque el sello no se reescribe. Registrar cada transición
// exigiría un historial que sí crece sin techo y que ensuciaría el merge en cada guardado.
//
// Y una regla que no sale del sello sino del sentido común del feed: un juego que se TERMINÓ hace años y se mete
// hoy en la biblioteca no anuncia nada («terminó tal cosa» sería falso), así que el mensaje de Completados exige
// que el año de `years` coincida con el del sello. Ver `completedInStampYear`.
//
// PRIVACIDAD. Aquí está la única excepción consentida a que los sellos no salgan de este aparato: lo que se
// publica es el EVENTO derivado (juego, lista, instante), nunca el campo `enteredAt`, que sigue prohibido en el
// gist social (ver `SOCIAL_PRIVATE_FIELDS`) y se sigue borrando de los listados que baja una amistad (ver
// `applyProfileVisibility`). Las listas que el usuario tiene OCULTAS quedan fuera: publicar «dejó X» de una lista
// escondida contaría por otra puerta justo lo que el ajuste de visibilidad esconde.
import { TAB_IDS, type TabData, type TabId } from '../../model/types/game';

/**
 * Un mensaje de lista tal y como se publica en el gist social.
 *
 * Deliberadamente magro: cuatro campos. No lleva el actor —el gist social es de UN autor y el lector le pone la
 * identidad al hidratar el directorio, igual que hace con la actividad— ni nota, ni texto. La diferencia no es
 * cosmética: una entrada de `activity` ronda los 240 bytes y esto ~80, y con cuatro listas por juego el canal de
 * una biblioteca grande se mide en cientos de kB contra un techo de gist de 950.
 */
export interface SocialMoveEntry {
  /**
   * `<gameId>:<tab>`. Determinista a propósito: es lo que hace idempotente la publicación (republicar reescribe
   * la misma entrada en vez de añadir otra). Es único DENTRO de un gist, no entre gists: el feed mezcla varios
   * autores, así que la clave de render tiene que combinarlo con el gist de origen.
   */
  id: string;
  gameId: number;
  gameName: string;
  /** Lista en la que entró: `c` terminado, `v` dejado, `e` empezado, `p` apuntado. */
  tab: TabId;
  /** Instante de la entrada (día, hora y minuto), tal cual lo selló la app. */
  at: number;
}

/** Tope de mensajes de lista que publica un gist: los más recientes. Acota el peso del canal. */
export const MOVE_ACTIVITY_MAX = 400;

/**
 * Rango válido de `Date` en ms (±100M días). Un `at` fuera de rango no es una fecha: es un timestamp en
 * micro/nanosegundos o basura, y el feed lo descartaría al agrupar por día DESPUÉS de haberle dejado copar el
 * corte visible (mismo fallo que ya arreglado en `hasRenderableTimestamp`). Se queda fuera en origen.
 */
const MAX_TIMESTAMP_MS = 8.64e15;

/** ¿Es un instante publicable? Ni cero, ni negativo, ni fuera del rango que `Date` sabe representar. */
export function isPublishableTimestamp(value: unknown): boolean {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && numeric <= MAX_TIMESTAMP_MS;
}

/** Nombre de la clave de un mensaje. La identidad es (juego, lista), no la fecha. */
export function buildMoveId(gameId: number, tab: TabId): string {
  return `${gameId}:${tab}`;
}

/**
 * ¿El juego se COMPLETÓ en el año del sello?
 *
 * Es el filtro que separa jugar de catalogar. `enteredAt.c` dice cuándo el juego llegó a Completados en ESTA
 * aplicación, no cuándo se terminó: quien mete hoy en su biblioteca algo que se pasó hace seis años estampa un
 * sello de hoy, y sin esta comprobación el feed de sus amistades anunciaba «terminó tal juego» como si acabara de
 * ocurrir. El año real del hecho solo lo sabe `years`, que es el único campo que el usuario rellena a mano con
 * él —y que en Completados es obligatorio—, así que es él quien manda.
 *
 * Sin `years` NO se publica: el mensaje afirma algo con fecha, y sin el año no hay forma de saber si eso pasó
 * ahora o hace una década. Ante la duda, no se anuncia. Una rejugada sí sale (`years` es multivalor: si incluye
 * el año del sello, ese sello cuenta).
 *
 * El año se lee en hora LOCAL, como todo lo que en esta aplicación se compara con el calendario de quien mira.
 */
function completedInStampYear(game: { years?: number[] }, stamp: number): boolean {
  const years = Array.isArray(game.years) ? game.years.map(Number) : [];
  if (years.length === 0) {
    return false;
  }
  return years.includes(new Date(stamp).getFullYear());
}

/**
 * Actor de la RESEÑA de cada juego, indexado por `gameId`.
 *
 * Existe porque el detalle de una reseña se abre con el `actorProfileId` que lleva la entrada de actividad —el
 * pseudónimo público del gist— y NO con el id de la entrada del directorio, que para una amistad es su uid de
 * Firebase. Son dos identificadores distintos para la misma persona, y confundirlos deja el enlace apuntando a
 * una pantalla que no encuentra nada. Un mensaje de lista no lleva actor (se ahorra por peso), así que el que
 * necesita se toma de la actividad del mismo gist al hidratar.
 *
 * Ante varias entradas del mismo juego (posible al fusionar dos gists) gana la última: da igual cuál, todas son
 * del mismo autor.
 */
export function reviewActorsByGame(
  activity: ReadonlyArray<{ type: string; gameId: number; actorProfileId: string }>,
): Map<number, string> {
  const byGame = new Map<number, string>();
  for (const entry of activity) {
    if (entry.type === 'review' && entry.actorProfileId) {
      byGame.set(Number(entry.gameId), entry.actorProfileId);
    }
  }
  return byGame;
}

export interface DeriveMoveActivityOptions {
  /** Listas que el usuario esconde a sus amistades: no publican mensaje. */
  hiddenTabs?: readonly TabId[];
  /** Tope de mensajes devueltos (los más recientes). Por defecto `MOVE_ACTIVITY_MAX`. */
  max?: number;
}

/**
 * Proyecta los mensajes de lista de una biblioteca. PURA: sin reloj propio, sin E/S y sin estado.
 *
 * Recorre TODOS los sellos de cada juego, no solo el de la lista en la que está ahora: un juego terminado que
 * pasó por próximos y por «en curso» aporta sus tres mensajes con sus tres fechas, que es lo que hace que la
 * actividad tenga historia el primer día en vez de empezar en blanco.
 *
 * El filtro de listas ocultas se aplica a la lista DEL MENSAJE, no a la lista actual del juego: así un juego que
 * hoy está en una lista escondida sigue contando que se empezó (no revela dónde está), y uno que está a la vista
 * no delata su paso por la lista escondida.
 */
export function deriveMoveActivity(games: TabData, options: DeriveMoveActivityOptions = {}): SocialMoveEntry[] {
  const hidden = new Set(options.hiddenTabs || []);
  const max = Math.max(0, options.max ?? MOVE_ACTIVITY_MAX);
  if (max === 0) {
    return [];
  }

  // Por (juego, lista) se conserva el sello MÁS ANTIGUO. El sello ya es «la primera vez», así que solo hay algo
  // que decidir si la biblioteca llega corrupta (el mismo id en dos listas): entonces la fecha más antigua es la
  // que respeta la semántica del campo.
  const byId = new Map<string, SocialMoveEntry>();

  for (const tab of TAB_IDS) {
    for (const game of games?.[tab] || []) {
      const gameId = Number(game?.id || 0);
      const gameName = String(game?.name || '').trim();
      if (gameId <= 0 || !gameName) {
        continue;
      }

      for (const stampTab of TAB_IDS) {
        if (hidden.has(stampTab)) {
          continue;
        }
        const at = game.enteredAt?.[stampTab];
        if (!isPublishableTimestamp(at)) {
          continue;
        }
        // Completados es la única lista cuyo hecho tiene fecha propia (`years`), y por tanto la única donde se
        // puede distinguir «lo he terminado» de «lo estoy catalogando». Las demás no necesitan el filtro: apuntar
        // o empezar un juego OCURRE cuando se hace, aunque el juego sea de 1998.
        if (stampTab === 'c' && !completedInStampYear(game, Number(at))) {
          continue;
        }

        const id = buildMoveId(gameId, stampTab);
        const current = byId.get(id);
        if (!current || Number(at) < current.at) {
          byId.set(id, { id, gameId, gameName, tab: stampTab, at: Number(at) });
        }
      }
    }
  }

  return sortMoveEntries([...byId.values()]).slice(0, max);
}

/** Orden del canal: del mensaje más reciente al más antiguo, con la clave como desempate estable. */
export function sortMoveEntries(entries: SocialMoveEntry[]): SocialMoveEntry[] {
  return [...entries].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

export interface ReconcileMoveActivityInput {
  /** Lo que dicen los sellos de ESTA biblioteca (salida de `deriveMoveActivity`). */
  derived: SocialMoveEntry[];
  /** Lo que hay publicado ahora mismo en el gist. */
  published: readonly SocialMoveEntry[];
  /** Ids de juego presentes en los listados locales. Lo que no está aquí es candidato a huérfano. */
  knownGameIds: ReadonlySet<number>;
  /** Listas ocultas: se retiran SIEMPRE, sin importar lo que digan los listados. */
  hiddenTabs?: readonly TabId[];
  /**
   * Reloj de los listados locales (`TabData.updatedAt`). Con `0` no se retira ningún huérfano: es el modo
   * «solo altas» que usa la publicación a rebufo de una reseña, donde no toca auditar nada.
   */
  localUpdatedAt: number;
}

/**
 * Decide el conjunto de mensajes que debe quedar publicado: lo derivado de esta biblioteca MÁS lo ya publicado
 * que esta biblioteca no tiene autoridad para retirar.
 *
 * La pregunta que decide cada caso es «¿puedo juzgar este mensaje?», y la respuesta depende de si el juego está
 * delante:
 *
 *   · Lista OCULTA → se retira. Es el ajuste del propio usuario y ahí la autoridad es total.
 *   · El juego está en los listados y la proyección NO produce ese mensaje → se retira. Tengo el juego delante,
 *     con sus sellos y sus años: si de ahí no sale este mensaje, no debe seguir publicado. Es lo que limpia los
 *     mensajes que se publicaron ANTES de que existiera el filtro de «jugar, no catalogar» —el «terminó tal cosa»
 *     de un juego que en realidad se pasó hace años— y también lo que quita el sobrante cuando alguien corrige el
 *     año de un juego a mano.
 *   · El juego NO está en los listados → solo se retira si el mensaje es anterior al reloj de esos listados. Un
 *     dispositivo recién instalado, o uno cuyo sync de juegos aún no ha llegado, tiene una biblioteca PARCIAL: no
 *     puede borrar del canal los mensajes de los juegos que aquí todavía no están.
 *
 * De ahí que la retirada exija `knownGameIds` poblado: quien no pasa la biblioteca (la publicación a rebufo, que
 * pasa el conjunto vacío y `localUpdatedAt: 0`) no retira nada, solo añade.
 */
export function reconcileMoveActivity(input: ReconcileMoveActivityInput): SocialMoveEntry[] {
  const hidden = new Set(input.hiddenTabs || []);
  const byId = new Map<string, SocialMoveEntry>();

  for (const entry of input.derived) {
    if (!hidden.has(entry.tab)) {
      byId.set(entry.id, entry);
    }
  }

  for (const entry of input.published) {
    if (byId.has(entry.id) || hidden.has(entry.tab)) {
      continue; // ya lo trae la proyección, o su lista está escondida
    }
    // Con el juego delante, la biblioteca local manda: la proyección no lo ha producido, así que sobra.
    if (input.knownGameIds.has(entry.gameId)) {
      continue;
    }
    // Sin el juego delante solo se retira lo que los listados desmienten por fecha; el resto se conserva.
    if (entry.at <= input.localUpdatedAt) {
      continue;
    }
    byId.set(entry.id, entry);
  }

  return sortMoveEntries([...byId.values()]).slice(0, MOVE_ACTIVITY_MAX);
}
