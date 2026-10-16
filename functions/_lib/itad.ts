// ISTHEREANYDEAL EN EL BORDE (P1 del plan de la ficha y los precios, `docs/plan-ficha-de-juego-y-precios.md`).
//
// Lo usan `functions/api/precios.ts` y su gemelo de desarrollo (`localPreciosApi`, en `vite.config.ts`). Puro salvo
// las llamadas a ITAD y la caché, que llegan de fuera (`PresupuestoItad`, `CacheItad`) para poder probarlo todo.
//
// QUÉ SE PIDE A ITAD, con la clave de la app (una para todos: 1.000 peticiones cada 5 minutos):
//  · `/lookup/id/title/v1`: título → id, en bloque. No es una búsqueda difusa: si no acierta, una segunda pasada con
//    los números romanos pasados a arábigos y al revés (medido en P0: recupera *Hades 2*, *The Witcher III*…);
//  · `/games/prices/v3`: las ofertas de ahora y los mínimos de 1 año y de 3 meses;
//  · `/games/overview/v2`: el mínimo histórico CON SU FECHA, el enlace a la página del juego en ITAD y los packs
//    (bundles) que lo contienen. Hace falta para el recuadro de la ficha (F0.15), así que va siempre, y el aviso de
//    pack de la P4 sale de aquí sin una llamada más.
// España y euros, fijos (P0.3). Solo títulos: nada de quien pide llega a ITAD, y sale desde el borde.
//
// Esta carpeta la compila Cloudflare Pages: nada del bundle salvo módulos sin dependencias.

// Los tipos del precio viven en `src/model/types/prices.ts`: los comparten el borde y el cliente (P2), y ese fichero
// no tiene dependencias, como pide esta carpeta.
import type { OfertaItad, PrecioItad } from '../../src/model/types/prices';

export type { OfertaItad, PrecioItad };

const API = 'https://api.isthereanydeal.com';
/** España y euros (P0.3). */
export const PAIS_ITAD = 'ES';
/** Ids por llamada: el máximo que admiten `prices` y `overview`. */
export const LOTE_ITAD = 200;
const TIMEOUT_MS = 5_000;
/** Lo más que se espera un `Retry-After` antes del único reintento: la Function no puede quedarse colgada. */
const ESPERA_MAXIMA_MS = 3_000;

// ─── Lo puro ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** El título tal y como sirve de clave de caché: sin dobles espacios, sin mayúsculas y en una sola forma Unicode. */
export function normalizarTitulo(titulo: string): string {
  return titulo.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/**
 * LA SEGUNDA PASADA: el mismo título con los números romanos (del II al XX, palabras sueltas) pasados a arábigos y,
 * si no tenía ninguno, los arábigos (del 2 al 20) a romanos. `null` si no hay nada que cambiar. El I y el 1 no se
 * tocan: «I» es también un pronombre en inglés y «1» casi nunca es una entrega.
 */
export function varianteNumerica(titulo: string): string | null {
  const conArabigos = titulo.replace(/\b(II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)\b/g, (romano) => String(ROMANOS.indexOf(romano)));
  if (conArabigos !== titulo) return conArabigos;
  const conRomanos = titulo.replace(/\b([2-9]|1[0-9]|20)\b/g, (n) => ROMANOS[Number(n)]);
  return conRomanos !== titulo ? conRomanos : null;
}

interface PrecioCrudo {
  id: string;
  historyLow?: { all?: { amount?: number } | null; y1?: { amount?: number } | null; m3?: { amount?: number } | null } | null;
  deals?: Array<{
    shop?: { name?: string };
    price?: { amount?: number };
    regular?: { amount?: number };
    cut?: number;
    expiry?: string | null;
    url?: string;
  }>;
}

interface ResumenCrudo {
  id: string;
  lowest?: { price?: { amount?: number }; timestamp?: string } | null;
  urls?: { game?: string };
}

interface PackCrudo {
  title?: string;
  url?: string;
  expiry?: string | null;
  tiers?: Array<{ games?: Array<{ id?: string }> }>;
}

const numero = (valor: unknown): number | null => (typeof valor === 'number' && Number.isFinite(valor) ? valor : null);

/**
 * El precio normalizado de un juego, a partir de lo que devuelven `prices` y `overview`. Las ofertas van de la más
 * barata a la más cara y una por tienda; la mejor es la primera y las «otras», las dos siguientes. Nada de lo que
 * llega se reescribe: ni la `url` ni el precio.
 */
export function normalizarPrecio(
  titulo: string,
  itadId: string,
  precio: PrecioCrudo | undefined,
  resumen: ResumenCrudo | undefined,
  packs: PrecioItad['bundles'],
): PrecioItad {
  const vistas = new Set<string>();
  const ofertas: OfertaItad[] = [];
  for (const deal of [...(precio?.deals ?? [])].sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity))) {
    const tienda = String(deal.shop?.name || '').trim();
    const importe = numero(deal.price?.amount);
    if (!tienda || importe === null || !deal.url || vistas.has(tienda)) continue;
    vistas.add(tienda);
    ofertas.push({
      tienda,
      precio: importe,
      normal: numero(deal.regular?.amount),
      descuento: numero(deal.cut) ?? 0,
      hasta: deal.expiry || null,
      url: deal.url,
    });
  }
  const historicoConFecha = numero(resumen?.lowest?.price?.amount);
  const historicoSinFecha = numero(precio?.historyLow?.all?.amount);
  return {
    titulo,
    itadId,
    mejor: ofertas[0] ?? null,
    otras: ofertas.slice(1, 3),
    minimos: {
      historico: historicoConFecha !== null
        ? { precio: historicoConFecha, fecha: resumen?.lowest?.timestamp || null }
        : historicoSinFecha !== null ? { precio: historicoSinFecha, fecha: null } : null,
      anio: numero(precio?.historyLow?.y1?.amount),
      tresMeses: numero(precio?.historyLow?.m3?.amount),
    },
    urlFicha: resumen?.urls?.game || null,
    bundles: packs,
  };
}

