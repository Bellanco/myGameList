# Prompt 08 — Data migration script

> Adaptado al stack real (React 19 / hooks / IndexedDB / SCSS / Firebase v12). Diseño destino conservado.
>
> **Punto de partida real:** el formato de juegos actual **ya** es arrays por pestaña `c|v|e|p` (`TabData`)
> con reloj `_ts` e `id: number`. La normalización de formas legacy vive en
> `src/model/repository/migrateRepository.ts`. **No** hay que convertir `id` a UUID: lo que esta migración
> introduce es el `profileId` público, el **snippet split**, y sacar `githubToken`/`email` de Firestore.
> **No hay Zustand**: los eventos de UI van por callbacks/Context.

## Prerequisites
Prompts 01–07 completos.

## Task
Script one-time que lleva los datos existentes a la arquitectura nueva, en el primer arranque tras la
actualización. Idempotente y con modo dry-run.

> ⚠️ **DOS VÍAS INDEPENDIENTES — no acoplar.**
> - **Vía A (LOCAL/GIST) — se ejecuta para TODOS, incluso sin Google y sin Firestore:** upgrade del esquema
>   de IndexedDB (`myGameList` v2→v3, conservando `appState`/`cryptoKeys`) y, si se cambia el formato del gist,
>   el upgrade de formato del gist de juegos. Esta vía **NO** debe requerir sesión Google ni `profileId`.
> - **Vía B (FIRESTORE/SOCIAL) — solo si hay sesión Google y existe doc antiguo:** generar `profileId`,
>   reubicar el token (cifrado) a `privateConfig`, normalizar el doc público. Si no hay sesión / no hay doc,
>   **saltar la vía B por completo** y dejar la app plenamente usable en modo local/gist.
> - **`profileId` es perezoso:** se genera al activar lo social (vía B), **nunca** en el primer arranque de un
>   usuario solo-local.

## Output file (ruta real)
`src/model/repository/migrateRepository.ts` — extender con el runner y los pasos
(reutilizar la normalización de formato ya presente). El disparo desde la app se cablea en `App.tsx`/bootstrap (paso 11).

---

## Pasos (en orden, secuenciales)

### 0 — ¿Hace falta migrar? `isMigrationNeeded(): Promise<boolean>`
- Leer `migrationVersion` del store `meta`. Si `>= 3` → ya migrado, false.
- Si existe payload legacy en localStorage → migración necesaria.
- Si no hay legacy y el store `games` está vacío → instalación nueva, false.

### 1 — Token GitHub `ensureToken(oldMeta): Promise<string>` (vía A — sin Google)
> Hoy el token está en `profiles.social.githubToken` (en claro). El destino lo saca del doc público
> y lo guarda **cifrado** (decisión tomada: ver paso 2). Esta función NO requiere Google.
1. Si ya hay token en IndexedDB (`LocalMeta.githubToken`), usarlo.
2. Si no, e **internamente** hay un token recuperable (de meta legacy), usarlo y guardarlo en IndexedDB.
3. Solo si no hay ninguno, pedir un PAT nuevo con scope `gist` (modal vía Context/callback, **no Zustand**),
   validar con GET `https://api.github.com/user`, guardarlo en IndexedDB.
4. El token vive **siempre** en IndexedDB; el respaldo en Firestore va **cifrado** (paso 2).

### 2 — Migrar doc Firestore `migrateFirestoreDocument(uid): Promise<{ profileId; socialGistId; gamesGistId }>` (vía B — solo con Google)
**Solo si hay sesión Google y existe `profiles/{uid}` antiguo.** Si no, saltar.
Leer el doc actual `profiles/{uid}` (con `email`/`uid`/`social.githubToken`/`social.gamesGistId`). Luego:
1. `profileId = crypto.randomUUID()`.
2. **Cifrar el token en cliente** con `core/security/crypto.ts` → `encryptedGithubToken`.
   > Contrato esperado de `crypto.ts`: `encrypt(plaintext: string): Promise<string>` / `decrypt(ciphertext: string): Promise<string>`
   > usando una clave (WebCrypto AES-GCM) persistida en el store `cryptoKeys` de IndexedDB, **nunca subida**.
   > Reutilizar las funciones existentes si ya las hay; si no, añadirlas ahí (el store `cryptoKeys` ya existe).
