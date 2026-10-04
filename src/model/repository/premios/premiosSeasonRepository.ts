/**
 * El ciclo de vida de una edición. Tres pasos y una función para cada uno:
 *
 *   `openSeason()`             abrir    → nombre y fecha de cierre, y a votar
 *   `closeSeasonNow()`         cerrar   → adelanta el cierre (la fecha lo haría sola)
 *   `publishAndArchiveSeason()` publicar → archiva y concede los trofeos
 *   `finishSeason()`           terminar → retira los votos y deja listo para la siguiente
 *
 * Publicar y terminar van SEGUIDOS salvo en las ediciones que enseñan los votos (`revealVotes`): ahí las
 * papeletas se quedan entre medias para que quien votó vea lo que votó cada uno.
 *
 * PUBLICAR ES LO QUE HACE VISIBLE la edición: mientras está viva no existe ningún archivo público, así que no hay
 * nada que se pueda filtrar. Todo lo que se escribe aquí lo autoriza `isAdmin()` en las reglas.
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { archivableCategories, categoriesMissingWinner } from '../../../core/premios/archivable';
import { buildScheduleFields } from '../../../core/premios/closingDate';
import { palmaresRecipientsFrom } from '../../../core/premios/palmares';
import { tallyVotes } from '../../../core/premios/popularVote';
import { computeLeaderboard } from '../../../core/premios/scoring';
import { getSeasonId, getSeasonLabel, toSeasonId } from '../../../core/premios/seasonId';
import type {
  PremiosBallot,
  PremiosCategory,
  PremiosReveal,
  PremiosSeasonResult,
  PremiosVotingConfig,
  PremiosWinnersMap,
} from '../../types/premios';
import {
  BALLOTS_COLLECTION,
  BATCH_LIMIT,
  CATEGORIES_COLLECTION,
  CONFIG_COLLECTION,
  CONFIG_VOTING_DOC,
  RESULTS_COLLECTION,
  REVEAL_COLLECTION,
  requireServices,
} from './premiosShared';
import {
  forgetPalmaresRecord,
  grantPalmares,
  revokePalmares,
  savePalmaresRecord,
  type PalmaresRecipient,
} from './premiosPalmaresRepository';
import { clearLegacyWinnerField, clearWinners, fetchWinners } from './premiosWinnersRepository';

async function votingDocRef() {
  const { firestore } = await requireServices();
  return doc(firestore, CONFIG_COLLECTION, CONFIG_VOTING_DOC);
}

/**
 * El calendario de la edición, o `null` si todavía no hay ninguno.
 *
 * Es la ÚNICA lectura de la porra que funciona SIN SESIÓN, y tiene que serlo: con ella se decide si la sección
 * se ofrece siquiera, y eso se decide antes de que nadie inicie sesión. No contiene nada sensible —fechas, el
 * nombre de la edición y el id del último archivo publicado—.
 *
 * Ante un error devuelve `null`, que el resto interpreta como «no hay edición»: un fallo de red no puede dejar
 * la app sin saber qué pintar.
 */
export async function fetchVotingConfig(options?: { throwOnError?: boolean }): Promise<PremiosVotingConfig | null> {
  try {
    const { firestore } = await requireServices();
    const snapshot = await getDoc(doc(firestore, CONFIG_COLLECTION, CONFIG_VOTING_DOC));
    return snapshot.exists() ? (snapshot.data() as PremiosVotingConfig) : null;
  } catch (error) {
    // `throwOnError`: para quien necesita distinguir «no hay edición» de «no se ha podido leer» y tiene algo mejor
    // que hacer con lo segundo (la pantalla de Premios sirve su última copia; docs/plan-degradacion-servicios.md).
    if (options?.throwOnError) throw error;
    return null;
  }
}

/** Una edición archivada por su id. `null` si no existe o si todavía no se ha publicado. */
export async function fetchSeasonResult(seasonId: string): Promise<PremiosSeasonResult | null> {
  if (!seasonId) return null;
  try {
    const { firestore } = await requireServices();
    const snapshot = await getDoc(doc(firestore, RESULTS_COLLECTION, seasonId));
    return snapshot.exists() ? (snapshot.data() as PremiosSeasonResult) : null;
  } catch {
    return null;
  }
}

