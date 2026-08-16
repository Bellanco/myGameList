// `/assets/*` — chunks de JS y CSS que emite Vite con el hash del contenido en el nombre.
// Un fichero que ya no existe tiene que dar 404, no el shell de la SPA. El porqué, en `_lib/staleAsset.ts`.
import { assetOrNotFound } from '../_lib/staleAsset';

export const onRequest = assetOrNotFound;
