// Red de seguridad de TODA la API: una excepción sin capturar (KV sin cupo, Firestore sin cuota o caído) sale
// como «no disponible ahora» —503 con `unavailable: true` y `Retry-After`— y no como la página 500 de Cloudflare, que
// el cliente no sabe leer (docs/plan-degradacion-servicios.md, fase 3).
//
// SOLO en `functions/api/`, nunca en la raíz de `functions/`: un middleware raíz se ejecutaría también para los
// estáticos, que dejarían de ser gratis y contarían contra las 100.000 invocaciones diarias (lo que se evitó al
// retirar `functions/assets/[[path]]`, ver `public/_redirects`). Corre dentro de la misma invocación que la ruta.
import { unavailable } from '../_lib/http';

export async function onRequest(context: { next: () => Promise<Response> }): Promise<Response> {
  try {
    return await context.next();
  } catch {
    return unavailable();
  }
}
