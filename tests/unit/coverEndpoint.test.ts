// `/cover` — el endpoint que sirve la carátula de un juego (`functions/cover.ts`).
//
// Hasta ahora solo estaban probadas las piezas PURAS del emparejador (ver `igdbCover.test.ts`), y lo que decide
// el gasto de verdad —cuándo se consulta a IGDB, cuándo se gasta cupo y cuántas veces se toca KV— no tenía nada
// que lo sujetara. Cada bloque de aquí fija una de esas decisiones.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { onRequestGet } from '../../functions/cover';
import { claveCache } from '../../functions/_lib/igdbCover';
import { COVER_DAILY_BUDGET, coverDailyQuotaKey, coverExemptionKey } from '../../functions/_lib/keys';

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

/** La misma petición tal y como la manda el navegador cuando la `<img>` cuelga de OTRA web. */
function peticionAjena(consulta: string, ip = '203.0.113.7'): Request {
  return peticion(consulta, ip, { 'Sec-Fetch-Site': 'cross-site' });
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

  /* EL TOPE DEL SERVICIO ENTERO, que es distinto del de la IP y protege otra cosa: el de la IP acota a un
     abusador contra la cuota de IGDB; este acota el gasto de ESCRITURAS de KV, que es diario y lo comparten
     estas carátulas con los enlaces de reseñas. Sin él, unas pocas direcciones podían vaciar el presupuesto del
     día y dejar sin publicar a todo el mundo. */
  it('topa cuando el servicio entero ha gastado su cupo del día', async () => {
    const kv = kvFalso({ [coverDailyQuotaKey(Date.now())]: String(COVER_DAILY_BUDGET) });
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(429);
    expect(consultasAIgdb()).toHaveLength(0);
    // Y la espera que promete es hasta que cambie el DÍA, no la hora: prometer una espera que no va a bastar es
    // peor que decir la verdad.
    const hastaMedianoche = 86400 - (Math.floor(Date.now() / 1000) % 86400);
    expect(Number(respuesta.headers.get('Retry-After'))).toBeCloseTo(hastaMedianoche, -1);
  });

  it('pero con el cupo del día agotado se siguen sirviendo las carátulas ya emparejadas', async () => {
    // Lo que se raciona es RESOLVER, igual que con el tope por IP: navegar una biblioteca llena nunca topa.
    const kv = kvFalso({
      [coverDailyQuotaKey(Date.now())]: String(COVER_DAILY_BUDGET),
      [claveCache('Celeste', [])]: 'co1abc',
    });
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(200);
  });

  it('y el sello del rango más alto levanta también el tope del servicio', async () => {
    // Si no sirviera el día que el servicio llena su cupo, no serviría justo el día que hace falta.
    const kv = kvFalso({
      [coverDailyQuotaKey(Date.now())]: String(COVER_DAILY_BUDGET),
      [coverExemptionKey('203.0.113.7')]: '1',
    });
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(200);
  });

  it('el gasto del día también se apunta por lotes, y más grandes', async () => {
    /* Esta clave la escriben TODAS las peticiones del servicio, no las de una IP: con lotes pequeños, dos
       personas llenando biblioteca a la vez pasarían de una escritura por segundo sobre la misma clave, que es
       lo que KV no admite. */
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const kv = kvFalso();
    await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kv) });

    expect(kv.datos.get(coverDailyQuotaKey(Date.now()))).toBe('50');
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

  /* EL PROXY NO RESUELVE JUEGOS PARA OTRAS WEBS. Sin esto, cualquiera podía colgar `<img src=".../cover?n=…">`
     de su sitio y dejarnos pagando sus consultas a IGDB y sus escrituras de KV. No es una frontera de seguridad
     —`curl` escribe la cabecera que quiera— y por eso sigue habiendo cupo por IP; es el corte barato del caso
     real, que lo hace un navegador y lleva su `Sec-Fetch-Site` puesto. */
  it('no resuelve juegos nuevos pedidos desde otra web', async () => {
    const kv = kvFalso();
    const respuesta = await onRequestGet({ request: peticionAjena('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(403);
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store');
    expect(consultasAIgdb()).toHaveLength(0);
    expect(kv.put).not.toHaveBeenCalled();
    // Ni siquiera llega a mirar el contador de la IP: lo caro se corta antes de gastar nada.
    expect(kv.get.mock.calls.filter(([clave]) => String(clave).startsWith('igdb:cupo:'))).toHaveLength(0);
  });

  it('pero una carátula YA emparejada se sirve venga de donde venga', async () => {
    // Servirla no cuesta ni una consulta ni una escritura, así que negarla rompería enlaces sin ahorrar nada.
    const kv = kvFalso({ [claveCache('Celeste', [])]: 'co1abc' });
    const respuesta = await onRequestGet({ request: peticionAjena('n=Celeste'), env: entorno(kv) });

    expect(respuesta.status).toBe(200);
    expect(consultasAIgdb()).toHaveLength(0);
  });

  it('y el navegador que no manda `Sec-Fetch-Site` sigue pasando', async () => {
    // Safari hasta el 16.4 no la manda. Ante la duda se deja pasar: lo que protege de verdad es el cupo por IP.
    const respuesta = await onRequestGet({ request: peticion('n=Celeste'), env: entorno(kvFalso()) });

    expect(respuesta.status).toBe(200);
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
