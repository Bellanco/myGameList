// GET /api/cover-stats — cuántas carátulas nuevas lleva resueltas hoy el servicio. Solo el administrador.
//
// POR QUÉ EXISTE. `/cover` raciona lo único que cuesta: resolver un juego nuevo contra IGDB, que son consultas a
// la cuota de Twitch y, sobre todo, ESCRITURAS de KV —1.000 al día en el plan gratuito, y ese techo es de la
// CUENTA, así que lo comparten las carátulas y los enlaces de reseñas compartidas—. El tope ya está puesto
// (`COVER_DAILY_BUDGET`), pero sin esto no había forma de saber cuánto se gasta de verdad: el día que se llenara,
// la primera señal habría sido alguien sin poder publicar un enlace.
//
// Y NO BASTA CON EL PANEL DE CLOUDFLARE, que es lo primero que uno piensa. Ese gráfico da las escrituras de la
// cuenta ENTERA, sin separar quién las hace. Lo que hay que saber para decidir es cuál de los dos servicios se
// está comiendo el día, y eso solo lo sabe este contador.
//
// LO QUE NO HACE: no cambia ningún tope ni concede nada. Es una lectura, y por eso es un GET.
import { requireAdmin } from '../_lib/context';
import { fail, json } from '../_lib/http';
import { COVER_DAILY_BUDGET, coverDailyQuotaKey, type Env, type KVNamespace } from '../_lib/keys';

/** El almacén de carátulas no está en el `Env` de compartir: es de este otro servicio (igual que en `/cover`). */
interface EnvConCovers extends Env {
  COVERS?: KVNamespace;
}

export async function onRequestGet(context: { request: Request; env: EnvConCovers }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  if (!context.env.COVERS) {
    // Igual que en `/cover`: configuración incompleta es fallo nuestro, y 501 lo distingue de una avería.
    return fail(501, 'Las carátulas no están configuradas en este entorno');
  }

  const ahora = Date.now();
  const gastado = Number(await context.env.COVERS.get(coverDailyQuotaKey(ahora))) || 0;

  /* El gasto se apunta por lotes de 50 (ver `LOTE_GLOBAL` en `/cover`), así que este número es un promedio con
     grano grueso, no una cuenta exacta. Se devuelve tal cual —y el panel lo dice— porque redondearlo aquí solo
     escondería de dónde viene: para lo que sirve, que es ver si el día se está llenando, sobra con el grano.
     `quedan` nunca baja de cero: el tope es blando y el contador puede pasarse. */
  return json({
    dia: new Date(ahora).toISOString().slice(0, 10),
    gastado,
    techo: COVER_DAILY_BUDGET,
    quedan: Math.max(0, COVER_DAILY_BUDGET - gastado),
  });
}
