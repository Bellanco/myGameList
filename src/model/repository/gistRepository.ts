// Canal de JUEGOS en gist: formato v4 (envoltorio + diccionarios), compresión, chunking/overflow y la E/S
// contra GitHub. El canal SOCIAL vive en `socialGistRepository`; lo común a ambos, en `githubGistApi`.
import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { migrateData } from './migrateRepository';
import { assembleChunkedGames, gamesGistNeedsRewrite, gamesGistNeedsUpgradeToWrapper, unwrapGamesFile } from '../migration/legacyGamesFormat';
import type { TabData } from '../types/game';
import type { GamesChunkFile, GamesMainFile } from '../types/gist';
import { githubFetch } from './githubHttp';
import { GIST_API_BASE, buildGithubError, getGithubAuthHeader } from './githubGistApi';
export { NetworkDeferredError, isDeferredNetworkError, getRetryAfterMs } from './githubHttp';
// M1: transforms puros y config de sync extraídos a módulos dedicados. Importamos de vuelta los que se usan
// internamente y RE-EXPORTAMOS la API pública para no obligar a los consumidores a cambiar sus imports.
import {
  assertGistSizeWithinLimit,
  buildGamesFiles,
  chunkFileChecksum,
  gamesChunkFilename,
  leanTabData,
} from './socialProjection';
import { mapWithConcurrency } from '../../core/utils/concurrency';
import { decodeGistContent, encodeCompressed } from '../../core/utils/gistCompression';

export {
  assertGistSizeWithinLimit,
  buildGamesFiles,
  buildGamesMainFile,
  distributeIntoChunks,
  gamesChunkFilename,
  leanTabData,
} from './socialProjection';
export { getSyncConfig, saveSyncConfig, clearSyncConfig, ensureSyncConfigLoaded } from './gistConfigRepository';

const GIST_FILENAME = 'myGames.json';

/**
 * ┌─ CORTE DE FORMATO DEL GIST DE JUEGOS (schemaVersion 4) — LEER ANTES DE ACTIVAR ─────────────────────┐
 * Con `true`, la ESCRITURA emite el envoltorio `GamesMainFile` v4: mapa por id (no `c/v/e/p`) +
 * DICCIONARIOS de categorías deduplicadas (genres/platforms/strengths/weaknesses/reasons) + ancla padre
 * con `chunkIndex` y chunks hijos de overflow. La LECTURA ya es retrocompatible en ESTA versión
 * (`unwrapGamesFile`/`assembleChunkedGames` leen plano, keyed-v3 y keyed-v4) y el auto-upgrade reescribe
 * lo viejo a v4 (`gamesGistNeedsUpgradeToWrapper`).
 *
 * ⚠️ ACTIVAR EN 2 PASOS (NO poner `true` de golpe):
 *   1) Desplegar ESTA versión a TODOS tus dispositivos. Con el flag en `false` ya ganan la LECTURA v4
 *      (siguen escribiendo plano) → nadie se rompe.
 *   2) Solo cuando TODOS estén al día, poner esto en `true` + commit + push. En la siguiente sync el gist
 *      pasa a v4 y se deduplican las categorías.
 * Una versión ANTERIOR a esta leería los índices del diccionario como números (datos corruptos). Es
 * REVERSIBLE (volver a `false` → se rebaja a plano). Verificado: round-trip exacto sobre datos reales, 4% menor.
 * └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
// Exportado para que los tests del formato v4 (gistWrite / gistV4Cutover) se salten solos cuando la
// escritura v4 está apagada: documentan el comportamiento del cutover, no el plano de lanzamiento.
export const ENABLE_GAMES_WRAPPER_WRITE = true;

/**
 * Compresión del gist de JUEGOS (gzip + base64 en un sobre versionado `{enc:'gzip+b64', payload}`). Con `true`, la
 * ESCRITURA comprime el JSON v4 antes del PATCH (~70-75% menos, aleja el muro de 950 KB). La LECTURA ya sabe
 * descomprimir en ESTA versión (`decodeGistContent`, retrocompatible con contenido plano) → activar en 2 pasos como
 * el envoltorio v4: (1) desplegar con lectura activa y este flag en `false`; (2) cuando TODOS los dispositivos estén
 * al día, poner `true`. Un cliente sin la lectura vería el `{enc:...}` como no-legible. Implica v4 (comprime el v4).
 * CUTOVER HECHO (ON): la ESCRITURA comprime; gists en plano se auto-reescriben comprimidos. Reversible a `false`.
 * Ver .github/prompts/migration/GIST-COMPRESSION-PLAN.md.
 */
