// GET    /api/announcement — el aviso en curso. PÚBLICO y sin sesión.
// GET    /api/announcement?history=1 — los avisos anteriores (el más reciente primero). Solo el administrador.
// PUT    /api/announcement — lo escribe el administrador.
// DELETE /api/announcement — lo retira del todo.
//
// ⚑ POR QUÉ ESTO NO VIVE EN FIRESTORE, que es donde vive el resto de la configuración del panel
// (`appConfig/achievements`). Porque este documento lo tiene que leer TODO EL MUNDO al abrir la app —también
// quien usa las listas sin cuenta— y una lectura de Firestore desde el navegador es una petición a
// `firestore.googleapis.com`. La política de cookies promete que abrir la app y usar tus listas, sin sincronizar
// y sin iniciar sesión, NO contacta con ningún servidor ajeno; y no es una promesa escrita y olvidada: hay un
// test de extremo a extremo que la comprueba (`tests/e2e/smoke.test.ts`, «una visita anónima no contacta con
// terceros»). Servirlo desde aquí lo deja todo en su sitio: mismo origen, cero terceros, y además ni una lectura
// de Firestore por sesión y por usuario.
//
// VIVE EN KV, con la misma atadura que el resto de esta API: una clave, un valor JSON. El saneado NO se
// reimplementa aquí — se importa el del núcleo (`src/core/announcement/announcement.ts`), que es un módulo sin
// dependencias de navegador—, así que el servidor y el cliente no pueden discrepar sobre qué es un aviso válido.
// Es lo mismo que ya se hace con `src/core/constants/tiers.ts`.
import { requireAdmin } from '../_lib/context';
import { fail, json, readJson } from '../_lib/http';
import type { Env } from '../_lib/keys';
import {
  pushAnnouncementHistory,
  sanitizeAnnouncement,
  sanitizeAnnouncementHistory,
} from '../../src/core/announcement/announcement';

/** La clave de KV. Una sola: hay un aviso a la vez, y publicar uno nuevo sustituye al anterior. */
const KEY = 'announcement';

/**
 * EL HISTORIAL: los avisos anteriores, el más reciente primero (como mucho `ANNOUNCEMENT_HISTORY_MAX`). Se escribe
 * SOLO cuando cambia la campaña —el aviso guardado tenía otro `id`—: corregir una errata, encender o apagar no lo
 * tocan, así que cuesta una escritura de KV más por campaña nueva, que son unas pocas al año. Lo lee solo el panel,
 * para reutilizar una redacción.
 */
const HISTORY_KEY = 'announcement:history';

/**
 * Cuánto puede quedarse el aviso en las cachés del borde y del navegador.
 *
 * Cinco minutos: un aviso se toca dos veces al año y su ciclo de insistencia se mide en horas, así que servirlo
 * de caché no cambia lo que ve nadie y ahorra una lectura de KV por apertura de la app. El cliente guarda además
 * el último aviso leído bien (ver `announcementRepository`) y lo enseña si esta función no responde.
 */
const CACHE_SECONDS = 300;

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  if (new URL(context.request.url).searchParams.get('history') === '1') {
    const caller = await requireAdmin(context.request, context.env);
    if (caller instanceof Response) {
      return caller;
    }
    // `requireAdmin` ya exige KV; aquí no hay caché pública que valga: es del panel y cambia al publicar.
    return json(sanitizeAnnouncementHistory(await context.env.SHARES.get(HISTORY_KEY, 'json')));
  }

  if (!context.env.SHARES) {
    // Sin KV no hay aviso, y no es un error del que llama: se responde «no hay» y la app sigue como si nada.
    return json(null, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
  }

  const raw = await context.env.SHARES.get(KEY, 'json');
  // Se sanea TAMBIÉN al leer: lo que hay en KV lo escribió esta misma función, pero un valor de una versión
  // anterior (o escrito a mano desde el panel de Cloudflare) no puede llegar al navegador sin pasar el filtro.
  return json(sanitizeAnnouncement(raw), 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
}

export async function onRequestPut(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  const body = await readJson(context.request);
  const clean = sanitizeAnnouncement(body);
  if (!clean) {
    // El saneado devuelve `null` por tres motivos y los tres son lo mismo para quien escribe: el aviso no tiene
    // con qué existir. El panel ya no deja pulsar sin título ni enlace, así que esto es la red de debajo.
    return fail(400, 'El aviso necesita un identificador, un título y un enlace http(s)');
  }

  const previous = sanitizeAnnouncement(await context.env.SHARES.get(KEY, 'json'));
  await context.env.SHARES.put(KEY, JSON.stringify(clean));
  // Después de guardar el aviso, y sin dejar que un fallo aquí lo deshaga: el historial es un extra del panel.
  const history = pushAnnouncementHistory(
    sanitizeAnnouncementHistory(previous && previous.id !== clean.id ? await context.env.SHARES.get(HISTORY_KEY, 'json') : []),
    previous,
    clean,
  );
  if (history) {
    try {
      await context.env.SHARES.put(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Sin cupo de escrituras, por ejemplo: el aviso ya está publicado, y eso es lo que importa.
    }
  }
  // Se devuelve lo que ha quedado GUARDADO, no lo que llegó: el panel pinta eso y así no puede creerse un
  // recorte que no se hizo.
  return json(clean);
}

export async function onRequestDelete(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }
  await context.env.SHARES.delete(KEY);
  return json({ ok: true });
}
