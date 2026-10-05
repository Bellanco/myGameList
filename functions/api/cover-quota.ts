// POST /api/cover-quota — levanta el cupo de carátulas de esta IP para la cuenta de administración.
//
// POR QUÉ ESTO EXISTE. `/cover` raciona lo único que cuesta dinero: RESOLVER un juego nuevo contra IGDB (ver el
// comentario del cupo allí). El tope por IP es la única protección del proxy, así que no puede levantarse con
// nada que el cliente pueda escribirse solo —un parámetro en la URL, una cabecera—: eso sería abrir el proxy a
// cualquiera que lea el código, que es público.
//
// Aquí se levanta con la misma doctrina que la cuota de compartir (ver `_lib/quota.ts`): lo que gobierna
// recursos del SERVICIO se decide en el servidor, con el token ya verificado. Lo decide el claim `admin` de ese
// token (`requireAdmin`), igual que en las reglas y en el panel, y NO el rango: que el administrador lleve además
// mithril es una etiqueta. Lo que el cliente dice de sí mismo no cuenta.
//
// POR QUÉ SE APUNTA LA IP Y NO EL USUARIO. Las carátulas se piden con `<img src>`, que no puede llevar una
// cabecera de sesión. Meter la sesión en la URL la haría distinta para cada persona y con eso se perderían las
// dos cachés que hacen que una carátula se descargue una sola vez para todo el mundo: la del navegador y la del
// service worker, que guarda por URL y sin `Vary`. Así que la petición de la imagen sigue siendo anónima e igual
// para todos, y lo que cambia es el contador de la IP desde la que llega.
//
// LO QUE NO HACE: no da acceso a nada, no cambia qué imagen se sirve ni su calidad, y no salta ningún límite del
// navegador. Solo deja seguir resolviendo juegos nuevos cuando esa IP ya ha gastado su tope de la hora.
import { requireAdmin } from '../_lib/context';
import { fail, json } from '../_lib/http';
import { coverExemptionKey, type Env, type KVNamespace } from '../_lib/keys';

/** El almacén de carátulas no está en el `Env` de compartir: es de este otro servicio. */
interface EnvConCovers extends Env {
  COVERS?: KVNamespace;
}

/**
 * CUÁNTO DURA. Doce horas cubren de sobra una sesión larga —incluido el llenado inicial de una biblioteca
 * grande, que va a ~6 juegos por segundo— y el cliente la renueva cada vez que arranca, así que nadie la nota.
 * Que caduque sola es lo que impide que una IP se quede con el cupo levantado para siempre por haberla usado
 * una vez alguien con rango.
 */
const EXENCION_TTL_S = 12 * 60 * 60;

export async function onRequestPost(context: { request: Request; env: EnvConCovers }): Promise<Response> {
  // Sin sesión, 401; con sesión pero sin el claim, 403. Las dos las responde `requireAdmin`.
  const caller = await requireAdmin(context.request, context.env);
  if (caller instanceof Response) {
    return caller;
  }

  if (!context.env.COVERS) {
    // Igual que en `/cover`: configuración incompleta es fallo nuestro, y 501 lo distingue de una avería.
    return fail(501, 'Las carátulas no están configuradas en este entorno');
  }

  const ip = context.request.headers.get('CF-Connecting-IP') || 'desconocida';
  await context.env.COVERS.put(coverExemptionKey(ip), '1', { expirationTtl: EXENCION_TTL_S });

  return json({ levantado: true, durante: EXENCION_TTL_S });
}