export const ENABLE_GAMES_COMPRESSION = true;

// La compresión comprime el JSON v4, así que requiere el envoltorio activo. Si el wrapper está OFF, no se comprime
// (evita comprimir TabData plano, que dispararía un auto-upgrade en bucle: plano→comprimido→sigue "no-v4").
const COMPRESS_GAMES_WRITES = ENABLE_GAMES_COMPRESSION && ENABLE_GAMES_WRAPPER_WRITE;


/**
 * Fase B — Gists de OVERFLOW del gist de juegos. Cuando un único gist se queda sin sitio (presupuesto de chunks),
 * los chunks excedentes se reparten en gists ADICIONALES y el `chunkIndex` del ancla guarda su `gistId` (≠ null) —
 * el ancla es el manifiesto autodescriptivo, así que cualquier dispositivo que lea el gist principal sabe qué gists
 * extra debe traer (no hace falta Firestore para leer).
 *
 * La LECTURA de overflow va ACTIVA y es retrocompatible (no-op si ningún chunk tiene `gistId`). La ESCRITURA va
 * GATED igual que A3: activar en 2 pasos — (1) desplegar con la lectura activa y este flag en `false`; (2) cuando
 * TODOS los dispositivos estén al día, poner `true`. Un cliente sin la lectura de overflow vería los chunks
 * externos como "ausentes": por eso la lectura LANZA (no devuelve parcial) y la escritura espera al paso 1.
 */
export const ENABLE_GAMES_OVERFLOW_GISTS = false;
// Nº máximo de ficheros chunk de overflow por gist (el ancla cuenta aparte). Al superarse, se usa otro gist.
const MAX_OVERFLOW_CHUNKS_PER_GIST = 4;
// Fan-out de lectura de gists de overflow (reutiliza el limitador de C3 para no disparar ráfagas a GitHub).
const OVERFLOW_GIST_READ_CONCURRENCY = 4;
// Upgrade proactivo del gist de JUEGOS: gistIds cuyo FORMATO ya hemos inspeccionado a fondo en ESTA sesión.
// Un 304 confirma que nuestro etag coincide, pero NO trae contenido → no se puede evaluar `wasLegacy`. Para un
// dispositivo ya conectado con un gist viejo, su etag siempre coincide y el upgrade no se dispararía nunca.
// Igual que `readSocialGist` (que aprovecha la caché de sesión), hacemos UNA lectura completa por sesión ante el
// primer 304 para evaluar el formato; tras verla, confiamos en el 304 (barato). Se reinicia al recargar la página.
const gamesGistFormatVerifiedThisSession = new Set<string>();






export interface GistReadResponse {
  notModified?: boolean;
  data?: TabData;
  etag?: string | null;
  /** Upgrade proactivo: el remoto estaba en formato viejo; el ciclo de sync debe reescribirlo en el actual. */
  wasLegacy?: boolean;
}



export async function whoAmI(token: string): Promise<{ login: string }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await githubFetch('https://api.github.com/user', {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Auth failed');
  }

  return (await response.json()) as { login: string };
}

export async function createGist(token: string): Promise<{ gistId: string; etag: string | null }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await githubFetch(GIST_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: 'Mi Lista de Juegos - Sincronización',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() }),
        },
      },
    }),
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Create failed');
  }

  const body = (await response.json()) as { id: string };
  return { gistId: body.id, etag: response.headers.get('etag') };
}

/**
 * Autodescubre el gist de JUEGOS del usuario listando sus gists (scope `gist`) y buscando el que contiene
 * `myGames.json`. Se usa tras el login OAuth: con el token pero sin gistId, evita crear un gist nuevo que
 * partiría los datos de un usuario que ya tenía uno. Devuelve '' si no encuentra ninguno (→ primera conexión).
 */
export async function findGamesGistId(token: string): Promise<string> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  // 100 por página cubre de sobra el caso real (un usuario tiene pocos gists). No paginamos para mantenerlo simple.
  const response = await githubFetch(`${GIST_API_BASE}?per_page=100`, {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'List gists failed');
  }

  const gists = (await response.json()) as Array<{ id: string; files?: Record<string, unknown> }>;
  const match = gists.find((gist) => gist.files && Object.prototype.hasOwnProperty.call(gist.files, GIST_FILENAME));
  return match?.id ?? '';
}


