---
mode: agent
description: "Plan de remediación global por fases (seguridad, datos, rendimiento, reusabilidad) para myGameList"
---

# Remediación global de myGameList — ejecutar POR FASES

## Cómo usar este prompt
Eres el agente de desarrollo de **myGameList**. Antes de tocar nada, lee
`.github/copilot-instructions.md` (arquitectura real §1–§9) y las reglas por capa en
`.github/instructions/`.

**Reglas de ejecución (obligatorias):**
1. Ejecuta **una sola sub‑fase a la vez**, en orden. No agrupes fases.
2. Tras cada sub‑fase: `npx tsc --noEmit` → `npm run test` → `npm run validate`. Si algo
   falla, arréglalo antes de continuar. No marques una casilla si no compila/pasa.
3. **Las Fases 0–2 protegen contra pérdida de datos y filtración de credenciales: tienen
   prioridad absoluta.** No empieces refactors (Fase 5) hasta que la Fase 0 (tests) esté hecha.
4. Cambios que tocan el modelo de datos o el merge → muestra un diff y pide confirmación
   antes de aplicar. Nunca borres gists/datos del usuario sin avisar.
5. Trabaja en una rama, commits pequeños por sub‑fase (`fix(sec): …`, `fix(sync): …`, `refactor: …`).

> Toda la evidencia (`file:line`) procede de una auditoría del código real. Si una línea no
> coincide (el código pudo cambiar), localiza el patrón equivalente antes de editar.

---

## FASE 0 — Red de seguridad (tests del merge/sync) — *hacer primero*

El merge CRDT casi no tiene tests de los caminos peligrosos. Sin ellos, las Fases 2 y 5 son
arriesgadas. Añade tests **que fallen hoy** documentando los bugs, antes de arreglarlos.

- [ ] **0.1** En `tests/unit/syncRepository.test.ts` añade casos para `mergeCrdt`:
  - empate de `_ts` con **contenido distinto** mismo tab (hoy: ninguno se actualiza → divergen).
  - edit‑vs‑delete con `_ts` igual (hoy: se pierde el tombstone).
  - tombstone más antiguo que una edición posterior (resurrección correcta).
  - mismo `id` con `name` distinto en cada lado (colisión de id → hoy se pierde uno).
  - item presente solo en un lado: verificar flags `localNeedsUpdate`/`remoteNeedsUpdate`.
  - remoto con un juego sin `genres`/`platforms` (array undefined) → no debe romper.
- [ ] **0.2** En `tests/unit/syncMachineRepository.test.ts` añade: máquina que queda atascada en
  `checking`/`writing` tras error y no vuelve a `idle`/`error_backoff`.
- [ ] **0.3** Marca con `it.fails`/`todo` los que reflejan bugs aún sin corregir, para que la
  suite quede verde pero deje constancia. Se irán activando en la Fase 2.

Verificación: `npm run test`.

---

## FASE 1 — Seguridad (CRÍTICO: credenciales y privacidad)

### 1.1 — Eliminar el token de GitHub de Firestore  *(Critical · C1)*
Hoy `upsertProfileSocialReferences` escribe `social.githubToken` (PAT en claro) en
`profiles/{uid}` — `firebaseRepository.ts:499-516` (y el bloque equivalente en `ensureProfileByEmail` ~:656-673).
Esa colección la leen **todos** los usuarios (`listSocialDirectory` ~:720, `findSocialProfileByEmail` ~:557).
- [ ] Quita por completo `githubToken` (y, si no es imprescindible para la UX social,
  también `gamesGistId`) del documento escrito en Firestore y de los tipos
  `SocialProfileReference`/`SocialDirectoryEntry` (`firebaseRepository.ts:22-38`).
- [ ] Elimina la recuperación del token desde el perfil: `useSyncViewModel.ts:636`
  (`recoveredToken = profile?.githubToken`). El token debe vivir **solo en el dispositivo**.
- [ ] Para recuperación multi‑dispositivo del *gist id* (no del token), guarda solo el `gistId`
  (público de por sí) — nunca el secreto.
