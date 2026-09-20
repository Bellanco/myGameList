// GET /api/premios — la foto del calendario de la porra, para decidir si se ofrece la entrada. PÚBLICO.
// PUT /api/premios — la escribe el administrador desde el panel.
//
// ⚑ POR QUÉ ESTO NO SE LEE DE FIRESTORE, que es donde vive el calendario de verdad (`premiosConfig/voting`).
// Por lo mismo que el aviso a los usuarios: esta respuesta la necesita TODO EL MUNDO al abrir la app —el menú de
// Ajustes y el botón del espacio social son cromo del arranque, los ve también quien usa sus listas sin cuenta—
// y una lectura de Firestore desde el navegador es una petición a `firestore.googleapis.com`. La política de
// cookies promete que abrir la app sin sincronizar y sin sesión NO contacta con ningún servidor ajeno, y hay un
// test de extremo a extremo que lo comprueba (`tests/e2e/smoke.test.ts`). Sirviéndolo desde aquí: mismo origen,
// cero terceros y ni una lectura de Firestore por usuario y sesión.
//
// LO QUE SE GUARDA SON LAS FECHAS, no un «sí/no» ya resuelto: quien pregunta aplica `shouldOfferPremios` con su
// propia hora, así que la respuesta caduca sola el día que se cierra la votación sin que nadie toque nada. El
// contrato vive en `src/core/premios/visibilitySnapshot.ts` y lo comparten cliente, función y servidor de
// desarrollo, para que los tres no puedan discrepar.
import { requireAdmin } from '../_lib/context';
import { json, readJson } from '../_lib/http';
import type { Env } from '../_lib/keys';
import {
  EMPTY_PREMIOS_SNAPSHOT,
  sanitizePremiosSnapshot,
} from '../../src/core/premios/visibilitySnapshot';

/** La clave de KV. Una sola: hay un calendario a la vez. */
const KEY = 'premios-visibility';

/**
 * Cuánto se queda en las cachés del borde y del navegador.
 *
 * Cinco minutos, como el aviso. Abrir una edición es un gesto de una vez al año y lo que se enseña es una
 * entrada de menú: que tarde unos minutos en aparecerle a quien ya tenía la app abierta es exactamente lo que
 * hay que cambiar por no pedir esto en cada apertura.
 */
const CACHE_SECONDS = 300;

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  if (!context.env.SHARES) {
    // Sin KV no hay nada que ofrecer, y no es un error de quien llama: se responde la foto vacía y la app sigue
    // como si no hubiera edición.
    return json(EMPTY_PREMIOS_SNAPSHOT, 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
  }

  const raw = await context.env.SHARES.get(KEY, 'json');
  return json(sanitizePremiosSnapshot(raw), 200, { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
}

export async function onRequestPut(context: { request: Request; env: Env }): Promise<Response> {
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  const clean = sanitizePremiosSnapshot(await readJson(context.request));
  await context.env.SHARES.put(KEY, JSON.stringify(clean));
  // Se devuelve lo que ha quedado GUARDADO, no lo que llegó: el panel pinta eso y no puede creerse un recorte
  // que no se hizo.
  return json(clean);
}
