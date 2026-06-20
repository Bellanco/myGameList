# Fase B — Plan del "flip" en vivo (social / Firestore index-only + snippet-split)

> **Estado:** la **capa aditiva** de la Fase B ya está en `develop` (funciones nuevas, sin cablear, sin
> impacto en vivo). Este documento es el plan para **activarla** (el "flip"), que SÍ cambia datos en
> Firestore y la UI social. **Ejecutar paso a paso, probando cada uno** (no probable en CI/headless).
>
> Regla de oro: cada paso es un commit propio + puerta de calidad (`npx tsc --noEmit`, `npm test`,
> `npm run validate`, `npm run build`) + **prueba manual en navegador** + push. Si algo falla, `git revert` del paso.

## Piezas ya disponibles (no inventar otras)
- Firestore index-only (en `src/model/repository/firebaseRepository.ts`): `upsertProfileIndex`, `upsertFeedCard`,
  `setUserMap`, `assertNoFirestorePrivateFields`, `getPrivateConfig`/`setPrivateConfig`,
  `backupGithubToken(uid, token)`, `recoverGithubToken(uid)`.
- Local: `getOrCreateProfileId()` (en `indexedDbRepository.ts`).
- Proyección/snippet (en `gistRepository.ts`): `toPublicGame(game, tab)`, `buildReviewSnippet(review)`,
  `assertNoSocialPrivateFields(obj)`.
- Tipos: `ProfileIndexDoc`, `FirestoreFeedCard`, `FirestorePrivateConfig` (`src/model/types/firestore.ts`);
  `PublicGame`, `SocialGistData` (`src/model/types/social.ts`).

## Pre-flight (antes de empezar el flip)
1. Confirmar en navegador que listas + sync cross-device + store `games` (IndexedDB v4) van bien.
2. `npm run test:rules` (emulador) en verde.
3. Hacer un **export/backup** del gist social y del doc `profiles` actuales (por si hay que volver).
4. Rama: `git checkout -b feat/migration-phase-b-flip`.

---

## Paso B1 — Sacar el token de GitHub en claro de Firestore
**Objetivo:** dejar de escribir `social.githubToken` en `profiles`; guardarlo cifrado en `privateConfig`.

**Cambios:**
- `firebaseRepository.ts → upsertProfileSocialReferences` (~L500) y `ensureProfileByEmail` (~L704):
  - En el objeto `social` escrito a `profiles`, **quitar** `githubToken` (o escribir `''`).
  - Tras el `setDoc`, si hay token: `await backupGithubToken(input.user.uid, input.githubToken)`.
- Actualizar **todos los lectores** de `social.githubToken`:
  - `findSocialProfileByEmail` (~L637): seguir leyendo el campo (puede venir vacío en perfiles nuevos).
  - `useSyncViewModel.ts → recoverGistIdFromGoogle` (~L628): obtener token con
    `recoverGithubToken(user.uid)` **primero**; si null, **fallback** a `profile.githubToken` (legacy).
  - Revisar `SocialHub.tsx` (~L990) por escrituras/lecturas de token y alinearlas igual.

**Verificar:** login Google → guardar perfil social → en Firestore, `profiles` NO tiene `githubToken` en claro;
`privateConfig/{uid}.encryptedGithubToken` presente. Recuperar config en otro navegador/incógnito tras login → funciona.
`npm run audit:privacy`: deben **desaparecer** las violaciones de `githubToken`.

**Rollback:** `git revert`. Los perfiles existentes conservan el token legacy (fallback), así que no se pierde recuperación.

---

## Paso B2 — profileId + userMap (identidad pseudónima)
**Objetivo:** introducir `profileId` y el mapa `userMap` sin romper lo existente (que usa `uid`).

**Cambios:**
- Al activar lo social (en `SocialHub`/`App` cuando hay sesión + gist social): `const profileId = await getOrCreateProfileId();`
  y `await setUserMap(user.uid, profileId);`.
- Persistir `profileId`/ids en `privateConfig` con `setPrivateConfig(uid, { profileId, gamesGistId, socialGistId })`.
- **Compatibilidad de URLs:** las rutas `/social/user/:userId/...` usan hoy `uid`. Mantener soporte de ambos
  (uid y profileId) durante la transición; preferir profileId al generar enlaces nuevos.

**Verificar:** se crea `userMap/{uid}` y `privateConfig/{uid}.profileId`; los enlaces sociales antiguos (por uid) siguen abriendo.

