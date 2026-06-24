# Prompt 07 — ViewModels migration

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** los ViewModels son **custom hooks** `use*ViewModel` en `src/viewmodel/`
> (no clases, no Zustand, no Dexie liveQuery). Ya existen `useGameListViewModel.ts` y `useSyncViewModel.ts`.
> El estado se lleva con `useState`/`useReducer`; la reactividad tras escrituras se logra re-consultando
> IndexedDB y/o vía `BroadcastChannel`. Los componentes consumen estos hooks; los hooks llaman a los
> repositorios de `src/model/repository/`.

## Prerequisites
Prompts 01–06 completos.

## Task
Crear/migrar los ViewModels como hooks que reflejan el nuevo modelo. Leen de IndexedDB
(vía repositorios); nunca llaman a la API de gist ni a Firestore directamente.

## Output files (rutas reales)
- `src/viewmodel/useGameListViewModel.ts`    — **ya existe**: extender
- `src/viewmodel/useGameDetailViewModel.ts`  — nuevo
- `src/viewmodel/useSocialFeedViewModel.ts`  — nuevo
- `src/viewmodel/useUserProfileViewModel.ts` — nuevo
- `src/viewmodel/useSyncViewModel.ts`        — **ya existe**: estado de sync (sustituye a "SyncStatusViewModel")

## Contrato (patrón hook, no clase)
Cada ViewModel es una función `use*ViewModel(...)` que devuelve `{ state, ...handlers }`.
- Carga inicial en `useEffect` (al montar).
- Suscripción a cambios vía `BroadcastChannel`/re-query; **limpieza en el `return` del `useEffect`**.
- Inmutabilidad: spread/clone, nunca mutar estado.

---

## `useGameListViewModel.ts` (extender)
Lista con filtro/orden/agrupación. `state`:
```ts
interface GamesListState {
  games: GameItem[]; filtered: GameItem[]; loading: boolean; error: string | null;
  filter: { tab: TabId | 'all'; query: string; sortBy: 'name'|'rating'|'year'|'modified'; sortDir: 'asc'|'desc' };
}
```
Handlers: `setFilter(patch)`, `setQuery(query)` (debounce 250ms vía `useDebouncedValue`), `setSortBy(key,dir)`,
`getByTab(tab: TabId): GameItem[]`, `getStats(): { completed; excluded; pending; avgScore }`.
**Clave:** `review` está disponible aquí (texto completo desde IndexedDB). El ViewModel **NO** computa `snippet`
(eso lo hace `toPublicGame` en la publicación social, paso 04).

## `useGameDetailViewModel.ts` (nuevo)
`state`: `{ game: GameItem | null; loading; error; isSaving; hasUnsaved }`.
Handlers:
```ts
load(id: number): Promise<void>
save(patch: Partial<GameItem>): Promise<void>   // upsertGame + encola SyncOp
remove(): Promise<void>                         // deleteGame + encola SyncOp
toggleShare(): Promise<void>                     // invierte game.shared, guarda
getSnippetPreview(): string                      // solo lectura: review.slice(0,160).trimEnd()
```
`save` debe: (1) validar que el patch **no** trae `snippet` (lanzar `TypeError` si aparece);
(2) `upsertGame({ ...game, ...patch })`; (3) `upsertGame` ya encola el `SyncOp`.

## `useSocialFeedViewModel.ts` (nuevo)
Feed del hub social. Lee de Firestore vía el repositorio de feed.
`state`: `{ cards: FirestoreFeedCard[]; loading; loadingMore; error; hasMore; cursor }`.
Handlers: `load()`, `loadMore()`, y:
```ts
// review completo SOLO para el usuario actual; para otros, solo el snippet de la tarjeta.
getFullReview(card: FirestoreFeedCard, currentProfileId: string): string
```
Lógica: si `card.profileId === currentProfileId` → buscar el juego en IndexedDB por `card.gameId` y devolver `game.review`;
si no → devolver `card.snippet`. Comentar **por qué nunca** se accede al gist privado de otros usuarios.

## `useUserProfileViewModel.ts` (nuevo)
Perfil público + lista de juegos desde el gist social de un usuario.
`state`: `{ profile: SocialProfile|null; games: PublicGame[]; activityFeed: ActivityFeedItem[]; loading; loadingMore; error; isOwnProfile; hasMoreChunks }`.
Handlers: `load(profileId, socialGistId)`, `loadMoreGames()`, `loadMoreFeed()`.
`load`: `readSocialGist(socialGistId)` (ancla `myGameList.social.json`) → set state; si `chunkIndex.chunks.length>1` → `hasMoreChunks=true` sin traer aún.
`loadMoreGames`: siguiente chunk no cargado → `readSocialChunk(chunkRef)` → merge por `updatedAt` desc.

## `useSyncViewModel.ts` (ya existe — extender)
Expone el estado de sync a la UI. `state` añade: `{ lastPull; lastPush; isSyncing; errors: string[]; conflicts: SyncConflict[]; queueLength }`.
Handlers: `resolveConflict(gameId: number, winner: 'local'|'remote')`, `clearErrors()`, `forceSync()` (llama `runSyncCycle` saltando cooldown).

---

## Notas de migración de ViewModels existentes
1. Eliminar cualquier cómputo de `snippet` dentro del ViewModel (pertenece a `toPublicGame`, paso 04).
2. Sustituir el uso de `review` para mostrar en el feed social por `getFullReview(card, currentProfileId)`.
3. Quitar cualquier llamada directa a la API de gist o a Firestore desde los ViewModels.

## Constraints
- Hooks de React; sin clases, sin Zustand, sin Dexie liveQuery.
- Los hooks llaman a repositorios de `src/model/repository/`; los **componentes** nunca importan repositorios.
- `useGameDetailViewModel.save()` lanza `TypeError` si el patch contiene `snippet`.
- Limpieza de efectos (intervalos, BroadcastChannel, listeners) en el `return` del `useEffect`.
- `tsc --noEmit` debe pasar tras este paso.