3. Crear `privateConfig/{uid}` = `{ profileId, gamesGistId, socialGistId, gamesChunks: [], socialChunks: [], encryptedGithubToken }`
   (token **cifrado**, nunca en claro). Esto preserva la recuperación tras reinstalar (ver paso 11).
4. Crear/normalizar el índice público `profiles/{profileId}` (`ProfileIndexDoc`, sin campos privados).
5. Borrar del doc viejo los campos sensibles en claro: `social.githubToken`, `email`, `social.gamesGistId`, `etag` (`deleteField()`).
> Resultado: Firestore nunca guarda el token en claro; solo el texto cifrado en `privateConfig` (solo dueño).

### 3 — Migrar gist de juegos `migrateGamesGist(gamesGistId, token): Promise<number>`
1. Traer `myGames.json` del gist actual.
2. Parsear el formato actual (arrays `c|v|e|p` = `TabData`) — normalizar con `migrateRepository`.
3. Por cada juego: **conservar `id: number`** (no UUID); conservar `_ts`; fijar `_v = 1` y `shared = false` (opt-in posterior);
   asegurar que **no** hay `snippet` (es de la capa social); asegurar que `review` está presente.
4. Insertar en IndexedDB vía `upsertGame`.
5. PATCH del gist con el `myGames.json` nuevo (`GamesMainFile`).
6. Devolver el número de juegos migrados.

> La pestaña (`TabId`) ya es `c|v|e|p`; no hay remapeo de estados. `detectFormat()` solo distingue
> entre el `TabData` plano actual y posibles variantes legacy; si es desconocido, lanzar error guiado.

### 4 — Gist social desde cero `createSocialGist(profileId, token, games): Promise<string>`
1. POST a `GIST_API` creando un gist **público** con `myGameList.social.json` vacío (`SocialGistData`).
2. Guardar el `socialGistId` en IndexedDB y `privateConfig`.
3. `publishSocial(meta)` para poblarlo con los juegos públicos actuales (al inicio ninguno: sección vacía, correcto).
**No** reconstruir el gist social desde el gist de perfil viejo (puede traer datos rancios): empezar limpio, opt-in por juego.

### 5 — Completar `completeMigration(): Promise<void>`
- `migrationVersion = 3` en meta; log; emitir evento `migrationComplete` por Context/callback.

---

## Runner
```ts
export async function runMigration(): Promise<MigrationResult>
interface MigrationResult { skipped: boolean; gamesImported: number; tokenRotated: boolean; firestoreCleaned: boolean; errors: Error[]; }
```
- Envuelve todos los pasos; ante error no-retryable, detener y guardar `migrationError` en meta (visible al próximo arranque).
- Pasos 1–5 secuenciales, nunca en paralelo.

## Integración UI (no en este fichero — solo comentario que apunte dónde)
Eventos que la app shell maneja (vía Context/estado, no Zustand):
`migration:tokenRequired`, `migration:progress` `{step,total,message}`, `migration:complete`, `migration:error`.

## Constraints
- **Vía A (local/gist) corre para todos**, incluso sin Google/Firestore: incluye el upgrade de IndexedDB
  `myGameList` v2→v3 (conservando `appState`/`cryptoKeys`, ver paso 02) y, si aplica, el upgrade de formato del gist.
- **Vía B (Firestore/social) es condicional**: solo si `getCurrentSocialAuthUser()` devuelve usuario y existe doc antiguo.
- `detectFormat` debe conservar el camino de `migrateData` (nombres legacy español→inglés) y **no** asumir UUID.
- Nunca borrar datos del gist hasta confirmar la escritura en IndexedDB.
- Idempotente: ejecutarlo dos veces produce el mismo resultado; si `migrationVersion>=3`, `{ skipped: true }` inmediato.
- Modo `DRY_RUN` con `import.meta.env.VITE_MIGRATION_DRY_RUN === 'true'`: loguea todo sin escribir.
  (El script npm `migrate:dry` que lo lanza se añade en el paso 15.)
- `Date.now()` / `crypto.randomUUID()` válidos aquí (código de app).
- `tsc --noEmit` debe pasar tras este paso.
