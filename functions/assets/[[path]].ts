// `/assets/*` — chunks de JS y CSS que emite Vite con el hash del contenido en el nombre.
// Se sirven con el brotli del build cuando el navegador lo acepta (ver `_lib/brotliAsset.ts`), y un fichero que ya
// no existe tiene que dar 404, no el shell de la SPA. El porqué, en `_lib/staleAsset.ts`.
import { brotliOrAsset } from '../_lib/brotliAsset';

export const onRequest = brotliOrAsset;