/**
 * Los votos de cada uno de una edición publicada y sin terminar, o `null`.
 *
 * `null` también cuando las reglas lo deniegan, que es lo normal para quien no votó en esa edición: no es un
 * error que contar, es que ese panel no es para él (ver `firestore.rules`, `premiosReveal`).
 */
export async function fetchSeasonReveal(seasonId: string): Promise<PremiosReveal | null> {
  if (!seasonId) return null;
  try {
    const { firestore } = await requireServices();
    const snapshot = await getDoc(doc(firestore, REVEAL_COLLECTION, seasonId));
    return snapshot.exists() ? (snapshot.data() as PremiosReveal) : null;
  } catch {
    return null;
  }
}

/**
 * Las ediciones archivadas, de la más reciente a la más antigua.
 *
 * Es una lectura de ADMINISTRADOR: lista la colección entera, y las reglas solo dejan leer en abierto los
 * archivos que tienen el sello de cierre. Al público no le hace falta —llega a una edición por su id, que es lo
 * que apunta la configuración— y una consulta que tropiece con un documento prohibido falla entera.
 *
 * Se ordena en el cliente: son unas pocas ediciones al año y pedir orden al servidor exigiría un índice.
 */
export async function listSeasonResults(): Promise<Array<PremiosSeasonResult & { id: string }>> {
  const { firestore } = await requireServices();
  const snapshot = await getDocs(collection(firestore, RESULTS_COLLECTION));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...(d.data() as PremiosSeasonResult) }))
    .sort((a, b) => (b.season || 0) - (a.season || 0) || b.id.localeCompare(a.id));
}

export interface LiveEdition {
  ballots: PremiosBallot[];
  categories: PremiosCategory[];
  ballotDocs: QueryDocumentSnapshot[];
  categoryDocs: QueryDocumentSnapshot[];
}

/**
 * La foto REAL de la edición viva: los votos y las categorías tal y como están ahora mismo en Firestore.
 *
 * EXISTE POR UN FALLO CONCRETO: el panel carga papeletas y categorías una sola vez al montarse, así que una
 * pestaña abierta desde la edición anterior publicaba la clasificación anterior —los mismos votantes, las mismas
 * opciones— por mucho que en Firestore hubiera otra cosa. Publicar es irreversible: tiene que mirar el dato, no
 * la pantalla.
 *
 * Devuelve además los documentos crudos porque la limpieza posterior REUTILIZA estas mismas lecturas: así lo que
 * se archiva y lo que se retira son, por construcción, el mismo conjunto.
 */
export async function readLiveEdition(): Promise<LiveEdition> {
  const { firestore } = await requireServices();
  const [ballotsSnap, categoriesSnap] = await Promise.all([
    getDocs(collection(firestore, BALLOTS_COLLECTION)),
    getDocs(collection(firestore, CATEGORIES_COLLECTION)),
  ]);

  const ballots = ballotsSnap.docs.map((d) => ({ userId: d.id, ...d.data() })) as PremiosBallot[];
  const allCategories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as PremiosCategory[];

  // Para el archivo solo cuentan las categorías votables: un placeholder sin título ni nominados solo añadiría
  // filas vacías al histórico. El criterio es el de `archivable`, compartido con el panel: si el panel exigiera
  // ganador a una categoría que aquí no entra, no habría forma de publicar.
  const categories = archivableCategories(allCategories).sort(
    (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0),
  );

  return { ballots, categories, ballotDocs: ballotsSnap.docs, categoryDocs: categoriesSnap.docs };
}