/** De la lista de packs de `overview`, los de cada juego (por su id de ITAD). */
export function packsPorJuego(packs: readonly PackCrudo[]): Map<string, PrecioItad['bundles']> {
  const porJuego = new Map<string, PrecioItad['bundles']>();
  for (const pack of packs) {
    if (!pack.title || !pack.url) continue;
    const ids = new Set((pack.tiers ?? []).flatMap((tier) => (tier.games ?? []).map((game) => game.id).filter(Boolean) as string[]));
    for (const id of ids) {
      const lista = porJuego.get(id) ?? [];
      lista.push({ titulo: pack.title, url: pack.url, expira: pack.expiry || null });
      porJuego.set(id, lista);
    }
  }
  return porJuego;
}

// ─── Llamadas a ITAD ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cuántas llamadas a ITAD quedan: el tope global por minuto (en memoria del aislado, ver `precios.ts`). `tomar`
 * devuelve `false` si ya no se puede llamar.
 */
export interface PresupuestoItad {
  tomar: () => boolean;
}

/** ITAD no atiende ahora (caído, sin red o lento): 503 para el cliente. */
export class ItadNoDisponible extends Error {
  constructor() {
    super('ITAD no disponible');
    this.name = 'ItadNoDisponible';
  }
}

/** Sin cupo: el de ITAD (su `429`) o el nuestro por minuto. `reintentarEn`, en segundos. */
export class ItadSinCupo extends Error {
  readonly reintentarEn: number;

  constructor(reintentarEn: number) {
    super('Sin cupo para ITAD');
    this.name = 'ItadSinCupo';
    this.reintentarEn = reintentarEn;
  }
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

function segundosDeRetryAfter(respuesta: Response): number {
  const valor = Number(respuesta.headers.get('Retry-After'));
  return Number.isFinite(valor) && valor > 0 ? valor : 60;
}

/**
 * Un `POST` a ITAD con su clave: timeout de 5 s y UN reintento ante `429` o `5xx`, respetando `Retry-After` hasta 3 s.
 * Cada intento gasta del presupuesto por minuto.
 */
async function llamar<T>(ruta: string, consulta: Record<string, string>, cuerpo: unknown, clave: string, presupuesto: PresupuestoItad): Promise<T> {
  const url = new URL(ruta, API);
  url.search = new URLSearchParams({ key: clave, ...consulta }).toString();
  for (let intento = 0; intento < 2; intento += 1) {
    if (!presupuesto.tomar()) throw new ItadSinCupo(60);
    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      if (intento === 0) continue;
      throw new ItadNoDisponible();
    }
    if (respuesta.ok) return (await respuesta.json()) as T;
    if (respuesta.status === 429 || respuesta.status >= 500) {
      const espera = segundosDeRetryAfter(respuesta);
      if (intento === 0 && espera * 1000 <= ESPERA_MAXIMA_MS) {
        await esperar(espera * 1000);
        continue;
      }
      if (respuesta.status === 429) throw new ItadSinCupo(espera);
      throw new ItadNoDisponible();
    }
    // Un 4xx que no es de cupo es un fallo NUESTRO (clave, forma de la petición): para el cliente, no disponible.
    throw new ItadNoDisponible();
  }
  throw new ItadNoDisponible();
}

const enLotes = <T>(lista: readonly T[], tamano: number): T[][] => {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
};

/**
 * Título → id de ITAD, con la segunda pasada para los que no acierten. Devuelve, por cada título pedido, el id y el
 * título con el que acertó, o `null` si ni así.
 */
