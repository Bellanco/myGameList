# Prompt 06 — SyncManager

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** la sincronización ya está repartida en
> `src/model/repository/syncRepository.ts` (merge CRDT por `_ts`), `syncMachineRepository.ts`
> (throttle/backoff/máquina de estados) y `syncStateRepository.ts` (estado dirty persistido).
> El ciclo lo conduce el hook `src/viewmodel/useSyncViewModel.ts` (`SyncStatus = 'idle'|'syncing'|'ok'|'error'`).
> **No hay Zustand**: los eventos a la UI van por `onNotice`/`StatusNotice` y estado de React.

## Prerequisites
Prompts 01–05 completos.

## Task
Evolucionar el orquestador de sync: único punto que coordina IndexedDB ↔ gist de juegos ↔ gist social ↔ Firestore.
Los ViewModels nunca llaman a sync directamente: encolan `SyncOp` y el orquestador los procesa.

## Output files (rutas reales)
- `src/model/repository/syncRepository.ts`        — `runSyncCycle` y los pasos del ciclo
- `src/model/repository/syncMachineRepository.ts` — cooldown/backoff/lock (ya existe)
- `src/model/repository/syncStateRepository.ts`   — persistencia de estado dirty (ya existe)
- el arranque/parada del ciclo y los listeners se cablean desde `useSyncViewModel.ts` (useEffect + cleanup)

---

## Constants
```ts
const GIST_COOLDOWN_MS   = 60_000;    // mínimo entre pulls de gist
const BATCH_DELAY_MS     = 5_000;     // acumular cambios 5s antes de push
const MAX_QUEUE_AGE_MS   = 300_000;   // forzar flush si la cola tiene 5min
const MAX_RETRY_ATTEMPTS = 3;
```

## Punto de entrada
```ts
export async function runSyncCycle(): Promise<SyncCycleResult>   // seguro de llamar en cada visibilitychange; usa lock

interface SyncCycleResult {
  gistPulled: boolean; gistPushed: boolean; socialPublished: boolean; firestoreUpdated: boolean; errors: Error[];
}
```

## ⚠️ Requisito de sincronización cross-device (NO regresionar)
> **Bug raíz del código actual a NO repetir:** hoy las rutas automáticas (`refreshRemote`/`initializeSync`)
> hacen *early return* en `304 notModified` y **no empujan los cambios locales pendientes**, así que una
> edición en un dispositivo no llega a los demás hasta pulsar "Sincronizar ahora" manualmente.
> **En el nuevo SyncManager:** un `304` (remoto sin cambios) **NO** debe abortar el ciclo si hay cola/dirty
> pendiente — debe continuar al paso de **push**. La eficiencia (ETag/304, cooldown, chunking) reduce
> transferencia, pero **nunca** debe impedir propagar un cambio local. Además, encolar un push **debounced**
> (`BATCH_DELAY_MS`) tras cada edición para propagar en segundos, sin esperar al poll.

## Pasos del ciclo (en este orden)
1. **Pull gist de juegos** — `maybePullGames(meta)`: saltar el *fetch* si `Date.now()-meta.lastGistPull < GIST_COOLDOWN_MS`;
   `pullGames(meta)`; en 304 actualizar `lastGistPull` **y continuar** (no abortar el ciclo: aún puede haber push pendiente);
   devolver si cambió algo.
2. **Procesar cola** — `shouldFlushQueue(meta, queue)`: true si la cola no está vacía Y (antigüedad del op más viejo > `MAX_QUEUE_AGE_MS` O del último > `BATCH_DELAY_MS`).
3. **Push gist de juegos** — `pushGamesIfNeeded(meta)`: `pushGames(meta)`; al OK, limpiar de syncQueue los `upsertGame`/`deleteGame`.
4. **Publicar gist social** — `publishSocialIfNeeded(meta)`: tomar juegos públicos (`shared===true`) modificados desde `meta.lastFirestorePush`; si ninguno, saltar; `publishSocial(meta)`.
5. **Actualizar índice Firestore** — `updateFirestoreIfNeeded(meta, changedGames: GameItem[])`:
   - Filtrar a `shared === true`.
   - Por cada uno con `review.length > 0`: construir `FirestoreFeedCard` (solo snippet, sin review) y `batchUpsertFeed`. Si el review se vació, `hideFeedCard`.
   - `updateProfileStats(profileId, stats)`; `patchMeta({ lastFirestorePush })`.

## Resolución de conflictos (en el pull)
Cuando `mergeRemoteGames` detecte mismo `_v` pero contenido distinto (edición concurrente real),
guardar un `SyncConflict` en un object store propio de IndexedDB (definirlo en `idbConnectionRepository.ts`)
y notificar a la UI vía `onNotice`/estado de `useSyncViewModel` (no Zustand) para abrir un diálogo de resolución.
```ts
interface SyncConflict {
  id: string; gameId: number; detectedAt: number;
  local: Partial<GameItem>; remote: Partial<GameItem>; resolved: boolean;
}
```

## Ciclo de vida (desde `useSyncViewModel.ts`)
En lugar de funciones globales `start/stop`, el hook gestiona el ciclo con `useEffect`:
- Un intervalo que llama `runSyncCycle` cada 30s.
- Listener `visibilitychange` → `runSyncCycle` inmediato al volver visible.
- Listener `beforeunload` → push best-effort si la cola no está vacía.
- **Limpieza obligatoria** en el `return` del `useEffect` (clear interval, removeEventListener, cerrar BroadcastChannel).

## Error handling
- Cada paso en su propio try/catch; un fallo en el paso N no impide el N+1; errores acumulados en `SyncCycleResult.errors`.
- `GistError` con `retryable:false` → aviso vía `StatusNotice`/`onNotice`. Errores de red siempre retryables.

## Compatibilidad con el merge existente (OBLIGATORIO)
> El merge CRDT real (`syncRepository.ts → mergeCrdt`) espera un **`TabData` plano**
> (`c/v/e/p/deleted/updatedAt`), resuelve **por `_ts`** y en empate **gana el local** (`>=`).
> **No** usa `_v` ni `deletedAt` hoy.
- La **desenvoltura** de `GamesMainFile`/chunks ocurre en `readGist` (paso 03) **antes** del merge:
  `mergeCrdt` debe seguir recibiendo `TabData` plano. **No** meter lógica de chunks dentro del merge.
- La **resolución de conflictos por `_v`** (este paso) es comportamiento **nuevo**: añadirla como capa
  adicional sin alterar la semántica `_ts` existente (si `_v` no está presente, comportarse exactamente como hoy).
- `_v`/`deletedAt` son aditivos; si faltan, el merge funciona igual que en la versión actual.

## Constraints
- Lock (flag booleano simple) para evitar ciclos concurrentes.
- Nunca llamar `publishSocial` si `pushGames` falló (inconsistencia de datos).
- El orquestador no importa de ningún ViewModel (la dependencia es al revés).
- Tras un cambio de formato del gist, forzar el primer ciclo (ignorar etag) — ver paso 03.
- `tsc --noEmit` debe pasar tras este paso.
