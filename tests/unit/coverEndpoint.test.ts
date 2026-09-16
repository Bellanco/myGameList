// `/cover` — el endpoint que sirve la carátula de un juego (`functions/cover.ts`).
//
// Hasta ahora solo estaban probadas las piezas PURAS del emparejador (ver `igdbCover.test.ts`), y lo que decide
// el gasto de verdad —cuándo se consulta a IGDB, cuándo se gasta cupo y cuántas veces se toca KV— no tenía nada
// que lo sujetara. Cada bloque de aquí fija una de esas decisiones.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { onRequestGet } from '../../functions/cover';
import { claveCache } from '../../functions/_lib/igdbCover';

/** Remedo de KV: lo mínimo que usa el endpoint, con las llamadas a la vista para poder contarlas. */
function kvFalso(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    get: vi.fn(async (clave: string) => datos.get(clave) ?? null),
    put: vi.fn(async (clave: string, valor: string) => { datos.set(clave, valor); }),
    delete: vi.fn(async () => {}),
    list: vi.fn(async () => ({ keys: [], list_complete: true })),
  };
}

type Kv = ReturnType<typeof kvFalso>;

function entorno(kv: Kv, completo = true) {
  return {
    IGDB_CLIENT_ID: completo ? 'id-publico' : '',
    IGDB_CLIENT_SECRET: completo ? 'secreto' : '',
    COVERS: kv,
  } as never;
}

function peticion(consulta: string, ip = '203.0.113.7', cabeceras: Record<string, string> = {}): Request {
  return new Request(`https://mygamelist.pages.dev/cover?${consulta}`, {
    headers: { 'CF-Connecting-IP': ip, ...cabeceras },
  });
}

/** Ficha de IGDB que empareja con el título pedido. `total_rating_count` alto para que gane sin dudar. */
function ficha(name: string, image_id: string | undefined = 'co1abc') {
  return { name, game_type: 0, total_rating_count: 900, cover: image_id ? { image_id } : undefined, platforms: [] };
}

let fichas: ReturnType<typeof ficha>[];
let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fichas = [ficha('Celeste')];
  fetchSimulado = vi.fn(async (entrada: Request | string) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (url.includes('id.twitch.tv')) {
      return new Response(JSON.stringify({ access_token: 'token', expires_in: 5_000_000 }), { status: 200 });
    }
    if (url.includes('api.igdb.com')) {
      return new Response(JSON.stringify(fichas), { status: 200 });
    }
    // images.igdb.com: los bytes de la portada.
    return new Response('jpeg', { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  });
  vi.stubGlobal('fetch', fetchSimulado);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Llamadas a IGDB (no a Twitch ni a las imágenes): lo que el cupo existe para racionar. */
const consultasAIgdb = () =>
  fetchSimulado.mock.calls.filter(([entrada]) => String(entrada instanceof Request ? entrada.url : entrada).includes('api.igdb.com'));

describe('/cover — lo que contesta', () => {
  it('501 si al entorno le faltan las credenciales: es fallo nuestro, no del cliente', async () => {
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kvFalso(), false) });
    expect(respuesta.status).toBe(501);
  });

  it('400 sin nombre, y también con un nombre desmedido', async () => {
    const kv = kvFalso();
    expect((await onRequestGet({ request: peticion('n=%20%20'), env: entorno(kv) })).status).toBe(400);
    expect((await onRequestGet({ request: peticion(`n=${'a'.repeat(201)}`), env: entorno(kv) })).status).toBe(400);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('sirve los bytes de la carátula ya emparejada, con la caché larga del navegador', async () => {
    const kv = kvFalso({ [claveCache('Celeste', ['Steam'])]: 'co1abc' });
    const respuesta = await onRequestGet({ request: peticion('n=Celeste&p=Steam'), env: entorno(kv) });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('Content-Type')).toBe('image/jpeg');
    expect(respuesta.headers.get('Cache-Control')).toContain('max-age=2592000');
    expect(respuesta.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  // El 404 NO se cachea a propósito: cuando esta línea decía `max-age=3600`, una ráfaga de 429 dejó 56 huecos
  // falsos guardados una hora en los navegadores, y la imagen buena no había forma de verla.
  it('404 y `no-store` cuando consta que ese juego no tiene carátula', async () => {
    const kv = kvFalso({ [claveCache('Jotum', [])]: '' });
    const respuesta = await onRequestGet({ request: peticion('n=Jotum'), env: entorno(kv) });

    expect(respuesta.status).toBe(404);
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store');
    expect(consultasAIgdb()).toHaveLength(0); // la caché negativa es justo para no volver a preguntar
  });

  it('204 sin cuerpo en el modo «solo resolver» (`m=1`), que es el del llenado inicial', async () => {
    const kv = kvFalso();
    const respuesta = await onRequestGet({ request: peticion('n=Celeste&m=1'), env: entorno(kv) });

    expect(respuesta.status).toBe(204);
    expect(await respuesta.text()).toBe('');
    // Ha resuelto y lo ha apuntado, que es el efecto que se busca; lo que no ha hecho es traerse la imagen.
    expect(kv.datos.get(claveCache('Celeste', []))).toBe('co1abc');
    expect(fetchSimulado.mock.calls.some(([e]) => String(e).includes('images.igdb.com'))).toBe(false);
  });

  it('pide a IGDB el tamaño que dice la URL, y el normal ante un valor que no conoce', async () => {
    const kv = kvFalso({ [claveCache('Celeste', [])]: 'co1abc' });
    await onRequestGet({ request: peticion('n=Celeste&s=ancho'), env: entorno(kv) });
    expect(String(fetchSimulado.mock.calls.at(-1)?.[0])).toContain('t_1080p');

    await onRequestGet({ request: peticion('n=Celeste&s=gigante'), env: entorno(kv) });
    expect(String(fetchSimulado.mock.calls.at(-1)?.[0])).toContain('t_cover_big');
  });

  it('502 si el identificador de la carátula no tiene la pinta que debe', async () => {
    fichas = [ficha('Celeste', '../../algo')];
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kvFalso()) });
    expect(respuesta.status).toBe(502);
  });
});