- [ ] **Acción manual del usuario:** revocar en GitHub cualquier PAT ya escrito en Firestore
  (se consideran comprometidos) y borrar el campo de los documentos existentes.

### 1.2 — Añadir y desplegar `firestore.rules`  *(Critical · C2 / M3)*
No existe `firestore.rules` ni `firebase.json` en el repo: la única frontera de acceso a
`profiles` (email, gist ids) y `recommendations` (emails, mensajes) es invisible y no auditable.
- [ ] Crea `firebase.json` y `firestore.rules`. Base mínima (ajústala a los campos reales tras 1.1):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{db}/documents {
      match /profiles/{uid} {
        allow read: if request.auth != null;            // directorio social
        allow write: if request.auth != null && request.auth.uid == uid
                     && !('githubToken' in request.resource.data.social); // nunca aceptar el token
      }
      match /recommendations/{recId} {
        allow read:   if request.auth != null &&
                      (request.auth.token.email == resource.data.toEmail ||
                       request.auth.uid == resource.data.fromUid);
        allow create: if request.auth != null &&
                      request.auth.uid == request.resource.data.fromUid;
        allow update: if request.auth != null &&
                      request.auth.token.email == resource.data.toEmail;  // solo el receptor cambia status
        allow delete: if false;
      }
      match /{document=**} { allow read, write: if false; }  // deny por defecto
    }
  }
  ```
- [ ] Verifica que los campos expuestos por `listSocialDirectory` son solo no sensibles
  (nombre, gistId social, displayName). Documenta el despliegue en el README.

### 1.3 — Gist social privado por defecto + borrar el antiguo al cambiar privacidad  *(M1/M2)*
- [ ] `createSocialGist` crea el gist **público** (`gistRepository.ts:772-773` → `...true`).
  Cámbialo a `public: false`; publicar debe ser opt‑in explícito y reversible.
- [ ] `updateGistPrivacy` (`gistRepository.ts:1203-1224`) clona a un gist nuevo pero **no borra
  el original** → los datos públicos siguen accesibles en la URL vieja. Tras clonar, haz
  `DELETE /gists/{idAntiguo}` (o avisa claramente al usuario de que debe borrarlo).

### 1.4 — No enviar el PAT al leer gists públicos de terceros  *(H2)*
`readPublicSocialGistById` (`:955-957`) y `readPublicGamesGistById` (`:1022-1024`) añaden
`Authorization: Bearer <token>` al leer gists públicos ajenos.
- [ ] Lee gists públicos de terceros **sin** cabecera `Authorization`. Reserva el token solo
  para los gists propios.

### 1.5 — Decidir el modelo del token local y eliminar `crypto.ts` engañoso  *(H1)*
`core/security/crypto.ts` (AES‑GCM) **no se importa en ningún sitio**; el token se guarda en
claro en localStorage (`gistRepository.ts:697-699`, `:714-716`). La clave de `crypto.ts` deriva
de `userAgent|language|timezone` (`:52-60`) — ofuscación, no cifrado.
- [ ] Elige UN modelo y documenta en `SECURITY.md`:
  **(a)** token solo en memoria (sin persistir), o **(b)** localStorage en claro como
  limitación aceptada y conocida. En ambos casos, **borra `crypto.ts`** (da falsa seguridad).

### 1.6 — Endurecer CSP  *(L1, opcional)*
- [ ] En `public/_headers`, intenta quitar `'unsafe-inline'` de `style-src` (hash/nonce o `'self'`).
  `script-src` ya está limpio — no lo toques.

---

## FASE 2 — Integridad de datos y correctitud (CRÍTICO/ALTO: pérdida silenciosa)

### 2.1 — IDs de juego globalmente únicos  *(Critical · C1 correctitud)*
Hoy el id es un contador local `max+1` (`useGameListViewModel.ts:367`) y el merge indexa por
`id` numérico (`syncRepository.ts:41-50`). Dos dispositivos offline generan el mismo id → el
merge descarta uno **sin tombstone ni aviso**.
- [ ] Cambia la generación a un id globalmente único. **Recomendado:** `crypto.randomUUID()`
  (requiere ampliar `GameItem.id` y `DeletedItem.id` a `string` en `model/types/game.ts` y
  ajustar el `Map<string,…>` del merge, `normalizeData` y comparaciones).
- [ ] **Migración:** los ids numéricos existentes deben preservarse (no regenerar) para no
  romper tombstones/historial; solo los **nuevos** usan UUID. Implementa esto en
  `migrateRepository.ts` y cúbrelo con un test.
- [ ] Fallback si no quieres cambiar el tipo: `Date.now()*1000 + random(0..999)` (reduce, no
  elimina, la colisión — deja constancia de la limitación).

### 2.2 — Escritura read‑modify‑write bajo el etag más fresco  *(Critical · C2 correctitud)*
`writeGist` hace PATCH sin `If-Match` (`gistRepository.ts:1157-1191`) y la API de gists es
last‑write‑wins (no devuelve 409 por conflicto de contenido) → el guard `isWriteConflict`
(`useSyncViewModel.ts:39-40`) y su bloque de recuperación (`:184-206`) son **código muerto** y
hay ventana real de *lost update* entre pestañas/dispositivos.
- [ ] En `writeWithConflictRecovery`: **siempre** re‑`readGist(token, id, null)` justo antes del
  PATCH, mergea el remoto fresco con lo local, y solo entonces escribe; guarda el etag devuelto.
- [ ] Elimina/sustituye la lógica basada en el 409 inexistente.

### 2.3 — Lock real de sincronización en vuelo  *(M2 rendimiento/correctitud)*
`refreshRemote`/`syncNow`/`initializeSync` pueden solaparse (p.ej. `focus`+`visibilitychange`
seguidos) y todas leen‑mergean‑escriben (`useSyncViewModel.ts:217,452,349`).
- [ ] Añade un guard con `useRef<Promise|null>`: si hay un ciclo en vuelo, los siguientes
  esperan/omiten en vez de fiarse solo del enum de estado.

### 2.4 — Empate de `_ts` en edit‑vs‑edit  *(High · H1)*
`syncRepository.ts:100,105-114`: con `_ts` igual y mismo tab, ni `localNeedsUpdate` ni
`remoteNeedsUpdate` se activan aunque el contenido difiera → divergencia permanente.
- [ ] En empate, compara contenido (hash/serialización estable) y elige por un desempate
  determinista; activa los flags `needsUpdate` cuando el contenido difiera. Activa el test 0.1.

### 2.5 — Empate edit‑vs‑delete preserva el tombstone  *(High · H2)*
`syncRepository.ts:90` usa `maxDelTs > maxItemTs` (estricto): en empate cae al branch de winner
y **no** mete el tombstone en `merged.deleted` → el delete se pierde.
- [ ] Define la política de empate y **preserva el tombstone en ambos casos** (mantenlo con su
  `_ts` hasta que sea estrictamente superado). Activa el test 0.1.

### 2.6 — Estado de sync atascado tras error en recuperación  *(High · H3)*
`recoverGistIdFromGoogle` (`useSyncViewModel.ts:657-662`) captura el error pero **no** llama a
`transitionTo` → la máquina queda en `checking`/`writing` y bloquea todo sync hasta recargar.
- [ ] En ese catch, añade `transitionTo('error_backoff', …)` o `transitionTo('idle')`.

### 2.7 — Normalizar datos remotos antes del merge  *(Low pero puede crashear · L2)*
La ruta de lectura de gist hace `remote.data as TabData` sin `normalizeData`
(`useSyncViewModel.ts:190,235,317,374,477`); un juego sin `genres`/`platforms` llega a render y
`game.genres.forEach` (`useGameListViewModel.ts:186`) revienta.
- [ ] Aplica `normalizeData(migrateData(...))` a los datos remotos antes de `mergeCrdt`.

### 2.8 — `setData` doble y `updatedAt` espurio  *(M3)*
`useSyncViewModel.ts:243,250,252`: dos `setData` por ciclo y `updatedAt: Date.now()` aunque el
merge sea no‑op (ensucia meta → escritura espuria).
- [ ] Un solo `setData`; bump de `updatedAt` solo si `localNeedsUpdate || remoteNeedsUpdate`.

### 2.9 — Validación de estado IndexedDB  *(M4)*
`indexedDbRepository.ts:18` solo comprueba `'c' in result && 'v' in result`; objetos parciales
pasan y `hasStoredData` (`localRepository.ts:8-10,154`) puede lanzar al leer `.length`.
- [ ] Valida que `c/v/e/p/deleted` sean arrays antes de aceptar, o normaliza antes de `hasStoredData`.

---

## FASE 3 — Rendimiento

### 3.1 — Deps del memo de filtrado  *(High · hot path)*
`App.tsx:123` el `useMemo` de `getFilteredList` depende de `vm.data/vm.filters/vm.sort`
completos → recalcula filtro+sort O(n log n) de toda la lista en cada tecla de búsqueda de
cualquier tab.
- [ ] Cambia deps a la *slice* del tab actual: `[currentTab, vm.data[currentTab], vm.filters[currentTab], vm.sort[currentTab]]`.

### 3.2 — Estabilizar `SyncDeps` y no releer localStorage por render  *(High)*
`App.tsx:65-72` recrea el objeto de deps de `useSyncViewModel` cada render → los `useCallback`
internos cambian de identidad y los efectos (`:528,540,566,584`) re‑registran listeners
(`visibilitychange`/`focus`/BroadcastChannel). Además `hasConfig`/`currentConfig`
(`useSyncViewModel.ts:725`) llaman a `getSyncConfig()` (localStorage+JSON.parse) en cada render.
- [ ] Envuelve las deps en `useMemo`/`useRef` (getters estables) y deriva `hasConfig`/`currentConfig`
  de estado, no releyendo localStorage.

### 3.3 — `formatDayHeader` fuera del componente + debounce de `feedSearch`  *(M5)*
`SocialHub.tsx:501` define `formatDayHeader` en cada render → el `useMemo` de agrupación
(`:526`) nunca memoiza (reordena hasta 300 items por render); `feedSearch` no tiene debounce.
- [ ] Saca `formatDayHeader` del componente (es pura) y quítala de deps; debouncea `feedSearch`
  (reutiliza `useDebouncedValue`).

### 3.4 — Evitar doble normalización en `persist` + debounce de localStorage  *(H3 perf)*
`useGameListViewModel.ts:149-167`: `persist` re‑`normalizeData` datos que el VM ya produjo
normalizados, y `saveLocalState` hace `JSON.stringify` síncrono en cada edición; las operaciones
de tags (`:436-534`) ya reconstruyen todo y luego se normaliza otra vez.
- [ ] No re‑normalices lo ya normalizado; debouncea la escritura a localStorage (la de IndexedDB
  ya es async).

### 3.5 — Quitar `initializeSync()` redundante a nivel App  *(L5)*
`App.tsx:80-82` llama `initializeSync()` con `[]` mientras el propio hook ya se auto‑inicializa
(`useSyncViewModel.ts:515`) → doble lectura de gist al montar.
- [ ] Elimina el efecto de App; deja que el hook se inicialice solo.

---

## FASE 4 — Reutilización en repositorios (mayor ahorro de código)

> Hacer **después** de la Fase 0 (tests) y de las correcciones de la Fase 2 (no mezclar refactor
> con corrección de bugs). Añade tests de los helpers nuevos.

### 4.1 — Cliente HTTP de GitHub unificado  *(High · ~400 líneas)*
`gistRepository.ts` repite cabeceras auth/versión, validación token/gistId, flujo ETag (304 →
`buildGithubError` → parse `files[FILENAME].content` → normalize) y PATCH en 8+ funciones
(evidencia: `:728-731,748-751,783-787,843-923,950-990,1017-1057,1081-1102,1166-1190`).
- [ ] Crea `githubFetch(path, { token, etag, method, body })` (cabeceras/versión/auth/304/errores).
- [ ] Crea genéricos `readGistFile<T>(gistId, { filename, normalize, cache })` y
  `writeGistFile<T>(gistId, { filename, serialize })`; las funciones games/social pasan a ser
  llamadas finas parametrizadas por filename + transform.

### 4.2 — Util compartido de caché TTL + dedupe en vuelo  *(High · 6 copias)*
El patrón `CachedValue<T>` + Map + `*InFlight*` está copiado 3× en `gistRepository.ts:22-258`
y 3× en `firebaseRepository.ts:76-407`.
- [ ] Crea `core/utils/asyncCache.ts` con `createTtlCache<K,V>({ ttlMs })` y
  `dedupeInFlight(map, key, factory)`; úsalo en ambos repositorios.

### 4.3 — Módulo BroadcastChannel + centralizar constantes  *(M)*
`'mygamelist-sync'` y el bloque open→postMessage→close están 4× en `useSyncViewModel.ts`
(`:165-169,194-198,567-568,679-683`). Filenames de gist/`GIST_API_BASE`/app‑name/log keys
están dispersos (`gistRepository.ts:6-14`, `App.tsx:147` re‑hardcodea `'myGames.json'`,
`'myGameList'` en `useSyncViewModel.ts:36`, `crypto.ts:28`, `idbConnectionRepository.ts:1`).
- [ ] `core/sync/broadcast.ts` con `SYNC_CHANNEL` + `broadcastRemoteWrite`/`subscribeRemoteWrites`.
- [ ] Mueve filenames/API base/app‑name/log keys a `core/constants` (`gist.ts` + ampliar `storageKeys.ts`).

### 4.4 — Extraer el ciclo de sync  *(M)*
`refreshRemote`/`connectSyncWithCredentials`/`initializeSync`/`syncNow` repiten la secuencia
read→merge→write y el bloque catch ~5× (`useSyncViewModel.ts:217,291,349,452`).
- [ ] Extrae `runSyncCycle({ config, force, write })` y `withSyncErrorHandling(op, fn)`.

### 4.5 — `mapTagAcrossGames`  *(High)*
`removeTagAcrossGames`/`renameTagAcrossGames` son gemelas de ~90 líneas
(`useGameListViewModel.ts:436-478` y `480-534`).
- [ ] Extrae `mapTagAcrossGames(data, tabKey, transform)`; ambas pasan a ser llamadas de 5 líneas.

---

## FASE 5 — Reutilización en UI

### 5.1 — Shell de modal compartido  *(High)*
Overlay+outside‑click+header+cierre y efecto Escape duplicados: `FormModal.tsx:98-110,248-273`,
`AdminModal.tsx:48-60,100-125`, `ConfirmModal.tsx:13-26`.
- [ ] Extrae `<Modal open title footer onClose>` + hook `useModalDismiss` (Escape + outside‑click).

### 5.2 — `<TagAdminPanel>` + `useTagEditor`  *(High · bloque duplicado más grande)*
`AdminModal.tsx:64-185` ≈ `SettingsHub.tsx:82-394` (fila de edición, tab bar, start/cancel/save,
merge, `useMemo` de lista) casi línea a línea.
- [ ] Extrae `<TagAdminPanel>` + `useTagEditor`; AdminModal y SettingsHub lo consumen.

### 5.3 — `<SocialScreenShell>` + `<SyncStatusMessage>`  *(High)*
Shell de pantalla social duplicado 4× (`SocialDetailScreen`, `SocialFeedScreen`,
`SocialProfileScreen`, `SocialProfileDetailScreen`) y la línea `sync-status-msg ${kind}` aparece
**9×** (esas pantallas + `SocialHub.tsx:1298`, `SettingsHub.tsx:240`).
- [ ] Extrae `<SocialScreenShell>` y `<SyncStatusMessage kind message>`.

### 5.4 — Componentes UI compartidos  *(M)*
- [ ] `useHorizontalDragScroll()` (de `SocialGameCardSelector.tsx:34-113` y `SocialHub.tsx:551-643`).
- [ ] `<ActivityCard>` + `formatAnalyzedAt()` (`SocialFeedScreen.tsx:99-122` ≈ `SocialDetailScreen.tsx:54-91`).
- [ ] `<FormField>` + `<SearchInput>`; usar `UI_MESSAGES.form.enterToAddHint` (hoy literal en `FormModal.tsx:288,332,373`).
- [ ] `<ToggleSwitch>` (`SocialProfileScreen.tsx:137-216`, `SettingsHub.tsx:286-298`).
- [ ] `<ChipList>` (unificar `GameTable.tsx:33-44`, `SocialDetailScreen.tsx:97-128`, `TagInput.tsx:100-112`).
- [ ] `clampStars(value)` en `renderStars.ts`, importado por `StarRating.tsx:10`/`StarPicker.tsx:12`.
- [ ] Un único `useNotice()` + `<NoticeBanner>` (hoy 3 sistemas: `useGameListViewModel.ts:306-312`
  con el hack `notify._timer`, `SocialHub.tsx:154-173`, `StatusBanner.tsx`). Sustituye el hack
  del timer por `useRef` con cleanup (corrige también el setState‑tras‑unmount, M1 correctitud).

### 5.5 — SCSS: tokens, mixins y breakpoints  *(High)*
- [ ] Añade canales `--*-rgb` en `_base.scss` y reemplaza los ~120 `rgba(literal,…)`.
- [ ] Crea `_mixins.scss` (flex‑center, icon‑circle, toggle, card, field+focus, chip).
- [ ] Variables `$bp-*` + mixins `up/down`; sustituye literales `720px/48rem/1100px/1400px`.
- [ ] Elimina bloques duplicados exactos (spinner `_forms-and-buttons.scss:95-97` ≈
  `_overlays-and-responsive.scss:513-515`; `.hub-feed-day-group` duplicado en `_layout.scss`;
  `body{overflow}` 4× con `100dvh` vs `100vh` inconsistente).

### 5.6 — Tipos compartidos  *(M)*
- [ ] `GameCore` base; `GameItem = GameCore & { id; _ts; years }`, y `SocialSharedGame`/`GameDraft`
  derivan de él (hoy 3 formas solapadas: `game.ts:3-19`, `gistRepository.ts:45-59`, `useGameListViewModel.ts:38-55`).
- [ ] Mueve los tipos sociales (`SocialGistProfile`, `SocialSharedGame`, `SocialActivityEntry`…)
  de `gistRepository.ts:29-112` a `model/types/social.ts`; `SocialDirectoryEntry = Pick<SocialProfileReference,…>`.
- [ ] `StoragePayload = TabData & { etag; lastRemoteUpdatedAt }`.

---

## FASE 6 — Limpieza final

- [ ] Borra código muerto: `buildReviewExcerpt`, `upsertRecommendationActivity`,
  `clearSocialSyncConfig` (`gistRepository.ts:585,594,718`), `buildActivityId` redundante (`:419-421`).
- [ ] Reutiliza `TAB_ORDER`/`TAB_IDS` en vez de literales `['c','v','e','p']`
  (`useGameListViewModel.ts:185`, `useSyncViewModel.ts:46,103`, `gistRepository.ts:371`).
- [ ] Arregla deps de efectos incorrectas (`useSyncViewModel.ts:566-582` lista `initializeSync`
  donde usa `schedulePendingRemoteSync`).
- [ ] README: elimina o crea los docs referenciados que no existen (`BUNDLE_ANALYSIS.md`,
  `CLOUDFLARE_DEPLOYMENT.md`, `SYNC_GUIDE.md`).

---

## Cierre
Al terminar todas las fases: `npx tsc --noEmit` ✓, `npm run validate` ✓, `npm run test:all` ✓,
`npm run build` ✓. Imprime un resumen de qué fases se completaron, qué quedó pendiente y qué
acciones manuales requiere el usuario (revocar PATs, desplegar `firestore.rules`).
