# Prompt 05 — Firestore repositories

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12 modular). Diseño destino conservado.
>
> **Punto de partida real:** todo el acceso a Firebase/Firestore vive en
> `src/model/repository/firebaseRepository.ts` (Auth Google, colección `profiles` con doc id = uid,
> colección `recommendations`, Analytics). La inicialización de Firebase es perezosa en `src/main.tsx`.
> **Hoy `profiles` SÍ guarda `email`/`uid`/`social.githubToken`/`social.gamesGistId`.** Este paso lo
> reestructura hacia un **índice público (index-only)** identificado por `profileId`, sacando los datos
> sensibles de Firestore. No existe `src/firebase/`.

## Prerequisites
Prompts 01–04 completos. Importar tipos desde `src/model/types/firestore.ts`.

## Task
Agrupar el acceso a cada colección de Firestore en funciones/objetos repositorio **dentro de
`firebaseRepository.ts`** (no clases sueltas en `src/firebase/`). Todas las llamadas a Firestore del
proyecto pasan por aquí: nada de `setDoc`/`getDoc`/`updateDoc` inline en otros módulos.

## Output file (ruta real)
`src/model/repository/firebaseRepository.ts` — extender con los grupos de funciones de abajo.
La init de Firebase (credenciales `import.meta.env.VITE_FIREBASE_*`) se mantiene donde está
(`main.tsx` perezosa + helpers aquí); exponer `getFirebaseAuth()` que devuelve el usuario actual o lanza.

---

## Grupo Profiles (índice público — `profiles/{profileId}`)

```ts
// Crea/reemplaza el doc público. Valida que no haya campos privados antes de escribir.
upsertProfileIndex(doc: ProfileIndexDoc): Promise<void>
// Update parcial; valida que el patch no traiga campos privados.
patchProfileIndex(profileId: string, patch: Partial<ProfileIndexDoc>): Promise<void>
// Lee un perfil público. null si no existe o es privado.
getProfileIndex(profileId: string): Promise<ProfileIndexDoc | null>
// Actualiza solo socialChunks + updatedAt (tras crear un overflow social).
updateProfileChunks(profileId: string, chunks: ChunkRef[]): Promise<void>
// Actualiza solo el subobjeto stats + updatedAt.
updateProfileStats(profileId: string, stats: ProfileIndexDoc['stats']): Promise<void>
// Listado/búsqueda del directorio (conserva listSocialDirectory / findSocialProfileByEmail).
listSocialDirectory(...): Promise<ProfileIndexDoc[]>
```

Validación (usada en `upsertProfileIndex` y `patchProfileIndex`):
```ts
const FORBIDDEN_FIELDS = [
  'uid', 'email', 'githubToken', 'gamesGistId',
  'score', 'hours', 'steamDeck', 'retry', 'replayable', 'review',
] as const;
function assertNoPrivateFields(data: Record<string, unknown>): void {
  for (const f of FORBIDDEN_FIELDS) if (f in data) throw new Error(`Campo prohibido "${f}" en escritura a Firestore`);
}
```
Llamar `assertNoPrivateFields` al inicio de toda escritura a `profiles`/`feed`.

> **Nota:** hay **dos guardas distintas, una por destino** (no son la misma función):
> - Firestore (aquí): `FORBIDDEN_FIELDS` incluye `uid`/`email`/`githubToken`/`gamesGistId` (además de review/score/…).
> - Gist social (paso 04): `PRIVATE_FIELDS` solo cubre `review`/`score`/`hours`/`steamDeck`/`retry`/`replayable`.
> Mantenerlas separadas (p. ej. `assertNoFirestorePrivateFields` vs `assertNoSocialPrivateFields`) para evitar confusión.

---

## Grupo Feed (`feed/{reviewId}`)

```ts
upsertFeedCard(card: FirestoreFeedCard): Promise<void>     // valida sin campos privados + snippet ≤ 160
hideFeedCard(reviewId: string): Promise<void>              // status='hidden' (no borra)
deleteFeedCard(reviewId: string): Promise<void>            // borrado duro (al revocar consentimiento)
getFeedPage(limit: number, cursor?: DocumentSnapshot): Promise<{ items: FirestoreFeedCard[]; nextCursor: DocumentSnapshot | null; hasMore: boolean }>
batchUpsertFeed(cards: FirestoreFeedCard[]): Promise<void> // batches ≤ 499; valida cada tarjeta
deleteAllFeedByProfile(profileId: string): Promise<void>   // al borrar la cuenta
```
Validación en `upsertFeedCard`: `assertNoPrivateFields(card)`, `if (card.snippet.length > 160) throw …`, `if ('review' in card) throw …`.

---

## Grupo PrivateConfig (`privateConfig/{uid}` — solo el dueño)

```ts
getPrivateConfig(uid: string): Promise<FirestorePrivateConfig | null>   // request.auth.uid == uid
setPrivateConfig(uid: string, config: FirestorePrivateConfig): Promise<void>
addPrivateChunk(uid: string, type: 'games' | 'social', chunk: ChunkRef): Promise<void>
```
> **`privateConfig` guarda ids de gist + chunks + profileId + `encryptedGithubToken`** (token **cifrado**
> en cliente; Firestore nunca ve el token en claro). El token de uso vive en IndexedDB (`LocalMeta`); el
> texto cifrado en `privateConfig` solo sirve para **recuperar** tras reinstalar (paso 11). Es el mapa privado
> uid→profileId. `assertNoPrivateFields` **no** aplica a `privateConfig` (es solo-dueño, no público).

---

## Recordatorio de reglas (comentario para el desarrollador, no código)

Bloque de comentario al inicio del módulo (las reglas reales se escriben en el paso 10):
```ts
/**
 * profiles/{profileId}:      read: private==false && consent.autoExpireAt>now ; write: isOwner && !privateFields
 * feed/{reviewId}:           read: status=='active' && expiresAt>now          ; write: isOwner && snippet≤200 && !review
 * privateConfig/{uid}:       read/write: request.auth.uid == uid
 * recommendations/{id}:      según destinatario/emisor
 */
```

## Constraints
- Exportar singletons / funciones; sin acceso inline a Firestore fuera de este módulo.
- Este módulo no importa de la ruta de gists; coordina el `SyncManager` (paso 06).
- Operaciones batch en lotes ≤ 499 (límite de Firestore); `batchUpsertFeed` valida cada tarjeta.
- Auth: solo Google sign-in (conservar `signInWithGoogle`).
- `tsc --noEmit` debe pasar tras este paso.