describe('/cover — lo que cuesta', () => {
  it('servir lo ya sabido no gasta cupo ni escribe en KV', async () => {
    // Navegar por una biblioteca ya llena tiene que ser gratis: si no, abrir el mosaico topaba el límite.
    const kv = kvFalso({ [claveCache('Celeste', [])]: 'co1abc' });
    await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(kv.put).not.toHaveBeenCalled();
    expect(consultasAIgdb()).toHaveLength(0);
  });

  // Antes, el endpoint leía la clave del emparejamiento para saber si gastar cupo y la resolución la volvía a
  // leer por su cuenta: dos viajes a KV por cada juego nuevo.
  it('un juego nuevo lee UNA sola vez la clave de su emparejamiento', async () => {
    const kv = kvFalso();
    await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    const lecturas = kv.get.mock.calls.filter(([clave]) => clave === claveCache('Celeste', []));
    expect(lecturas).toHaveLength(1);
  });

  it('no apunta el cupo en cada resolución: escribe por lotes', async () => {
    // El azar decide quién apunta. Con el dado alto no le toca a nadie, y así se ve que resolver no implica
    // escribir: era lo que ponía seis escrituras por segundo sobre la MISMA clave durante el llenado inicial.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const kv = kvFalso();
    for (const nombre of ['Celeste', 'Portal', 'Hades']) {
      fichas = [ficha(nombre)];
      await onRequestGet({ request: peticion(`n=${nombre}`), env: entorno(kv) });
    }

    const escriturasDeCupo = kv.put.mock.calls.filter(([clave]) => String(clave).startsWith('igdb:cupo:'));
    expect(escriturasDeCupo).toHaveLength(0);
    // Y aun así las tres carátulas quedan apuntadas: lo que se agrupa es el contador, no el trabajo.
    expect(kv.datos.get(claveCache('Hades', []))).toBe('co1abc');
  });

  it('cuando le toca apuntar, apunta el lote entero', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const kv = kvFalso();
    await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    const [clave, valor] = kv.put.mock.calls.find(([c]) => String(c).startsWith('igdb:cupo:')) ?? [];
    expect(String(clave)).toContain('203.0.113.7');
    expect(valor).toBe('10');
  });

  it('429 con `Retry-After` cuando la IP ya agotó su cupo, y sin preguntarle a IGDB', async () => {
    const hora = new Date().toISOString().slice(0, 13);
    const kv = kvFalso({ [`igdb:cupo:v1:203.0.113.7:${hora}`]: '500' });
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(429);
    expect(Number(respuesta.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store');
    expect(consultasAIgdb()).toHaveLength(0);
  });

  it('el cupo va por IP: el tope de una no alcanza a la de al lado', async () => {
    const hora = new Date().toISOString().slice(0, 13);
    const kv = kvFalso({ [`igdb:cupo:v1:203.0.113.7:${hora}`]: '500' });
    const respuesta = await onRequestGet({ request: peticion('n=Celeste', '198.51.100.4'), env: entorno(kv) });

    expect(respuesta.status).toBe(200);
  });

  // Un fallo de infraestructura NUNCA puede escribirse como si fuera un dato: guardar un 429 de IGDB como «este
  // juego no tiene carátula» dejó medio catálogo sin imagen durante una semana.
  //
  // Se simula con un 401 y no con el 429 del caso real porque el 429 sí se reintenta —tres veces, con espera
  // creciente y por cada una de las cuatro consultas— y el test tardaría siete segundos en comprobar lo mismo:
  // los dos desembocan en el mismo «no se ha podido preguntar», que es la invariante que aquí se protege.
  /* GUARDAR ES EL MEJOR ESFUERZO, NUNCA UNA CONDICIÓN PARA RESPONDER. El `put` de KV lanza cuando la cuenta
     agota su presupuesto diario de escrituras —1.000 en el plan gratuito, y lo comparte con las reseñas
     compartidas—, y como aquí no hay `_middleware` que recoja la excepción, `/cover` contestaba un 500 con la
     carátula ya resuelta. Peor: al no quedar nada apuntado, el mismo juego volvía a preguntarle a IGDB en la
     visita siguiente, justo el día que el sistema está más apretado. */
  it('sirve la carátula aunque no se pueda escribir en KV', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // que le toque apuntar también el cupo: los dos `put` fallan
    const kv = kvFalso();
    kv.put.mockRejectedValue(new Error('KV PUT failed: 429 Too Many Requests'));

    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe('jpeg');
  });

  it('si no se ha podido preguntar, no se apunta nada en la caché negativa', async () => {
    fetchSimulado.mockImplementation(async (entrada: Request | string) => {
      const url = String(entrada instanceof Request ? entrada.url : entrada);
      if (url.includes('id.twitch.tv')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 5_000_000 }), { status: 200 });
      }
      return new Response('token rechazado', { status: 401 });
    });

    const kv = kvFalso();
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(404); // para el cliente es «ahora no hay», y por eso va con `no-store`
    expect(kv.datos.has(claveCache('Celeste', []))).toBe(false);
  });
});