/** Borra en lotes los documentos que se le pasen. Devuelve cuántos. */
async function discardDocsInBatches(docs: QueryDocumentSnapshot[]): Promise<number> {
  const { firestore } = await requireServices();
  let deleted = 0;
  let batch = writeBatch(firestore);
  let opsInBatch = 0;

  for (const document of docs) {
    batch.delete(document.ref);
    opsInBatch += 1;
    deleted += 1;
    if (opsInBatch === BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(firestore);
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  return deleted;
}

/**
 * Cierre forzado o reapertura manual.
 *
 * OJO CON LA SEMÁNTICA: `isOpen` no abre por sí solo. Manda el calendario, y este campo solo puede cerrar antes
 * de tiempo; ponerlo a `true` fuera de la ventana no habilita el voto, ni aquí ni en las reglas.
 */
export async function setVotingOpen(isOpen: boolean, extra: { season?: number } = {}): Promise<void> {
  await setDoc(
    await votingDocRef(),
    {
      isOpen,
      ...(typeof extra.season === 'number' ? { season: extra.season } : {}),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * ENSEÑA U OCULTA la sección en el resto de la aplicación: el punto de Ajustes y el botón del espacio social.
 *
 * Es una decisión de producto, no un estado derivado, y la toma SOLO el administrador: ni abrir ni publicar la
 * tocan. `null` borra el campo, que cuenta como oculta. Ver `core/premios/visibility`.
 */
export async function setPremiosVisible(visible: boolean | null): Promise<void> {
  const { firestore } = await requireServices();
  await setDoc(
    await votingDocRef(),
    {
      visible: visible === null ? deleteField() : visible,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  void firestore;
}

/**
 * Renombra una edición ya archivada.
 *
 * SOLO el nombre: los ganadores y la clasificación son el resultado histórico y no se pueden recalcular —los
 * votos se borraron al publicarla—, así que tocarlos dejaría el archivo incoherente.
 */
export async function renameSeasonResult(seasonId: string, name: string): Promise<void> {
  const { firestore } = await requireServices();
  await updateDoc(doc(firestore, RESULTS_COLLECTION, String(seasonId)), {
    name: (name || '').trim(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * BORRA una edición archivada. Irreversible y sin red: el archivo es lo ÚNICO que queda de esa edición.
 *
 * Existe para las pruebas: abrir, votar y publicar una edición de prueba deja un archivo permanente, y sin esto
 * el histórico se llena de «Test» que no se pueden quitar desde la aplicación.
 *
 * NO BASTA CON BORRAR EL DOCUMENTO. Si era la última publicada, la configuración seguiría apuntándola y la
 * pantalla pública se quedaría pidiendo un archivo que ya no existe. Se reapunta a la edición más reciente que
 * quede —para que el público vuelva a ver la anterior y no un hueco— y, si no queda ninguna, se deja vacío.
 *
 * Y SE LLEVA POR DELANTE SUS TROFEOS. El trofeo vive en el perfil de cada premiado y enlaza al archivo de la
 * edición: borrar solo el archivo dejaba la medalla puesta en los perfiles apuntando a una edición que ya no
 * existe —un logro por una porra de la que no queda nada y un enlace a ninguna parte—. Se retira de los perfiles
 * y se olvida el registro: borrar del histórico es borrar la edición entera.
 */
export async function deleteSeasonResult(seasonId: string): Promise<{
  seasonId: string;
  lastPublishedId: string;
  wasPublished: boolean;
  revoked: number;
}> {
  const id = String(seasonId);
  const { firestore } = await requireServices();
  const votingDoc = await votingDocRef();

  // LA EDICIÓN CON LOS VOTOS A LA VISTA NO SE BORRA DESDE AQUÍ: quedarían sus papeletas y su resumen colgando de
  // un archivo que ya no existe. Primero se termina.
  const antes = await getDoc(votingDoc);
  const vivo = antes.exists() ? (antes.data() as PremiosVotingConfig) : null;
  if (vivo?.votesRevealedAt && vivo.lastPublishedId === id) {
    throw new Error('Esta edición tiene los votos a la vista: termínala antes de borrarla del histórico.');
  }

  // Antes de borrar el archivo: si esto fallara a mitad, es mejor quedarse con el archivo y sin trofeos —se
  // vuelve a encender el interruptor— que con trofeos colgando de una edición que ya no existe.
  const retirados = await revokePalmares(id).catch(() => [] as PalmaresRecipient[]);
  await forgetPalmaresRecord(id).catch(() => {
    // Un registro huérfano no molesta a nadie: solo lo lee el histórico, y esa edición ya no sale en él.
  });

  await deleteDoc(doc(firestore, RESULTS_COLLECTION, id));

  // La configuración leída al principio vale: borrar el archivo no la toca.
  const wasPublished = vivo?.lastPublishedId === id;
  let lastPublishedId = String(vivo?.lastPublishedId || '');

  if (wasPublished) {
    // Se lee DESPUÉS del borrado, así que la edición que se va no puede salir elegida. Más reciente = temporada
    // mayor; a igualdad, el id ordena de forma estable (puede haber varias ediciones el mismo año).
    const remaining = await getDocs(collection(firestore, RESULTS_COLLECTION));
    const candidates = remaining.docs
      .map((d) => ({ id: d.id, season: Number(d.data()?.season || 0) }))
      .sort((a, b) => b.season - a.season || b.id.localeCompare(a.id));
    lastPublishedId = candidates[0]?.id || '';

    await setDoc(votingDoc, { lastPublishedId, updatedAt: new Date().toISOString() }, { merge: true });
  }

  return { seasonId: id, lastPublishedId, wasPublished, revoked: retirados.length };
}

export interface OpenSeasonParams {
  name?: string;
  closesDay: string;
  season?: number;
  /** Ponerla a la vista en la misma escritura. Lo decide el administrador en el diálogo de abrir. */
  makeVisible?: boolean;
}

/**
 * Abre una edición nueva y la deja lista para votar.
 *
 * UNA SOLA FECHA, guardada en los dos formatos que viajan siempre juntos (ver `closingDate`). Se limpian los
 * campos de apertura y de resultados: ya no se piden, y heredarlos de una edición anterior dejaría la nueva
 * programada para un día pasado o publicándose sola.
 *
 * LA MESA SE LIMPIA ANTES DE EMPEZAR. Solo se abre cuando no hay edición en marcha, así que cualquier papeleta
 * que siga ahí es un resto de la anterior —una publicación a medias, una prueba hecha a mano— y contaminaría la
 * nueva: entraría tal cual en el siguiente archivo, y además su dueño no podría votar por el bloqueo de re-voto.
 *
 * NO TOCA DÓNDE SE VE, salvo que se pida (`makeVisible`). Antes la ponía a la vista siempre, y enseñarla dejó de
 * ser automático el 29-09-2026: lo decide el administrador. Para que no arranque escondida sin querer, el panel
 * avisa al abrir si está oculta y ofrece encenderla ahí mismo (ver `AdminPremios`).
 */
export async function openSeason({ name, closesDay, season, makeVisible = false }: OpenSeasonParams): Promise<{
  seasonId: string;
  name: string;
  closesAt: string;
  leftovers: number;
}> {
  const year = typeof season === 'number' ? season : new Date().getFullYear();
  const nombre = (name || '').trim();
  const id = toSeasonId(nombre) || String(year);

  const { closesAt, closesAtMillis } = buildScheduleFields({ closesDay });
  if (closesAtMillis === null || closesAt === null) {
    throw new Error('La edición necesita una fecha de cierre');
  }

  const { firestore } = await requireServices();

  const leftoverBallots = await getDocs(collection(firestore, BALLOTS_COLLECTION));
  const leftovers = await discardDocsInBatches(leftoverBallots.docs);
  if (leftovers > 0) {
    // Los ganadores marcados también sobran: una edición empieza sin ninguno.
    await clearWinners();
  }
  // Y LOS VOTOS A LA VISTA de una edición que no se terminó del todo: los leería quien vote en esta, porque el
  // permiso es «tener papeleta», no «tenerla en esa edición».
  await discardDocsInBatches((await getDocs(collection(firestore, REVEAL_COLLECTION))).docs);

  await setDoc(
    await votingDocRef(),
    {
      isOpen: true,
      ...(makeVisible ? { visible: true } : {}),
      season: year,
      seasonId: id,
      seasonName: nombre,
      closesAt,
      closesAtMillis,
      opensAt: null,
      opensAtMillis: null,
      resultsAt: null,
      resultsAtMillis: null,
      // Las ediciones abiertas desde que existe enseñan los votos al publicarse: el texto legal lo dice desde
      // entonces, y quien vote en ella lo hace sabiéndolo.
      revealVotes: true,
      votesRevealedAt: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { seasonId: id, name: nombre, closesAt, leftovers };
}

/**
 * Corrige la edición EN MARCHA: su nombre y su día de cierre.
 *
 * Es lo que faltaba para no tener que cerrar y volver a abrir por una errata en el nombre o por un día mal
 * puesto — y cerrar y reabrir no es equivalente: `openSeason` RETIRA las papeletas, así que arreglar una errata
 * costaba los votos ya emitidos.
 *
 * NO TOCA EL IDENTIFICADOR. El `seasonId` sale del nombre y es la clave con la que se archivará la edición; si
 * cambiara a mitad de votación, lo publicado no casaría con lo que se está votando. El nombre visible sí cambia,
 * que es lo que se lee en la portada y lo que se quería corregir.
 *
 * Adelantar el día de cierre a uno ya pasado NO se permite: eso es cerrar la votación, y para eso está su botón,
 * que además deja el ciclo en su sitio.
 */
export async function updateLiveSeason({ name, closesDay }: { name: string; closesDay: string }): Promise<{
  name: string;
  closesAt: string;
}> {
  const nombre = (name || '').trim();
  const { closesAt, closesAtMillis } = buildScheduleFields({ closesDay });
  if (closesAtMillis === null || closesAt === null) {
    throw new Error('La edición necesita una fecha de cierre');
  }

  await setDoc(
    await votingDocRef(),
    {
      ...(nombre ? { seasonName: nombre } : {}),
      closesAt,
      closesAtMillis,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { name: nombre, closesAt };
}

/**
 * Adelanta el cierre. No borra la fecha: la edición sigue existiendo y pasa a «pendiente de publicar».
 */
export async function closeSeasonNow(): Promise<void> {
  await setVotingOpen(false);
}

export interface BuildSnapshotParams {
  season: number;
  categories: PremiosCategory[];
  ballots: PremiosBallot[];
  winners: PremiosWinnersMap;
  seasonId?: string;
  seasonName?: string;
}

/**
 * El archivo de una edición: ganadores, foto de las categorías —para poder enseñar los nombres aunque después se
 * editen— y la clasificación con los puntos de cada participante.
 *
 * Vive aquí y no en quien llama porque lo escriben dos caminos distintos; si divergieran, el histórico y la
 * pantalla pública enseñarían cosas diferentes.
 *
 * ES EL ÚNICO CANAL PÚBLICO de los ganadores y de la clasificación, y eso decide lo que NO lleva:
 *
 *  - **Ni un `userId`.** En su lugar va el `profileId`, el pseudónimo público que ya usa el resto de la app:
 *    basta para decir «esta fila eres tú» y para enlazar un perfil, sin publicar el identificador real de nadie.
 *  - **Ni una foto.** Se valoró denormalizarla y se descartó (20-09-2026): el archivo es público y permanente,
 *    así que congelar ahí la URL de la foto de cada participante dejaría datos personales en un documento abierto
 *    —y quitar la foto de la cuenta ya no la retiraría—. La cara se resuelve al PINTAR, con la reciprocidad del
 *    hub, que es dinámica; sin sesión se ven iniciales.
 *
 * Y LLEVA EL VOTO POPULAR: cuántos votos tuvo cada nominado, sin decir de quién (ver `core/premios/popularVote`).
 * Tiene que salir de aquí porque es la última vez que existen las papeletas.
 */
export function buildSeasonSnapshot({
  season,
  categories,
  ballots,
  winners,
  seasonId,
  seasonName,
}: BuildSnapshotParams): PremiosSeasonResult {
  const resolvedWinners: PremiosWinnersMap = {};
  const categoriesSnapshot = (categories || []).map((cat) => {
    // El mapa manda; el campo de la categoría solo actúa de respaldo para datos todavía sin migrar.
    const winner = winners?.[cat.id] || cat.winner || null;
    if (winner) resolvedWinners[cat.id] = winner;
    return {
      id: cat.id,
      title: cat.title,
      winner,
      weight: cat.weight || 1,
      options: cat.options || [],
    };
  });

  const id = getSeasonId({ seasonId, season });

  const leaderboard = computeLeaderboard(ballots || [], categories || [], resolvedWinners).map(
    ({ userId, ...entry }) => {
      void userId; // fuera del documento publicado, a propósito
      return entry;
    },
  );

  return {
    season,
    seasonId: id,
    name: getSeasonLabel({ name: seasonName, season }),
    winners: resolvedWinners,
    categoriesSnapshot,
    leaderboard,
    totalBallots: (ballots || []).length,
    votes: tallyVotes(ballots || [], categories || []),
  };
}

/**
 * LOS VOTOS DE CADA UNO: la clasificación del archivo, fila a fila, con lo que eligió cada cual.
 *
 * SALE DEL MISMO RECUENTO que el archivo (`computeLeaderboard`), así que puestos, empates y puntos coinciden por
 * construcción. Lo que no lleva es lo mismo que el archivo no lleva: ni uid ni nombre de la cuenta de Google. Las
 * elecciones se recortan a las categorías archivadas: las demás no se pueden pintar, porque su nombre y sus
 * nominados no están en el archivo.
 */
export function buildRevealSnapshot({
  seasonId,
  categories,
  ballots,
  winners,
}: {
  seasonId: string;
  categories: PremiosCategory[];
  ballots: PremiosBallot[];
  winners: PremiosWinnersMap;
}): PremiosReveal {
  const archivadas = new Set((categories || []).map((category) => category.id));
  const porCuenta = new Map((ballots || []).map((ballot) => [ballot.userId, ballot.selections || {}]));

  return {
    seasonId,
    ballots: computeLeaderboard(ballots || [], categories || [], winners).map(({ userId, ...entry }) => ({
      ...entry,
      selections: Object.fromEntries(
        Object.entries(porCuenta.get(userId) || {}).filter(([categoryId]) => archivadas.has(categoryId)),
      ),
    })),
  };
}

/**
 * PUBLICA la edición: la archiva y concede los trofeos. En orden:
 *
 * 0. **Lee de Firestore** las papeletas y las categorías. No las recibe de quien llama, por el fallo que explica
 *    `readLiveEdition`. Lo que se archiva y lo que se limpia salen de la MISMA lectura.
 * 1. Calcula ganadores y clasificación.
 * 2. Escribe el archivo con su `closedAt`: publicar es archivar.
 *
 * Y después, según la edición:
 *
 * - **Enseña los votos** (`revealVotes`): escribe el resumen de votos y marca la edición como publicada sin
 *   terminar. Las papeletas se quedan; las retira `finishSeason` cuando el administrador lo decida.
 * - **No los enseña** (las abiertas antes de existir esto): se termina en el acto, como siempre.
 */
export async function publishAndArchiveSeason({
  season,
  winners,
  seasonId,
  seasonName,
}: {
  season: number;
  winners?: PremiosWinnersMap;
  seasonId?: string;
  seasonName?: string;
}): Promise<{
  seasonId: string;
  name: string;
  totalBallots: number;
  deleted: number;
  cleared: number;
  awarded: number;
}> {
  const { firestore } = await requireServices();

  // 0. La foto real de la edición, recién leída.
  const { ballots, categories, ballotDocs, categoryDocs } = await readLiveEdition();
  const configSnap = await getDoc(await votingDocRef());
  const muestraVotos = configSnap.exists() && (configSnap.data() as PremiosVotingConfig)?.revealVotes === true;

  // 1 y 2. Construir y guardar el archivo.
  const resolved = winners || (await fetchWinners(categories));

  // 1bis. SIN TODOS LOS GANADORES NO SE PUBLICA, y se comprueba AQUÍ además de en el panel: el botón mira la
  //       foto que cargó la pantalla, y esta comprobación mira el dato —el mismo motivo por el que existe
  //       `readLiveEdition`—. Cubre la pestaña abierta desde ayer y al segundo administrador que acaba de
  //       cambiar los nominados. Una categoría sin ganador archiva sus votos sin puntos, y al publicar se
  //       retiran las papeletas: después ya no hay con qué rehacer la clasificación.
  const sinGanador = categoriesMissingWinner(categories, resolved);
  if (sinGanador.length > 0) {
    throw new Error(
      `No se puede publicar: ${sinGanador.length} categoría(s) con nominados y sin ganador marcado.`,
    );
  }

  const snapshot = buildSeasonSnapshot({ season, categories, ballots, winners: resolved, seasonId, seasonName });

  await setDoc(doc(firestore, RESULTS_COLLECTION, snapshot.seasonId), {
    ...snapshot,
    closedAt: serverTimestamp(),
  });

  // 2bis. CONCEDER LOS TROFEOS, y antes de retirar las papeletas: el uid de cada premiado sale de ellas, y el
  //       archivo publicado ya no lo lleva (no puede: es público).
  //
  //       LA CUENTA ES LA CLAVE, no el nombre: `userId` es el uid con el que se votó, así que quien cambie de
  //       nick después —o lo cambiara entre votar y publicar— recibe su trofeo igual, en su perfil de siempre.
  //
  //       Y QUIEN NO ENTRA EN LOS CINCO PRIMEROS SE LLEVA EL DE PARTICIPAR. Una entrada por persona y edición: la
  //       del puesto ya dice que participó, así que no se le suma otra.
  const premiados: PalmaresRecipient[] = palmaresRecipientsFrom(computeLeaderboard(ballots, categories, resolved));
  const awarded = await grantPalmares(premiados, snapshot.seasonId, snapshot.name, season);

  //       Y SE APUNTA A QUIÉN SE LE DIO, en la colección que solo lee el administrador. Es lo que hace
  //       reversible el trofeo desde el histórico: aquí se retiran las papeletas, así que después de esta línea
  //       ya no queda ningún otro sitio donde figure el uid de los premiados.
  await savePalmaresRecord(snapshot.seasonId, true, premiados).catch(() => {
    // Mismo criterio que los trofeos: la edición ya está archivada y esto no puede tumbar la publicación.
  });

  if (muestraVotos) {
    // 3. Los votos de cada uno, en un documento que solo leen quienes votaron (ver `firestore.rules`).
    await setDoc(
      doc(firestore, REVEAL_COLLECTION, snapshot.seasonId),
      buildRevealSnapshot({ seasonId: snapshot.seasonId, categories, ballots, winners: resolved }),
    );

    // 4. Publicada y sin terminar. La fecha de cierre SE QUEDA: es lo que dice que la edición sigue en marcha.
    //    `votesRevealedAt` es lo que la distingue de «cerrada sin publicar», y además cierra el voto en las
    //    reglas aunque alguien reabriera el interruptor. `lastPublishedId` ya apunta al archivo: los
    //    resultados que se ofrecen son los de esta edición.
    await setDoc(
      await votingDocRef(),
      {
        isOpen: false,
        votesRevealedAt: new Date().toISOString(),
        lastPublishedId: snapshot.seasonId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return { seasonId: snapshot.seasonId, name: snapshot.name, totalBallots: snapshot.totalBallots, deleted: 0, cleared: 0, awarded };
  }

  const { deleted, cleared } = await retireEdition({
    ballotDocs,
    categoryDocs,
    categories,
    season,
    lastPublishedId: snapshot.seasonId,
  });

  return {
    seasonId: snapshot.seasonId,
    name: snapshot.name,
    totalBallots: snapshot.totalBallots,
    deleted,
    cleared,
    awarded,
  };
}

/**
 * TERMINA una edición publicada con los votos a la vista: retira las papeletas y el resumen y deja el panel
 * listo para la siguiente. Es el paso destructivo.
 *
 * LEE DE NUEVO lo que hay en Firestore, por el mismo motivo que publicar (`readLiveEdition`): entre publicar y
 * terminar pueden pasar días y el panel puede llevar todo ese tiempo abierto.
 */
export async function finishSeason(): Promise<{ seasonId: string; deleted: number; cleared: number }> {
  const configSnap = await getDoc(await votingDocRef());
  const config = configSnap.exists() ? (configSnap.data() as PremiosVotingConfig) : null;
  if (!config?.votesRevealedAt) {
    throw new Error('No hay ninguna edición publicada pendiente de terminar.');
  }

  const { categories, ballotDocs, categoryDocs } = await readLiveEdition();
  const lastPublishedId = String(config.lastPublishedId || '');
  const { deleted, cleared } = await retireEdition({
    ballotDocs,
    categoryDocs,
    categories,
    season: Number(config.season) || new Date().getFullYear(),
    lastPublishedId,
  });

  return { seasonId: lastPublishedId, deleted, cleared };
}

/**
 * LO QUE CIERRA EL CICLO, sea al publicar o al terminar. En orden:
 *
 * 1. Retira las papeletas en lotes. Hace falta para poder abrir otra edición —el bloqueo de re-voto va por
 *    cuenta—, y el detalle por persona no se conserva: en el archivo quedan la clasificación y los ganadores.
 *    Con ellas se va el resumen de votos, si lo había: sin papeletas ya no lo podría leer nadie.
 * 2. Vacía los nominados de cada categoría SIN borrar los documentos: las categorías se mantienen año a año y
 *    solo cambian sus nominados, que ya quedaron archivados.
 * 3. Deja la configuración sin edición —sin fecha de cierre, que es lo que distingue «hay edición» de «no la
 *    hay»— y apunta el archivo publicado para que el público lo encuentre con una sola lectura.
 */
async function retireEdition({
  ballotDocs,
  categoryDocs,
  categories,
  season,
  lastPublishedId,
}: {
  ballotDocs: QueryDocumentSnapshot[];
  categoryDocs: QueryDocumentSnapshot[];
  categories: PremiosCategory[];
  season: number;
  lastPublishedId: string;
}): Promise<{ deleted: number; cleared: number }> {
  const { firestore } = await requireServices();

  // 1. Retirar exactamente las papeletas que entraron en el archivo, y el resumen de votos.
  const deleted = await discardDocsInBatches(ballotDocs);
  await discardDocsInBatches((await getDocs(collection(firestore, REVEAL_COLLECTION))).docs);

  // 2. Vaciar los nominados conservando cada documento. Se recorren TODAS las categorías (también las inválidas,
  //    que no entran en el archivo) para que ninguna se quede con nominados del año anterior.
  await clearWinners();
  await clearLegacyWinnerField(categories);

  let cleared = 0;
  let batch = writeBatch(firestore);
  let opsInBatch = 0;
  const updatedAt = new Date().toISOString();

  for (const catDoc of categoryDocs) {
    batch.update(catDoc.ref, { options: [], optionIds: [], updatedAt });
    opsInBatch += 1;
    cleared += 1;
    if (opsInBatch === BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(firestore);
      opsInBatch = 0;
    }
  }
  if (opsInBatch > 0) await batch.commit();

  // 3. Cerrar el ciclo. DÓNDE SE VE NO SE TOCA: lo decide el administrador con su interruptor, y publicar la
  //    deja como estaba (ver `core/premios/visibility`).
  await setDoc(
    await votingDocRef(),
    {
      isOpen: false,
      season: season + 1,
      seasonId: '',
      seasonName: '',
      closesAt: null,
      closesAtMillis: null,
      opensAt: null,
      opensAtMillis: null,
      resultsAt: null,
      resultsAtMillis: null,
      revealVotes: false,
      votesRevealedAt: null,
      lastPublishedId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { deleted, cleared };
}