/**
 * Construye la respuesta de lectura del gist de juegos a partir del cuerpo de GitHub: parsea el fichero principal,
 * ensambla los chunks de overflow (E4), migra al formato actual y calcula `wasLegacy` (upgrade proactivo).
 * Lanza si el fichero falta o el JSON es inválido (mismas garantías anti-pérdida que el camino directo).
 */
/**
 * Fase B (lectura): si el ancla `chunkIndex` referencia chunks que viven en OTROS gists (`gistId` ≠ null), trae
 * esos gists (con concurrencia limitada) y fusiona sus juegos en el ancla. Anti-pérdida ESTRICTO: si un gist de
 * overflow no es accesible o le falta un chunk referenciado, LANZA (lectura incompleta) en vez de devolver datos
 * parciales — así el ciclo de sync trata el error como tal (backoff) y NUNCA reescribe dejando fuera esos juegos.
 * No-op (sin red) cuando ningún chunk tiene `gistId` → los usuarios de un único gist no pagan nada.
 */
async function mergeOverflowGistChunks(anchor: unknown, token: string | null): Promise<unknown> {
  if (!anchor || typeof anchor !== 'object') return anchor;
  const a = anchor as {
    games?: Record<string, unknown>;
    chunkIndex?: { chunks?: Array<{ chunkId?: string; gistId?: string | null }> };
  };
  const overflow = (a.chunkIndex?.chunks || []).filter((c) => c && c.chunkId && c.chunkId !== 'main' && c.gistId);
  if (overflow.length === 0) return anchor;

  const chunkIdsByGist = new Map<string, string[]>();
  for (const c of overflow) {
    const id = String(c.gistId);
    if (!chunkIdsByGist.has(id)) chunkIdsByGist.set(id, []);
    chunkIdsByGist.get(id)!.push(String(c.chunkId));
  }

  const gistIds = [...chunkIdsByGist.keys()];
  const fetched = await mapWithConcurrency(gistIds, OVERFLOW_GIST_READ_CONCURRENCY, async (overflowGistId) => {
    const headers: Record<string, string> = { 'X-GitHub-Api-Version': '2022-11-28' };
    if (token && isValidGithubToken(token)) headers['Authorization'] = getGithubAuthHeader(token);
    const resp = await githubFetch(`${GIST_API_BASE}/${overflowGistId}`, { headers });
    if (!resp.ok) {
      throw new Error(`Gist de overflow ${overflowGistId} no accesible (lectura incompleta; se aborta para no perder datos)`);
    }
    const b = (await resp.json()) as { files?: Record<string, { content?: string } | undefined> };
    return { overflowGistId, files: b.files || {} };
  });

  const mergedGames: Record<string, unknown> = { ...(a.games || {}) };
  for (const { overflowGistId, files } of fetched) {
    for (const chunkId of chunkIdsByGist.get(overflowGistId)!) {
      const content = files[gamesChunkFilename(chunkId)]?.content;
      if (!content) {
        throw new Error(`Chunk ${chunkId} ausente en el gist de overflow ${overflowGistId} (lectura incompleta; se aborta)`);
      }
      try {
        const { content: plain } = await decodeGistContent(content); // Fase 1: descomprime si viene el sobre `enc`.
        const chunkParsed = JSON.parse(plain) as { games?: Record<string, unknown> };
        Object.assign(mergedGames, chunkParsed.games || {});
      } catch {
        throw new Error(`Chunk ${chunkId} corrupto en el gist de overflow ${overflowGistId} (se aborta)`);
      }
    }
  }
  return { ...a, games: mergedGames };
}

/**
 * ¿El gist remoto está en una forma VIEJA que conviene reescribir al DESTINO de escritura actual?
 *  - destino comprimido (`ENABLE_GAMES_COMPRESSION`): cualquier gist NO comprimido, o no-v4 → reescribir.
 *  - destino v4 (`ENABLE_GAMES_WRAPPER_WRITE`): no-v4 → reescribir (auto-upgrade a v4).
 *  - destino plano: envoltorio o legacy → rebajar a plano.
 * `wasCompressed` = el ancla venía en el sobre `{enc}`. `parsed` es el RAW ya descomprimido.
 */
function gamesGistWasLegacy(parsed: unknown, wasCompressed: boolean): boolean {
  if (COMPRESS_GAMES_WRITES) {
    return !wasCompressed || gamesGistNeedsUpgradeToWrapper(parsed);
  }
  return ENABLE_GAMES_WRAPPER_WRITE ? gamesGistNeedsUpgradeToWrapper(parsed) : gamesGistNeedsRewrite(parsed);
}

