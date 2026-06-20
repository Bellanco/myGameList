# Plan de pruebas de la migración (verificación end-to-end)

> Cómo verificar que todo funciona tras los cambios en vivo (B1–B5, runner, sync, snippet-split).
> Herramientas: navegador + DevTools → **Application** (IndexedDB / Local Storage), consola de **Firebase**
> (Firestore), y la API de **GitHub Gist** (ver el contenido de los gists). Marca cada casilla.

## 0. Pre-requisitos
- [ ] `git pull` de `develop` con todo lo subido.
- [ ] `npm ci` (instala deps, incl. firebase-tools / rules-unit-testing / fake-indexeddb).
- [ ] Comandos en verde: `npx tsc --noEmit` · `npm test` (41 ✓) · `npm run validate` · `npm run build` · `npm run audit:privacy` (**A:0**).
- [ ] **Backup** antes de probar en producción: exporta tu gist de juegos, tu gist social y tu doc `profiles` (por si hay que revertir).

## 1. Modo local / offline (sin Google) — debe ir IGUAL que antes
- [ ] Abre la app (sin iniciar sesión Google). Las listas cargan normal.
- [ ] Crea/edita/borra un juego → se guarda y persiste al recargar.
- [ ] DevTools → Application → IndexedDB → **`myGameList` (versión 4)**: existen stores `appState`, `cryptoKeys`, `games`, `meta`, `syncQueue`, `chunkCache`, `profileCache`, `conflicts`, `deleted`.
- [ ] Tras editar, el store **`games`** refleja tus juegos (cada uno con `_tab`) y `appState` también (espejo). El store `meta` tiene `migrationVersion: 3` y `gamesUpdatedAt`.
- [ ] **Resiliencia (recuperación):** borra la clave `mis-listas-v12-unified` de Local Storage y recarga → las listas **reaparecen** desde el store `games`.

## 2. Sincronización entre dispositivos (gist, sin social) — el fix clave
- [ ] Configura token GitHub + gistId en Ajustes (sin Google). Conecta.
- [ ] **Dispositivo A**: edita un juego. Espera ≤60 s **o** cambia de pestaña/ventana (focus).
- [ ] **Dispositivo B** (otro equipo/navegador, mismo gist): al volver visible o en su poll, **aparece el cambio de A**. (Antes no llegaba: este es el arreglo de cross-device.)
- [ ] Edita en A y B de forma alterna → no se pierden cambios (merge por `_ts`).
- [ ] El contenido del gist `myGames.json` sigue siendo `TabData` plano (la bandera de formato nuevo está **OFF**).

## 3. Arranque / runner de migración (#1)
- [ ] Primera carga tras actualizar: en idle, el store `games`/`deleted` se puebla desde tus datos. `meta.migrationVersion = 3`.
- [ ] Recarga otra vez → no vuelve a migrar (idempotente). La app no se ralentiza al arrancar.

## 4. B1 — Token fuera de Firestore en claro (seguridad)
- [ ] Inicia sesión con Google y **guarda el perfil social**.
- [ ] Firebase → Firestore → `profiles/{tu-uid}`: **NO** existe `social.githubToken` en claro.
- [ ] `privateConfig/{tu-uid}`: existe con `encryptedGithubToken` (texto cifrado), `profileId`, `gamesGistId`, `socialGistId`.
- [ ] `userMap/{tu-uid}`: existe con `{ profileId }`.
- [ ] **Recuperación**: en otro navegador (incógnito), inicia sesión con Google y usa "Recuperar desde Google" → recupera token+gistId y conecta (descifra el token). 
- [ ] Caso legacy: un perfil viejo con token en claro sigue recuperándose (fallback).

## 5. B2/B3 — Identidad pseudónima
- [ ] `profiles/{uid}` ahora incluye `profileId`. El `email` sigue presente (para descubrimiento).
- [ ] **Directorio social**: aparecen otros usuarios. **Búsqueda por email** funciona.
- [ ] **Recomendaciones**: enviar/recibir por email sigue funcionando.

## 6. B4/B5 — Gist social index-only + UI snippet (privacidad)
- [ ] Publica una reseña (guardar un juego con review estando en social).
- [ ] Contenido del gist social `myGameList.social.json`: en `profile.sharedLists` y `activity` **NO** hay `review`/`reviewText`/`score`/`hours`/`steamDeck`/`retry`/`replayable`; solo `snippet` (≤160), `rating`, y básicos.
- [ ] **Pantalla social (feed)**: las tarjetas muestran el **snippet** (no quedan vacías ni crashea).
- [ ] **Detalle de actividad**: muestra el snippet.
- [ ] **Detalle de perfil de otro usuario**: muestra snippet + rating (sin score exacto/strengths/horas — es lo esperado del modelo index-only).
- [ ] **Tu propio** review completo sigue visible donde corresponde (se lee de tu gist privado/IndexedDB, no del social).
- [ ] **Compatibilidad**: abrir el perfil de un usuario cuyo gist social aún tiene formato viejo (review/reviewText) → se muestra igual (snippet derivado), sin romper.

## 7. Privacidad (auditoría)
- [ ] `npm run audit:privacy` → **A:0, B:0**, C son solo `email`/`gamesGistId`/`uid` (conservados por decisión). Exit 0.

## 8. B6 — Reglas Firestore (ANTES de desplegar)
- [ ] `npm run test:rules` (con emulador, vía firebase-tools) → **todos los tests verdes**.
- [ ] ⚠️ **NO desplegar** hasta que 1–7 estén OK. Las reglas asumen el modelo nuevo.
- [ ] Desplegar: `firebase deploy --only firestore:rules`.
- [ ] Post-deploy: lectura pública de un perfil OK; `userMap` denegado; escritura con `githubToken`/`review` denegada; la app sigue funcionando (login, guardar, directorio).
- [ ] Si algo se bloquea: redeploy de las reglas anteriores (guardadas en el backup).

## 9. Fase C — Formato nuevo del gist (bandera, NO activar aún)
- [ ] `ENABLE_GAMES_WRAPPER_WRITE` en `gistRepository.ts` está en **`false`** (no se escribe el envoltorio).
- [ ] Solo activar (`true`) cuando **todos** tus dispositivos tengan la versión nueva (la lectura ya es retrocompatible). Tras activar: editar → el gist `myGames.json` pasa a `{ schemaVersion: 3, fileType: 'games-main', games, deletedIndex, ... }`; verificar que A y B siguen sincronizando.

## 10. Regresión general
- [ ] `npm test` 41 ✓ · `npm run build` ✓ · `npm run validate` ✓ · `npx tsc --noEmit` ✓.
- [ ] La app carga, navega (listas, ajustes, social) y no hay errores en consola.

## Reversión rápida
Cada paso del flip es un commit aislado en `develop`. Si algo falla: `git revert <commit>` (B1 `ec60090`, B2 `98f7f1a`, B3 `6a3cff0`, B4+B5 `635b72b`). Los datos privados completos nunca se pierden (siguen en el gist de juegos privado + IndexedDB).
