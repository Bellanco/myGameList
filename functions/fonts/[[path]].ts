// `/fonts/*` — fuentes propias, con el hash del contenido en el nombre (scripts/vendor-fonts.mjs).
// Mismo trato y mismo motivo que `/assets/*`: llevan `immutable` en `public/_headers`, así que servirles el
// shell por error también envenena la caché del navegador durante un año. Ver `_lib/staleAsset.ts`.
import { assetOrNotFound } from '../_lib/staleAsset';

export const onRequest = assetOrNotFound;