// Fase 2: envuelve el JSON del gist de juegos en el sobre comprimido si la escritura comprimida está activa; si no,
// lo deja plano (byte-idéntico al camino actual). Se aplica a ancla y chunks JUSTO antes de la guarda de tamaño,
// de modo que `assertGistSizeWithinLimit` mide el contenido YA comprimido.
async function encodeGamesContent(json: string): Promise<string> {
  return COMPRESS_GAMES_WRITES ? encodeCompressed('games', json) : json;
}

// Objetivo de tamaño COMPRIMIDO por fichero, con margen bajo el bloqueo duro (~950KB de `assertGistSizeWithinLimit`)
// para absorber la variación de ratio entre ficheros. Solo aplica cuando la escritura es comprimida.
const GAMES_COMPRESSED_TARGET_BYTES = 880 * 1024;
// Presupuesto de plano "sin límite práctico": fuerza que buildGamesFiles meta todo en `main` (sin chunks) para el sondeo.
const GAMES_UNCHUNKED_BUDGET_KB = 1024 * 1024;
const CHUNK_FIT_MAX_ATTEMPTS = 4;

function contentByteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

// Tamaño (bytes) del fichero COMPRIMIDO más grande del conjunto construido (ancla + chunks), tal como se almacenaría.
async function largestCompressedFileBytes(built: {
  anchorFile: GamesMainFile;
  chunkFiles: Record<string, GamesChunkFile>;
}): Promise<number> {
  const contents = [JSON.stringify(built.anchorFile), ...Object.values(built.chunkFiles).map((f) => JSON.stringify(f))];
  const sizes = await Promise.all(contents.map(async (json) => contentByteLength(await encodeGamesContent(json))));
  return Math.max(...sizes);
}

/**
 * Construye los ficheros del gist de juegos fijando el nº de chunks por el tamaño REAL almacenado.
 *
 * Sin compresión: presupuesto en PLANO (comportamiento actual, 800KB) — el comprimido nunca supera al plano, así
 * que trocear por plano es conservador y correcto.
 *
 * Con compresión: patrón ESTIMAR-Y-VERIFICAR, porque el tamaño comprimido no es lineal (depende del buffer entero
 * y del diccionario) y comprimir es async:
 *   1) ESTIMAR el ratio real comprimiendo el conjunto SIN trocear (todo en `main`). Si ya cabe comprimido bajo el
 *      objetivo, un único fichero (cero chunks).
 *   2) Estimar un presupuesto de PLANO tal que `plano × ratio` quede bajo el objetivo (margen del 8%).
 *   3) VERIFICAR el tamaño comprimido real de cada fichero; si el mayor se pasa, encoger el presupuesto según el
 *      exceso observado y reconstruir (converge en 1-2 vueltas). La guarda de 950KB en `writeGist` sigue siendo el
 *      backstop de corrección si un caso patológico (p. ej. diccionarios enormes) no cupiera.
 */
async function buildGamesFilesForStorage(
  data: TabData,
): Promise<{ anchorFile: GamesMainFile; chunkFiles: Record<string, GamesChunkFile> }> {
  if (!COMPRESS_GAMES_WRITES) {
    return buildGamesFiles(data);
  }

  // (1) ESTIMAR: sin trocear, mide el ratio real de compresión sobre este dataset concreto (autocalibrado).
  const single = buildGamesFiles(data, GAMES_UNCHUNKED_BUDGET_KB);
  const singleJson = JSON.stringify(single.anchorFile);
  const singleComp = contentByteLength(await encodeGamesContent(singleJson));
  if (singleComp <= GAMES_COMPRESSED_TARGET_BYTES) {
    return single; // cabe entero comprimido → un solo fichero
  }
  const ratio = singleComp / contentByteLength(singleJson);

  // (2) Presupuesto de plano estimado a partir del ratio medido.
  let budgetKB = Math.max(1, Math.floor(((GAMES_COMPRESSED_TARGET_BYTES / ratio) * 0.92) / 1024));
  let built = buildGamesFiles(data, budgetKB);

  // (3) VERIFICAR el tamaño comprimido real y ajustar si algún fichero se pasa del objetivo.
  for (let attempt = 0; attempt < CHUNK_FIT_MAX_ATTEMPTS; attempt += 1) {
    const maxComp = await largestCompressedFileBytes(built);
    if (maxComp <= GAMES_COMPRESSED_TARGET_BYTES) {
      break;
    }
    budgetKB = Math.max(1, Math.floor(budgetKB * (GAMES_COMPRESSED_TARGET_BYTES / maxComp) * 0.9));
    built = buildGamesFiles(data, budgetKB);
  }
  return built;
}

