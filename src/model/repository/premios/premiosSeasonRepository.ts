/**
 * El ciclo de vida de una edición. Tres pasos y una función para cada uno:
 *
 *   `openSeason()`             abrir    → nombre y fecha de cierre, y a votar
 *   `closeSeasonNow()`         cerrar   → adelanta el cierre (la fecha lo haría sola)
 *   `publishAndArchiveSeason()` publicar → archiva, retira los votos y deja listo para la siguiente
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
import { buildScheduleFields } from '../../../core/premios/closingDate';
import { hasTitle } from '../../../core/premios/localize';
import { hasAward } from '../../../core/premios/awards';
import { computeLeaderboard } from '../../../core/premios/scoring';
import { getSeasonId, getSeasonLabel, toSeasonId } from '../../../core/premios/seasonId';
import type {
  PalmaresEntry,
  PremiosBallot,
  PremiosCategory,
  PremiosSeasonResult,
  PremiosVotingConfig,
  PremiosWinnersMap,
} from '../../types/premios';
import {
  BALLOTS_COLLECTION,
  CATEGORIES_COLLECTION,
  CONFIG_COLLECTION,
  CONFIG_VOTING_DOC,
  RESULTS_COLLECTION,
  requireServices,
} from './premiosShared';
import { clearLegacyWinnerField, clearWinners, fetchWinners } from './premiosWinnersRepository';

/** Tope de operaciones por lote que admite Firestore. */
const BATCH_LIMIT = 500;

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
export async function fetchVotingConfig(): Promise<PremiosVotingConfig | null> {
  try {
    const { firestore } = await requireServices();
    const snapshot = await getDoc(doc(firestore, CONFIG_COLLECTION, CONFIG_VOTING_DOC));
    return snapshot.exists() ? (snapshot.data() as PremiosVotingConfig) : null;
  } catch {
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
  const allCategories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
    PremiosCategory & { isPlaceholder?: boolean }
  >;

  // Para el archivo solo cuentan las categorías votables: un placeholder sin título ni nominados solo añadiría
  // filas vacías al histórico.
  const categories = allCategories
    .filter((cat) => !cat.isPlaceholder && hasTitle(cat) && (cat.options?.length || 0) > 0)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

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
 * Es una decisión de producto, no un estado derivado: `null` devuelve el mando al calendario —a la vista mientras
 * haya votación o resultados recientes—, y `true`/`false` lo fuerzan. Ver `core/premios/visibility`.
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
 */
export async function deleteSeasonResult(seasonId: string): Promise<{
  seasonId: string;
  lastPublishedId: string;
  wasPublished: boolean;
}> {
  const id = String(seasonId);
  const { firestore } = await requireServices();
  const votingDoc = await votingDocRef();

  await deleteDoc(doc(firestore, RESULTS_COLLECTION, id));

  const configSnap = await getDoc(votingDoc);
  const wasPublished = configSnap.exists() && configSnap.data()?.lastPublishedId === id;
  let lastPublishedId = configSnap.exists() ? String(configSnap.data()?.lastPublishedId || '') : '';

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

  return { seasonId: id, lastPublishedId, wasPublished };
}

export interface OpenSeasonParams {
  name?: string;
  closesDay: string;
  season?: number;
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
 */
export async function openSeason({ name, closesDay, season }: OpenSeasonParams): Promise<{
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

  await setDoc(
    await votingDocRef(),
    {
      isOpen: true,
      season: year,
      seasonId: id,
      seasonName: nombre,
      closesAt,
      closesAtMillis,
      opensAt: null,
      opensAtMillis: null,
      resultsAt: null,
      resultsAtMillis: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return { seasonId: id, name: nombre, closesAt, leftovers };
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
  };
}

/**
 * CONCEDE el trofeo a los cinco primeros PUESTOS de una edición recién publicada.
 *
 * Puestos y no posiciones: los empatados comparten puesto, así que puede haber más de cinco premiados y nunca
 * más de cinco trofeos distintos (ver `assignDenseRanks`).
 *
 * SE ESCRIBE EN EL PERFIL DE CADA UNO, que es donde se enseña — el trofeo es un logro especial de su perfil, no
 * un adorno de la pantalla de resultados. Solo puede hacerlo el administrador: la regla
 * `profilePalmaresNotSelfAssigned` impide que nadie se lo ponga a sí mismo.
 *
 * ES IDEMPOTENTE: se lee el palmarés que ya hubiera y se sustituye la entrada de ESTA edición, así que volver a
 * publicar —o republicar tras corregir algo— no duplica trofeos.
 *
 * NO LANZA: si un perfil no se deja escribir (no existe porque esa cuenta se borró, o las reglas cambian), el
 * resto de trofeos se concede igual. La edición ya está archivada; quedarse sin un trofeo es un incordio, perder
 * la publicación por eso sería mucho peor.
 */
async function grantPalmares(
  ganadores: Array<{ uid: string; rank: number }>,
  seasonId: string,
  seasonName: string,
): Promise<number> {
  const { firestore } = await requireServices();
  const awardedAt = Date.now();
  let concedidos = 0;

  for (const { uid, rank } of ganadores) {
    try {
      const ref = doc(firestore, 'profiles', uid);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) continue;

      const previo = (snapshot.data()?.palmares || []) as PalmaresEntry[];
      const sinEsta = Array.isArray(previo) ? previo.filter((entry) => entry?.seasonId !== seasonId) : [];
      const palmares = [...sinEsta, { seasonId, seasonName, rank, awardedAt }];

      await setDoc(ref, { palmares, updatedAt: awardedAt }, { merge: true });
      concedidos += 1;
    } catch {
      // Un trofeo que no se pudo conceder no puede tumbar la publicación.
    }
  }

  return concedidos;
}

/**
 * PUBLICA la edición: la archiva, la hace visible y deja el panel listo para la siguiente. Es el último paso y el
 * único destructivo. En orden:
 *
 * 0. **Lee de Firestore** las papeletas y las categorías. No las recibe de quien llama, por el fallo que explica
 *    `readLiveEdition`. Lo que se archiva y lo que se limpia salen de la MISMA lectura.
 * 1. Calcula ganadores y clasificación.
 * 2. Escribe el archivo con su `closedAt`: publicar es archivar.
 * 3. Retira todas las papeletas en lotes. Hace falta para poder abrir otra edición —el bloqueo de re-voto va por
 *    cuenta—, y el detalle por persona no se conserva: en el archivo quedan la clasificación y los ganadores.
 * 4. Vacía los nominados de cada categoría SIN borrar los documentos: las categorías se mantienen año a año y
 *    solo cambian sus nominados, que ya quedaron archivados.
 * 5. Deja la configuración sin edición —sin fecha de cierre, que es lo que distingue «hay edición» de «no la
 *    hay»— y apunta el archivo publicado para que el público lo encuentre con una sola lectura.
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

  // 1 y 2. Construir y guardar el archivo.
  const resolved = winners || (await fetchWinners(categories));
  const snapshot = buildSeasonSnapshot({ season, categories, ballots, winners: resolved, seasonId, seasonName });

  await setDoc(doc(firestore, RESULTS_COLLECTION, snapshot.seasonId), {
    ...snapshot,
    closedAt: serverTimestamp(),
  });

  // 2bis. CONCEDER LOS TROFEOS, y antes de retirar las papeletas: el uid de cada premiado sale de ellas, y el
  //       archivo publicado ya no lo lleva (no puede: es público).
  const premiados = computeLeaderboard(ballots, categories, resolved)
    .filter((entry) => hasAward(entry.rank) && entry.userId)
    .map((entry) => ({ uid: entry.userId, rank: entry.rank }));
  const awarded = await grantPalmares(premiados, snapshot.seasonId, snapshot.name);

  // 3. Retirar exactamente las papeletas que acaban de entrar en el archivo.
  const deleted = await discardDocsInBatches(ballotDocs);

  // 4. Vaciar los nominados conservando cada documento. Se recorren TODAS las categorías (también las inválidas,
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

  // 5. Cerrar el ciclo.
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
      lastPublishedId: snapshot.seasonId,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return {
    seasonId: snapshot.seasonId,
    name: snapshot.name,
    totalBallots: snapshot.totalBallots,
    deleted,
    cleared,
    awarded,
  };
}
