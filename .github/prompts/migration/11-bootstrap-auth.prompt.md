# Prompt 11 — Bootstrap & Auth flow

> Adaptado al stack real (React 19 / hooks + Context / IndexedDB en crudo / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** el arranque ya vive en `src/main.tsx` (init perezosa de Firebase en idle + registro
> del service worker) y `src/App.tsx` (orquestación top-level, lazy-load de SocialHub/SettingsHub). **No hay Zustand**
> ni `src/bootstrap/` ni `src/store/`. La autenticación es **Google sign-in** (`signInWithGoogle` en
> `firebaseRepository.ts`); el acceso a Gists usa un **PAT de GitHub que el usuario pega** (no OAuth de GitHub).

## Prerequisites
Prompts 01–10 completos.

## Task
Definir la secuencia de arranque (Auth de Firebase, init de IndexedDB, chequeo de migración, inicio de sync)
sobre el modelo real: estado en hooks/Context, no en un store global Zustand.

## Output files (rutas reales)
- `src/main.tsx`                      — **ya existe**: punto de entrada / init perezosa / SW
- `src/App.tsx`                       — **ya existe**: provee el AppContext y orquesta el arranque
- `src/viewmodel/useAuthViewModel.ts` — nuevo: hook de auth + estado de sesión/migración
- `src/model/repository/firebaseRepository.ts` — auth (extender; `signInWithGoogle` ya existe)

---

## Estado de app (Context, no Zustand)
Reemplazar el "appStore" por un `AppContext` (React Context) + `useReducer`, expuesto vía `useAuthViewModel`/`useSyncViewModel`:
```ts
interface AppState {
  uid: string | null; profileId: string | null; isAuthenticated: boolean; authLoading: boolean;
  migrationNeeded: boolean; migrationRunning: boolean; migrationStep: string | null; migrationError: string | null;
  syncStatus: 'idle'|'syncing'|'ok'|'error'; lastSync: number | null; syncErrors: string[]; queueLength: number; conflicts: SyncConflict[];
  tokenModalOpen: boolean; tokenValid: boolean | null;
  notices: StatusNotice[];   // reutiliza StatusNotice de game.ts (no "Toast")
}
```
Las acciones son `dispatch` del reducer (`setAuth`, `clearAuth`, `setMigrationStep`, `setSyncStatus`, `pushNotice`, …).
Los avisos se autoexpiran con `setTimeout` en el efecto que los gestiona. Sin `immer`/Zustand: spread inmutable.

## `useAuthViewModel.ts`
```ts
export function useAuthViewModel(): {
  signIn(): Promise<void>;        // Google sign-in (Firebase)
  signOut(): Promise<void>;
  state: Pick<AppState,'uid'|'profileId'|'isAuthenticated'|'authLoading'>;
}
```
Listener de Firebase Auth dentro de un `useEffect` (limpieza en el `return`):
1. Obtener el usuario de Firebase.
2. Cargar `LocalMeta` de IndexedDB.
3. Si existe y `meta.uid === user.uid` → reanudar sesión.
4. Si está vacío → `loadOrCreateMeta(user)`.
5. `dispatch(setAuth(uid, profileId))`.
6. `isMigrationNeeded()` → si true, `migrationNeeded = true` (abrir flujo del paso 08/13).
7. Si no hace falta migrar → iniciar el ciclo de sync (`useSyncViewModel`).

`loadOrCreateMeta(user)`:
1. `getPrivateConfig(user.uid)` (recuperar config tras reinstalar).
2. Si existe → restaurar `gamesGistId`, `socialGistId`, `gamesChunks`, `socialChunks` y, si hay
   `encryptedGithubToken`, **descifrarlo en cliente** (clave del store `cryptoKeys`, `core/security/crypto.ts`)
   y guardar el PAT en `LocalMeta.githubToken`. Esto **reemplaza** al actual `recoverGistIdFromGoogle` que
   hoy lee el token en claro de Firestore.
3. Si no → instalación nueva. **No** generar `profileId` aquí (es perezoso, solo al activar lo social).
4. `deviceId = crypto.randomUUID()` si no existe.

> **Nota sobre el listener de Auth:** hoy el código es *pull* (cada componente llama a
> `getCurrentSocialAuthUser()`); no hay `onAuthStateChanged`. Añadir el listener es una mejora opcional,
> pero **no debe** hacer obligatorio el login: sin sesión, las listas y el sync por gist siguen funcionando.

## El PAT de GitHub (no OAuth)
- El token de Gist lo **introduce el usuario** (modal del paso 08/13) y se valida con GET `https://api.github.com/user`.
- Se guarda **solo en IndexedDB** (`LocalMeta.githubToken`); **nunca** se pasa a ninguna función que escriba en Firestore.
- No hay `GithubAuthProvider`/`credentialFromResult`: GitHub aquí no es proveedor de Firebase Auth.

## Secuencia de arranque (en `main.tsx` + `App.tsx`)
1. Abrir IndexedDB vía `idbConnectionRepository` (raw, **no** Dexie).
2. `evictStaleChunks()` para limpiar caché de chunks vieja.
3. Init perezosa de Firebase en idle (conservar lo actual) + registro del service worker.
4. Montar `<App/>` envuelto en `AppContext`; `useAuthViewModel` engancha el listener de Auth.
5. Handler global de `unhandledrejection` → `dispatch(pushNotice({ kind:'err', message }))`.
6. Listener `visibilitychange` → `runSyncCycle()` (gestionado por `useSyncViewModel`, con limpieza en el efecto).

## Constraints
- Sin Zustand, sin `immer`, sin Dexie: Context + `useReducer` + IndexedDB en crudo.
- El `githubToken` se guarda en IndexedDB de inmediato y nunca llega a Firestore.
- Idempotente ante recargas de HMR (no duplicar listeners; limpiar en los `return` de los `useEffect`).
- `tsc --noEmit` debe pasar tras este paso.