// Descomprime el `content` de cada fichero de un mapa (no-op sobre contenido plano) y conserva si venía comprimido.
// Se usa para que las comparaciones de reescritura incremental (checksum de chunk, refs del ancla) operen sobre JSON
// plano aunque el remoto esté comprimido, y para saber si el chunk remoto ya está en el formato de compresión destino.
type DecodedRemoteFile = { content: string; wasCompressed: boolean };
async function decodeFilesMap(
  files: Record<string, { content?: string } | undefined>,
): Promise<Record<string, DecodedRemoteFile | undefined>> {
  const out: Record<string, DecodedRemoteFile | undefined> = {};
  await Promise.all(
    Object.entries(files).map(async ([name, file]) => {
      const content = file?.content;
      if (typeof content !== 'string') {
        out[name] = undefined; // fichero sin contenido (p.ej. truncado): mantiene la clave para el barrido de obsoletos
        return;
      }
      const decoded = await decodeGistContent(content);
      out[name] = { content: decoded.content, wasCompressed: decoded.wasCompressed };
    }),
  );
  return out;
}

async function buildGistReadResponse(
  body: { files?: Record<string, { content: string } | undefined> },
  etag: string | null,
  token: string | null,
): Promise<GistReadResponse> {
  // Fase 1: descomprime (si viene el sobre `enc`) el ancla y los chunks del MISMO gist ANTES de todo el pipeline,
  // que opera sobre JSON plano (`assembleChunkedGames`/`unwrapGamesFile`/detectores `wasLegacy`). No-op si nada
  // está comprimido (contenido plano se devuelve tal cual).
  const decodedFiles: Record<string, { content: string }> = {};
  let anchorWasCompressed = false;
  await Promise.all(
    Object.entries(body.files ?? {}).map(async ([name, file]) => {
      const content = file?.content;
      if (typeof content !== 'string') return;
      const decoded = await decodeGistContent(content);
      decodedFiles[name] = { content: decoded.content };
      if (name === GIST_FILENAME) anchorWasCompressed = decoded.wasCompressed;
    }),
  );

  const raw = decodedFiles[GIST_FILENAME]?.content;

  if (!raw) {
    throw new Error('Gist file not found');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON in Gist');
  }

  // E4: chunks de overflow en el MISMO gist (vienen en esta respuesta). No-op para gist plano/un solo fichero.
  const sameGist = assembleChunkedGames(parsed, decodedFiles);
  // Fase B: chunks de overflow en OTROS gists (`gistId` ≠ null) → fetch + merge (lanza si la lectura es incompleta).
  const assembled = await mergeOverflowGistChunks(sameGist, token);

  return {
    data: migrateData(unwrapGamesFile(assembled)),
    etag,
    wasLegacy: gamesGistWasLegacy(parsed, anchorWasCompressed),
  };
}

export async function readGist(token: string, gistId: string, etag: string | null = null): Promise<GistReadResponse> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const headers: Record<string, string> = {
    Authorization: getGithubAuthHeader(token),
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers });

  if (response.status === 304) {
    // Si ya inspeccionamos el formato de este gist en esta sesión, confiamos en el 304 (no trae contenido).
    if (gamesGistFormatVerifiedThisSession.has(gistId)) {
      return { notModified: true };
    }

    // Primer 304 de la sesión: una relectura COMPLETA (sin If-None-Match) para evaluar `wasLegacy` y permitir el
    // upgrade proactivo en dispositivos ya conectados a un gist viejo. Best-effort: si falla, no rompemos el sync
    // (se devuelve notModified y se reintenta en la próxima sesión).
    try {
      const freshResp = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
        headers: {
          Authorization: getGithubAuthHeader(token),
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!freshResp.ok) {
        return { notModified: true };
      }
      const freshBody = (await freshResp.json()) as { files?: Record<string, { content: string }> };
      const result = await buildGistReadResponse(freshBody, freshResp.headers.get('etag'), token);
      gamesGistFormatVerifiedThisSession.add(gistId);
      // Solo divergemos del camino 304 cuando hay que migrar: si el formato ya es el actual, devolvemos
      // notModified para conservar exactamente el comportamiento barato (el viewmodel empuja dirty si toca).
      if (!result.wasLegacy) {
        return { notModified: true };
      }
      return result;
    } catch {
      return { notModified: true };
    }
  }

  if (!response.ok) {
    throw await buildGithubError(response, 'Read failed');
  }

  const body = (await response.json()) as { files?: Record<string, { content: string }> };
  const result = await buildGistReadResponse(body, response.headers.get('etag'), token);
  // Hemos visto el contenido completo: marca el formato como verificado para esta sesión (evita relecturas en 304).
  gamesGistFormatVerifiedThisSession.add(gistId);
  return result;
}