export async function buscarIds(
  titulos: readonly string[],
  clave: string,
  presupuesto: PresupuestoItad,
): Promise<Map<string, { id: string; titulo: string } | null>> {
  const resultado = new Map<string, { id: string; titulo: string } | null>();
  for (const lote of enLotes([...new Set(titulos)], LOTE_ITAD)) {
    const ids = await llamar<Record<string, string | null>>('/lookup/id/title/v1', {}, lote, clave, presupuesto);
    for (const titulo of lote) resultado.set(titulo, ids[titulo] ? { id: ids[titulo] as string, titulo } : null);
  }
  const variantes = new Map<string, string>();
  for (const [titulo, encontrado] of resultado) {
    const variante = encontrado ? null : varianteNumerica(titulo);
    if (variante) variantes.set(variante, titulo);
  }
  for (const lote of enLotes([...variantes.keys()], LOTE_ITAD)) {
    const ids = await llamar<Record<string, string | null>>('/lookup/id/title/v1', {}, lote, clave, presupuesto);
    for (const variante of lote) {
      const id = ids[variante];
      if (id) resultado.set(variantes.get(variante) as string, { id, titulo: variante });
    }
  }
  return resultado;
}

/** Los precios de esos ids (`prices` y `overview`, de 200 en 200), ya normalizados, por id. */
export async function leerPrecios(
  ids: ReadonlyArray<{ id: string; titulo: string }>,
  clave: string,
  presupuesto: PresupuestoItad,
): Promise<Map<string, PrecioItad>> {
  const resultado = new Map<string, PrecioItad>();
  for (const lote of enLotes(ids, LOTE_ITAD)) {
    const soloIds = lote.map((entrada) => entrada.id);
    const [precios, resumen] = await Promise.all([
      llamar<PrecioCrudo[]>('/games/prices/v3', { country: PAIS_ITAD }, soloIds, clave, presupuesto),
      llamar<{ prices?: ResumenCrudo[]; bundles?: PackCrudo[] }>('/games/overview/v2', { country: PAIS_ITAD }, soloIds, clave, presupuesto),
    ]);
    const precioDe = new Map((precios ?? []).map((precio) => [precio.id, precio]));
    const resumenDe = new Map((resumen?.prices ?? []).map((item) => [item.id, item]));
    const packs = packsPorJuego(resumen?.bundles ?? []);
    for (const { id, titulo } of lote) {
      resultado.set(id, normalizarPrecio(titulo, id, precioDe.get(id), resumenDe.get(id), packs.get(id) ?? []));
    }
  }
  return resultado;
}

// ─── La caché del borde ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Lo que se guarda en la caché del borde. Va detrás de esta interfaz para poder probarlo sin Cloudflare; en
 * producción es `caches.default` (`cacheDelBorde`).
 */
export interface CacheItad {
  leer: <T>(clave: string) => Promise<{ valor: T; guardadoEn: number } | null>;
  guardar: (clave: string, valor: unknown, segundos: number, ahora: number) => Promise<void>;
}

/** Título → id: 30 días. Un «no está», 7 días (como el `MISS_TTL` de las carátulas). */
export const CACHE_ID_S = 30 * 24 * 60 * 60;
export const CACHE_ID_NULO_S = 7 * 24 * 60 * 60;
/**
 * Un precio vive un día en la caché: más que el plazo del rango más lento (bronce, 18 h), y así queda de respaldo si
 * ITAD no atiende. Cada petición decide con la HORA guardada si le vale (`PROFILE_TIER_PRICE_TTL_MS`).
 */
export const CACHE_PRECIO_S = 24 * 60 * 60;

/**
 * LA CACHÉ DE CLOUDFLARE (`caches.default`), que funciona en las Pages Functions también en `*.pages.dev`. Solo guarda
 * peticiones `GET`, así que la clave de cada valor es una dirección inventada bajo el propio dominio
 * (`<origen>/__cache/itad/…`), que nunca se sirve a nadie. Es por centro de datos y no se replica. Sin
 * `caches` (fuera de Cloudflare), no guarda nada.
 */