**Rollback:** `git revert` (no se borra nada; userMap/privateConfig quedan huérfanos pero inertes).

---

## Paso B3 — Escrituras públicas vía index-only
**Objetivo:** que el doc público se escriba con `upsertProfileIndex` (sin `uid`/`email`/token) y las tarjetas con `upsertFeedCard`.

**Cambios:**
- Sustituir las escrituras directas a `profiles` (en `upsertProfileSocialReferences`/`ensureProfileByEmail`/`SocialHub`)
  por `upsertProfileIndex({ profileId, displayName, avatarHash, socialGistId, private, stats, socialChunks, consent, updatedAt })`.
- Donde se publiquen reseñas al feed, construir `FirestoreFeedCard` (snippet, sin review) y `upsertFeedCard`.
- El **directorio/búsqueda** (`listSocialDirectory`/`findSocialProfileByEmail`): adaptar a leer por `profileId`
  (las recomendaciones siguen por `toEmail`, no se tocan).

**Verificar:** nuevos perfiles/tarjetas en Firestore **sin** campos privados; `npm run audit:privacy` baja a 0 en profiles/feed.
Directorio y recomendaciones siguen funcionando.

**Rollback:** `git revert`. (Los docs nuevos ya escritos son index-only; no contienen datos sensibles.)

---

## Paso B4 — Snippet-split en la escritura del gist social
**Objetivo:** dejar de guardar `review`/`reviewText` en `myGameList.social.json`; guardar solo `snippet`.

**Cambios (en `gistRepository.ts`):**
- Donde se construye `SocialGistData`/`profile.sharedLists`/`activity` para escribir (`writeSocialGist` y sus builders,
  ~L585/L619/L674 y `normalizeSocialGistData`): proyectar cada juego con `toPublicGame(game, tab)` y usar `snippet`;
  en `activity`, escribir `snippet` en vez de `reviewText`.
- Llamar `assertNoSocialPrivateFields(content)` **antes de cada PATCH** del gist social.
- **Lectura retrocompatible:** al leer un gist social viejo (con `review`/`reviewText`), normalizar derivando `snippet`
  y descartar el texto completo (no re-exponerlo).

**Verificar:** publicar social → el contenido del gist social **no** contiene `review`/`reviewText`/`score`/`hours`;
los snippets ≤160. Leer un gist social antiguo no rompe.

**Rollback:** `git revert`. ⚠️ Ojo: una vez reescrito el gist social en formato nuevo, el texto completo ya no está
en el canal público (es el objetivo). El review completo sigue en el gist de juegos privado / IndexedDB.

---

## Paso B5 — UI social
**Objetivo:** que `SocialHub` y componentes lean el modelo nuevo (snippet, profileId) y no esperen `review`.

**Cambios:**
- En `src/view/components/socialhub/*`: mostrar `snippet` + indicador "leer más" (sin descargar el review de otros);
  para el review completo del **propio** usuario, leer de IndexedDB/gist privado.
- Usar `profileId` (no `uid`) como identificador en la UI.
- Estilos en SCSS (`_social.scss`), sin Tailwind.

**Verificar:** la pantalla social muestra snippets correctamente; no hay huecos por `review` ausente; navegación por profileId OK.

---

## Paso B6 — Desplegar reglas + gate de auditoría
**Objetivo:** activar `firestore.rules` (modelo destino) y el gate de privacidad en CI.

**Cambios/acciones:**
1. `npm run test:rules` (emulador) en verde contra el modelo ya migrado.
2. **Desplegar** (acción del usuario): `firebase deploy --only firestore:rules`.
3. Verificar en producción: lectura pública de un perfil OK; `userMap` denegado; escritura con campos privados denegada.
4. `npm run audit:privacy` a **0** Categoría A → añadir el job `audit` a `.github/workflows/ci.yml` como gate.

**Rollback:** redeploy de las reglas anteriores (tenerlas guardadas) si algo se bloquea indebidamente.

---

## Orden de prueba recomendado
B1 → (probar recuperación) → B2 → (probar enlaces) → B3 → (probar directorio/recos) → B4 → (probar publicación social) →
B5 → (probar UI) → B6 (desplegar reglas). **No** agrupar pasos; probar entre cada uno.

## Notas
- `firebase-tools`, `@firebase/rules-unit-testing`, `fake-indexeddb` ya instalados.
- Mantener `appState` como backup hasta cerrar también la Fase A (drop de appState), independiente de B.
- La eficiencia del gist (Fase C: envoltorio + chunking) es ortogonal; abordar después de B.
