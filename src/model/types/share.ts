// Reseñas compartidas con enlace público (ver docs/plan-compartir-resenas.md).
//
// QUÉ ES ESTO Y EN QUÉ SE DIFERENCIA DEL CANAL SOCIAL: el gist social publica un `snippet` de ≤160 caracteres y
// nunca el texto completo. Aquí SÍ va la reseña entera, porque el usuario ha pedido explícitamente publicar ESA
// pieza concreta, con caducidad y pudiendo retirarla. Es la única puerta por la que un `review` sale del ámbito
// privado, y por eso el esquema de `model/schemas/shareSchema.ts` es una allowlist estricta.
//
// DÓNDE VIVE: en Cloudflare KV, no en los Gists (no gastar los límites de GitHub ni engordar lo que descargan
// los amigos en cada hidratación del feed) ni en Firestore (un documento de lectura pública entrega TODOS sus
// campos, así que no podría llevar el uid sin filtrar identidad).
import type { ShareQuota } from '../../core/constants/tiers';

/**
 * El artículo público, tal cual se guarda en `share:{token}` y se sirve a quien abre el enlace.
 *
 * NO LLEVA IDENTIDAD: ni `uid`, ni correo, ni identificadores de gist, ni `profileId`. Tampoco `hours` ni el
 * resto de campos privados. Lo que hay aquí lo lee cualquiera que tenga el enlace, así que la lista es
 * exactamente esta y se valida antes de guardar.
 *
 * Tampoco lleva la FOTO del autor, y no por olvido: ocultarla al pintar no serviría de nada, porque el JSON
 * llegaría igual al navegador de un desconocido. Fuera del payload no hay nada que filtrar.
 */
export interface SharedReview {
  v: 1;
  gameId: number;
  gameName: string;
  grade: number | null; // nota fina 0–100, la misma que ya se publica en el canal social
  rating: number | null; // espejo 0–5
  review: string; // el texto completo
  platforms: string[];
  genres: string[];
  strengths: string[];
  weaknesses: string[];
  authorNick: string; // el nick del perfil, NUNCA el nombre de la cuenta de Google ni el correo
  reviewedAt: number; // fecha de la reseña
  createdAt: number; // cuándo se compartió
  expiresAt: number; // cuándo deja de estar accesible
}

/**
 * Entrada del índice privado del propietario (`user:{uid}:{token}`). Es lo que alimenta la pantalla de gestión y
 * el recuento de cuota, así que lleva lo justo para pintar una fila sin releer el artículo entero.
 */
export interface SharedReviewIndexEntry {
  token: string;
  gameId: number;
  gameName: string;
  createdAt: number;
  expiresAt: number;
}

/** Veto de compartir (`ban:{uid}`). Lo pone y lo quita el administrador; lo aplica la Function. */
export interface ShareBan {
  reason?: string;
  bannedAt: number;
  by: string; // correo del administrador que lo puso, para que quede rastro de quién decidió qué
}

/**
 * Lo que devuelve `GET /api/share/mine`: los enlaces del usuario, su cuota ya resuelta (rango + ajuste
 * individual) y, si lo hubiera, su veto. El cliente pinta con esto el contador y el estado del botón.
 */
export interface MySharesResponse {
  shares: SharedReviewIndexEntry[];
  quota: ShareQuota;
  ban: ShareBan | null;
}