export function cacheDelBorde(origen: string): CacheItad {
  const almacen = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const url = (clave: string) => `${origen}/__cache/itad/${clave}`;
  return {
    async leer<T>(clave: string) {
      if (!almacen) return null;
      try {
        const respuesta = await almacen.match(new Request(url(clave)));
        return respuesta ? ((await respuesta.json()) as { valor: T; guardadoEn: number }) : null;
      } catch {
        return null;
      }
    },
    async guardar(clave: string, valor: unknown, segundos: number, ahora: number) {
      if (!almacen) return;
      try {
        await almacen.put(
          new Request(url(clave)),
          new Response(JSON.stringify({ valor, guardadoEn: ahora }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${segundos}` },
          }),
        );
      } catch {
        // Best-effort: sin caché se pregunta otra vez a ITAD, que es lo que pasaría igual.
      }
    },
  };
}

export const claveId = (titulo: string) => `id/${encodeURIComponent(normalizarTitulo(titulo))}`;
export const clavePrecio = (id: string) => `precio/${encodeURIComponent(id)}`;

// ─── Todo junto ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface ResolverPreciosOpciones {
  clave: string;
  /** Cuánto le vale a quien pide un precio guardado (`PROFILE_TIER_PRICE_TTL_MS` de su rango). */
  plazoMs: number;
  cache: CacheItad;
  presupuesto: PresupuestoItad;
  ahora: number;
}

export interface PreciosResueltos {
  juegos: Record<string, PrecioItad | null>;
  /** ¿Se ha preguntado a ITAD? (`x-cache: miss`) Si no, todo salió de la caché (`hit`). */
  preguntoAItad: boolean;
  /** Si ITAD falló por el camino: lo que no se pudo resolver sale `null`, y lo guardado vale aunque sea viejo. */
  fallo: ItadNoDisponible | ItadSinCupo | null;
}

/**
 * LOS PRECIOS DE UNA LISTA DE TÍTULOS, con la caché por delante:
 *  1. título → id: de la caché; lo que falte, a ITAD en bloque (con la segunda pasada) y a la caché;
 *  2. id → precio: de la caché si es más reciente que el plazo de quien pide; lo demás, a ITAD de 200 en 200 y a la
 *     caché con la hora;
 *  3. si ITAD falla, lo guardado vale aunque sea viejo, y lo que no haya sale `null`.
 * Dos personas que desean el mismo juego comparten la consulta (si entran por el mismo centro de datos).
 */
export async function resolverPrecios(titulos: readonly string[], opciones: ResolverPreciosOpciones): Promise<PreciosResueltos> {
  const { clave, plazoMs, cache, presupuesto, ahora } = opciones;
  let preguntoAItad = false;
  let fallo: PreciosResueltos['fallo'] = null;
  const anotarFallo = (error: unknown) => {
    if (error instanceof ItadNoDisponible || error instanceof ItadSinCupo) {
      fallo = error;
      return;
    }
    throw error;
  };

  // 1 · Título → id.
  const ids = new Map<string, { id: string; titulo: string } | null>();
  const sinId: string[] = [];
  for (const titulo of titulos) {
    const guardado = await cache.leer<{ id: string; titulo: string } | null>(claveId(titulo));
    if (guardado) ids.set(titulo, guardado.valor);
    else sinId.push(titulo);
  }
  if (sinId.length) {
    try {
      preguntoAItad = true;
      const encontrados = await buscarIds(sinId, clave, presupuesto);
      for (const titulo of sinId) {
        const encontrado = encontrados.get(titulo) ?? null;
        ids.set(titulo, encontrado);
        await cache.guardar(claveId(titulo), encontrado, encontrado ? CACHE_ID_S : CACHE_ID_NULO_S, ahora);
      }
    } catch (error) {
      anotarFallo(error);
    }
  }

  // 2 · Id → precio.
  const precios = new Map<string, PrecioItad>();
  const viejos = new Map<string, PrecioItad>();
  const porPedir = new Map<string, { id: string; titulo: string }>();
  for (const encontrado of ids.values()) {
    if (!encontrado || precios.has(encontrado.id) || porPedir.has(encontrado.id)) continue;
    const guardado = await cache.leer<PrecioItad>(clavePrecio(encontrado.id));
    if (guardado && ahora - guardado.guardadoEn < plazoMs) precios.set(encontrado.id, guardado.valor);
    else {
      if (guardado) viejos.set(encontrado.id, guardado.valor);
      porPedir.set(encontrado.id, encontrado);
    }
  }
  if (porPedir.size && !fallo) {
    try {
      preguntoAItad = true;
      const nuevos = await leerPrecios([...porPedir.values()], clave, presupuesto);
      for (const [id, precio] of nuevos) {
        precios.set(id, precio);
        await cache.guardar(clavePrecio(id), precio, CACHE_PRECIO_S, ahora);
      }
    } catch (error) {
      anotarFallo(error);
    }
  }
  // 3 · Si ITAD no ha contestado, lo guardado vale aunque sea viejo.
  for (const [id, precio] of viejos) if (!precios.has(id)) precios.set(id, precio);

  const juegos: Record<string, PrecioItad | null> = {};
  for (const titulo of titulos) {
    const encontrado = ids.get(titulo);
    const precio = encontrado ? precios.get(encontrado.id) : undefined;
    juegos[titulo] = precio ? { ...precio, titulo: encontrado?.titulo ?? precio.titulo } : null;
  }
  return { juegos, preguntoAItad, fallo };
}