/**
 * Lee el gist de listados de OTRO usuario por su ID. Los gists "privados" de GitHub son SECRETOS: cualquiera que
 * conozca el ID los puede leer (con cualquier token o incluso sin él), no solo el dueño. Decodifica con la misma
 * tubería que `readGist` (chunks/diccionarios v4 → `TabData`). De SOLO LECTURA: sin upgrade proactivo ni las
 * cachés de sesión del gist propio. El `readerToken` es opcional y solo mejora el rate-limit del lector.
 */
export async function readForeignGamesGist(
  readerToken: string | null,
  gamesGistId: string,
  etag: string | null = null,
): Promise<{ data: TabData | null; etag: string | null; notModified?: boolean }> {
  if (!isValidGistId(gamesGistId)) {
    throw new Error('Gist ID inválido');
  }

  const headers: Record<string, string> = {
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (readerToken && isValidGithubToken(readerToken)) {
    headers['Authorization'] = getGithubAuthHeader(readerToken);
  }
  // Revalidación condicional: si el llamador trae el ETag cacheado, GitHub responde 304 (sin cuerpo) cuando el gist
  // no ha cambiado. Un 304 condicional NO cuenta contra el rate-limit del token, así que revalidar es barato.
  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gamesGistId}`, { headers });
  // 304 no entra en `response.ok`: hay que interceptarlo ANTES del throw. Sin cuerpo → el llamador conserva su caché.
  if (response.status === 304) {
    return { data: null, etag: response.headers.get('etag') || etag, notModified: true };
  }
  if (!response.ok) {
    throw await buildGithubError(response, 'Read foreign games gist failed');
  }

  const body = (await response.json()) as { files?: Record<string, { content: string } | undefined> };
  const result = await buildGistReadResponse(body, response.headers.get('etag'), readerToken);
  return { data: result.data as TabData, etag: response.headers.get('etag') || null };
}

/**
 * A7 (reescritura incremental): extrae el checksum de integridad de un fichero chunk remoto (juegos o social). Es
 * estable —depende solo del contenido, no de marcas de tiempo (`generatedAt`)— así que comparar el checksum del
 * chunk construido con el remoto detecta si cambió sin reescribirlo. Devuelve `null` si falta o no parsea (→ se reescribe).
 */
/** Fase B: lee los ficheros actuales de un gist por id (vacío si no accesible). Para reparto/incremental. */
async function readGistFilesById(token: string, id: string): Promise<Record<string, { content?: string } | undefined>> {
  try {
    const resp = await githubFetch(`${GIST_API_BASE}/${id}`, {
      headers: { Authorization: getGithubAuthHeader(token), 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!resp.ok) return {};
    const b = (await resp.json()) as { files?: Record<string, { content?: string }> };
    return b.files || {};
  } catch {
    return {};
  }
}

/** Fase B: extrae las refs de chunk del ancla actual (para reutilizar gists de overflow ya existentes). */
function parseAnchorChunkRefs(content: string | undefined): Array<{ chunkId: string; gistId: string | null }> {
  if (!content) return [];
  try {
    const p = JSON.parse(content) as { chunkIndex?: { chunks?: Array<{ chunkId?: string; gistId?: string | null }> } };
    return (p.chunkIndex?.chunks || []).filter((c) => c && c.chunkId).map((c) => ({ chunkId: String(c.chunkId), gistId: c.gistId ?? null }));
  } catch {
    return [];
  }
}

/** Fase B: crea un gist PRIVADO de overflow con los ficheros dados. Devuelve su id. */
async function createOverflowGist(token: string, filesContent: Record<string, { content: string }>): Promise<string> {
  const resp = await githubFetch(GIST_API_BASE, {
    method: 'POST',
    headers: { Authorization: getGithubAuthHeader(token), 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ description: 'Mi Lista de Juegos - Overflow', public: false, files: filesContent }),
  });
  if (!resp.ok) throw await buildGithubError(resp, 'Create overflow gist failed');
  const body = (await resp.json()) as { id: string };
  return body.id;
}

/**
 * Fase B (gated): reparte los chunks que no caben en el gist principal (más de `MAX_OVERFLOW_CHUNKS_PER_GIST`) entre
 * gists de OVERFLOW, reutilizando los del ancla actual y creando nuevos si faltan. Los escribe (incremental) ANTES
 * que el ancla y fija el `gistId` de cada chunk en `anchorFile.chunkIndex`. Devuelve el conjunto de nombres de
 * chunk que se quedan en el gist principal. Escribir overflow primero + ancla después garantiza que el manifiesto
 * nunca apunte a chunks aún no persistidos (si algo falla a mitad, el ancla viejo sigue siendo válido → sin pérdida).
 * No borra gists/chunks viejos (higiene de huérfanos diferida): el ancla es el manifiesto, así que lo no referenciado
 * simplemente se ignora en lectura.
 */
async function assignAndWriteOverflowGists(
  token: string,
  mainGistId: string,
  anchorFile: GamesMainFile,
  chunkFiles: Record<string, GamesChunkFile>,
  currentMainFiles: Record<string, { content?: string } | undefined>,
): Promise<Set<string>> {
  const chunkNum = (name: string) => Number(chunkFiles[name].chunkId.replace(/\D/g, '')) || 0;
  const chunkNames = Object.keys(chunkFiles).sort((a, b) => chunkNum(a) - chunkNum(b));
  const mainChunkNames = chunkNames.slice(0, MAX_OVERFLOW_CHUNKS_PER_GIST);
  const overflowChunkNames = chunkNames.slice(MAX_OVERFLOW_CHUNKS_PER_GIST);
  if (overflowChunkNames.length === 0) return new Set(mainChunkNames);

  const existingOverflowGistIds = [
    ...new Set(parseAnchorChunkRefs(currentMainFiles[GIST_FILENAME]?.content).map((r) => r.gistId).filter((g): g is string => Boolean(g))),
  ];

  const batches: string[][] = [];
  for (let i = 0; i < overflowChunkNames.length; i += MAX_OVERFLOW_CHUNKS_PER_GIST) {
    batches.push(overflowChunkNames.slice(i, i + MAX_OVERFLOW_CHUNKS_PER_GIST));
  }

  const chunkIdToGist = new Map<string, string>();
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    const batchContents: Record<string, { content: string }> = {};
    for (const name of batch) {
      const content = await encodeGamesContent(JSON.stringify({ ...chunkFiles[name], mainGistId }));
      assertGistSizeWithinLimit(content, `gist de overflow (${name})`);
      batchContents[name] = { content };
    }
    let overflowId = existingOverflowGistIds[i];
    if (overflowId) {
      // Reutiliza un gist de overflow existente: PATCH incremental (solo los chunks cuyo checksum cambió).
      const cur = await decodeFilesMap(await readGistFilesById(token, overflowId));
      const toPatch: Record<string, { content: string }> = {};
      for (const name of batch) {
        const remote = cur[name];
        // Igual que en el gist principal: omitir solo si no cambió Y ya está en la compresión destino.
        if (remote && chunkFileChecksum(remote.content) === chunkFiles[name].integrity.checksum && remote.wasCompressed === COMPRESS_GAMES_WRITES) continue;
        toPatch[name] = batchContents[name];
      }
      if (Object.keys(toPatch).length > 0) {
        const resp = await githubFetch(`${GIST_API_BASE}/${overflowId}`, {
          method: 'PATCH',
          headers: { Authorization: getGithubAuthHeader(token), 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
          body: JSON.stringify({ files: toPatch }),
        });
        if (!resp.ok) throw await buildGithubError(resp, 'Write overflow gist failed');
      }
    } else {
      overflowId = await createOverflowGist(token, batchContents);
    }
    for (const name of batch) chunkIdToGist.set(chunkFiles[name].chunkId, overflowId);
  }

  // Fija el gistId en el manifiesto del ancla: chunks del gist principal → null; del overflow → su gist.
  for (const ref of anchorFile.chunkIndex.chunks) {
    if (ref.chunkId === 'main') continue;
    ref.gistId = chunkIdToGist.get(ref.chunkId) ?? null;
  }

  return new Set(mainChunkNames);
}

export async function writeGist(token: string, gistId: string, payload: TabData): Promise<{ etag: string | null; updatedAt: number }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  // E1: serialización magra (omite opcionales vacíos) + guarda de tamaño por fichero.
  const lean = leanTabData(payload);
  const headers: Record<string, string> = {
    Authorization: getGithubAuthHeader(token),
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let files: Record<string, { content: string } | null>;

  if (ENABLE_GAMES_WRAPPER_WRITE) {
    // E4: envoltorio DESTINO multi-fichero. El ancla lleva el bucket `main` + diccionarios/chunkIndex; el excedente
    // va a ficheros `myGames-chunk-cN.json`. Con compresión activa, el nº de chunks se fija por el tamaño REAL
    // almacenado (comprimido) vía estimar-y-verificar; sin compresión, por el JSON plano (800KB).
    const { anchorFile, chunkFiles } = await buildGamesFilesForStorage(lean);
    files = {};

    // A7 (reescritura incremental) + B (reparto): lee el estado actual del gist principal UNA vez para (a) OMITIR
    // del PATCH los chunks sin cambios (checksum estable), (b) borrar obsoletos y (c) reutilizar gists de overflow.
    let currentFiles: Record<string, DecodedRemoteFile | undefined> = {};
    try {
      const current = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers });
      if (current.ok) {
        const currentBody = (await current.json()) as { files?: Record<string, { content?: string }> };
        // Fase 2: descomprime el remoto para que checksum/refs del ancla comparen JSON plano contra lo que construimos.
        currentFiles = await decodeFilesMap(currentBody.files || {});
      }
    } catch {
      // Sin estado actual: subimos el conjunto completo y no borramos nada.
    }

    // B (gated): si está activado, reparte el excedente en gists de OVERFLOW (los escribe ANTES que el ancla y fija
    // su `gistId` en el manifiesto). Si no, todos los chunks van al gist principal (comportamiento A7 intacto).
    const mainChunkNames: Set<string> = ENABLE_GAMES_OVERFLOW_GISTS
      ? await assignAndWriteOverflowGists(token, gistId, anchorFile, chunkFiles, currentFiles)
      : new Set(Object.keys(chunkFiles));

    // El ancla se serializa DESPUÉS de fijar los `gistId` (manifiesto correcto) y se escribe en el gist principal
    // junto al PATCH de abajo — es decir, AL FINAL, cuando los chunks de overflow ya están persistidos.
    const anchorContent = await encodeGamesContent(JSON.stringify(anchorFile));
    assertGistSizeWithinLimit(anchorContent, 'gist de juegos (ancla)');
    files[GIST_FILENAME] = { content: anchorContent };

    for (const name of mainChunkNames) {
      const file = chunkFiles[name];
      const content = await encodeGamesContent(JSON.stringify({ ...file, mainGistId: gistId }));
      assertGistSizeWithinLimit(content, `gist de juegos (${name})`);
      // Omitir solo si el chunk no cambió Y su compresión remota ya coincide con el destino: así el flip a comprimido
      // (o el revert a plano) reescribe también los chunks sin cambios, en vez de dejarlos en el formato viejo.
      const remote = currentFiles[name];
      if (remote && chunkFileChecksum(remote.content) === file.integrity.checksum && remote.wasCompressed === COMPRESS_GAMES_WRITES) {
        continue; // sin cambios y misma compresión que el remoto: no reenviar este chunk
      }
      files[name] = { content };
    }

    // Borrar del gist principal los chunks que ya no le corresponden (obsoletos o movidos a overflow). Se compara
    // contra `mainChunkNames` (no contra el subconjunto del PATCH) para no borrar uno omitido por estar sin cambios.
    for (const name of Object.keys(currentFiles)) {
      if (/^myGames-chunk-.+\.json$/.test(name) && !mainChunkNames.has(name)) {
        files[name] = null; // null elimina el fichero del gist
      }
    }
  } else {
    // CAMINO ACTUAL (flag OFF) — TabData plano, byte-idéntico al anterior.
    const fileContent = JSON.stringify(lean);
    assertGistSizeWithinLimit(fileContent, 'gist de juegos');
    files = { [GIST_FILENAME]: { content: fileContent } };
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ files }),
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Write failed');
  }

  const body = (await response.json()) as { updated_at?: string };
  return {
    etag: response.headers.get('etag'),
    updatedAt: body.updated_at ? Date.parse(body.updated_at) : Date.now(),
  };
}

/**
 * Garantiza que el gist social tenga la visibilidad deseada.
 *
 * Si la visibilidad actual no coincide con la deseada, se clona el contenido
 * en un nuevo gist con la visibilidad adecuada.
 *
 * @param token - Token de GitHub con permisos de gist
 * @param gistId - ID del gist social original
 * @param isPublic - true para público, false para privado
 */
