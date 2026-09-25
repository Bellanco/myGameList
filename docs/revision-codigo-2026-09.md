# Revisión de código — septiembre de 2026

> **Alcance:** corrección línea a línea de `src/` y `functions/` (sin tests): returns que pierden datos, tipos y
> casts que mienten, hooks con dependencias o limpieza mal puestas, errores tragados, carreras y comentarios que
> contradicen el código. Complementa a `revision-general-2026-09.md`, que mira arquitectura, rendimiento y CI.
> Sobre `develop` en `d63c1d8` (25-09-2026).
>
> ⚠️ **Documento vivo.** Las líneas citadas se mueven. Al cerrar un punto, márcalo con ✅ y el commit.

## Cómo se hizo

- `npm run typecheck` y `npx eslint src functions`: los dos en verde antes de empezar. Lo de aquí es lo que el
  compilador no ve.
- Revisión manual por zonas, verificando cada hallazgo contra el código y sus llamadores. Los marcados ✔ se
  releyeron una segunda vez de forma independiente.

## Plan

1. **Sync y pérdida de datos:** A1, A2, M-githubHttp, M-legacyGamesFormat. · ✅ hecho (25-09-2026)
2. **Social:** A3–A7, M-socialGist ilegible, M-profileHeal. · ✅ hecho (25-09-2026)
3. **Borde y admin:** A8, A10, A11, M-achievementsConfig, M-AdminPremios.
4. **Privacidad:** A12, M-accountDeletion.
5. **Formularios y accesibilidad:** A9, M-StarPicker, M-feed con teclado.
6. Resto de media; la baja en bloque.

Cada arreglo de los grupos 1 y 2 va con un test que reproduce el fallo antes de corregirlo.

## Alta — pérdida o corrupción de datos

| # | Estado | Dónde | Qué pasa |
|---|---|---|---|
| A1 ✔ | ✅ | `src/core/utils/tagMutations.ts:37` | Renombrar/borrar una etiqueta sube el `_ts` de **todos** los juegos, aunque no la lleven. Con LWW por juego (`mergeCrdt`), una edición sin subir de otro dispositivo pierde. Sellar solo los que cambian. |
| A2 ✔ | ✅ | `src/model/repository/gistConfigRepository.ts:134-157` | Cada `saveSyncConfig` (tras cada ciclo) escribe la config sin `encToken` y recifra en segundo plano. Cerrar en ese hueco, o que el cifrado falle (`.catch(() => {})`), deja el disco sin token. Conservar el `encToken` previo si el token no cambia. |
| A3 ✔ | ✅ e174d69 | `src/view/components/socialhub/SocialProfileDetailScreen.tsx:641` | «Añadir a próximos» desde la ruleta de un amigo copia **su reseña y su nota** (`buildProfilePool`) a tus listas y a tu gist (`addGameToProximos` las copia). |
| A4 | ✅ 3af553c | `src/model/repository/firebaseRepository.ts:498-515` (y `:205-221`) | `ensureProfileByEmail` cachea 60 s el perfil propio sin `achievementsMirror`/`palmares`/`createdAt`. Abrir el hub en ese plazo publica la vitrina como reemplazo (`mergeForPublish('')`) y se pierden medallas de otros dispositivos. |
| A5 ✔ | ✅ 510cd42 | `src/model/repository/firebaseSocialRepository.ts:478-490` | El último `.map` de `listSocialDirectory` descarta `profileId`; `usePremiosProfiles` cruza por él y la clasificación de premios no enlaza nunca (desde 770507b). |
| A6 ✔ | ✅ 813df47 | `src/viewmodel/useSocialViewModel.ts:375-382` | Si el gist social de `privateConfig` da 404, se sale antes de `setAuthUser`: parece sin sesión, no arranca el auto-crear y al reentrar se crea otro gist vacío. Tampoco mira `cancelled` tras el `await`. |
| A7 | ✅ 3c0ee57 | `src/viewmodel/useSocialViewModel.ts:734`, `:755` | La migración a canal secreto borra el gist viejo aunque el `setPrivateConfig` haya fallado (`.catch(() => {})`); el puntero queda en un gist inexistente. |
| A8 ✔ | | `functions/cover.ts:316-327`, `functions/_lib/igdbCover.ts:643` | «No se pudo preguntar a IGDB» (429, token) devuelve `null` igual que «no hay carátula» → `404` con `CACHE_MAPA` (7 días) y el cliente lo aparca 90. Responder 503 + `no-store`. Mismo fallo en `localCoverApi`. |
| A9 | | `src/view/modals/FormModal.tsx:306-339` | `runSave` vacía lo pendiente de los campos de etiquetas y, si la validación falla, sale sin `setLocalDraft(nextDraft)`: lo escrito sin Enter se pierde. |
| A10 ✔ | | `src/core/achievements/catalog.ts:1486` | `applyExtraSteps` ordena siempre ascendente e invierte la escalera descendente `estanteria-cero`. `AdminAchievements.tsx:366/403` repite el sort. |
| A11 | | `src/view/components/AdminHub.tsx:238-252`, `:416-424`; `AdminAnnouncement.tsx:103` | El formulario del aviso copia `current` en `useState` cuando aún es `null`; «Guardar» crea campaña nueva y se reenseña a todos. |
| A12 ✔ | | `src/view/components/DangerZone.tsx:43-48` | Con borrado de cuenta parcial, el aviso `deletedPartial` no se ve: se navega fuera y se desmonta. |

## Media

### Sync y modelo

| Estado | Dónde | Qué pasa |
|---|---|---|
| ✅ | `src/model/repository/githubHttp.ts:55-70` | El timeout se limpia al llegar las cabeceras; `response.json()` queda sin límite y una red colgada deja el cerrojo de sync tomado. |
| ✅ | `src/model/migration/legacyGamesFormat.ts:111-120` | `assembleChunkedGames` salta en silencio chunks ausentes o corruptos (overflow lanza); la siguiente escritura borra esos juegos. |
| | `src/model/repository/indexedDbRepository.ts:396-400`, `:453-456` | El `oncomplete` del espejo rearma el índice aunque se invalidara en vuelo (solo migración v3). Contador de generación. |
| | `src/viewmodel/useSyncViewModel.ts:116-124`, `:163` | Un fallo de escritura suma dos veces al backoff y pisa `pendingAction: 'write'`; `retryPendingWrite` casi muerto y sin re-merge. |
| | `src/model/repository/achievementsConfigRepository.ts:182-186` | `setDoc(..., { merge: true })` no borra la clave quitada de `extraSteps`: el escalón vuelve. Usar `deleteField()` o `updateDoc`. |
| ✅ bf35c74 | `src/model/repository/firebaseProfileHealRepository.ts:165`, `:284` | Un fallo leyendo `privateConfig` se trata como vacío y se sobrescribe con ids/token legacy. |
| ✅ 313da37 | `src/model/repository/socialGistRepository.ts:1063-1102` | Gist ilegible → se devuelve vacío y se cachea con su ETag; `openSocialWrite`/`reconcileReviewActivity` reescriben el canal. Arreglado con él `assembleChunkedSocial`, que saltaba chunks ausentes o corruptos (ahora aborta en la lectura del canal propio; las de solo mirar siguen con lo disponible). |
| | `src/model/repository/premios/premiosSeasonRepository.ts:301`, `:506` | Dos ediciones con el mismo nombre o año dan el mismo id; la segunda pisa el archivo de la primera. |
| | `src/model/repository/premios/premiosPalmaresRepository.ts:223`, `:254` | `grant`/`revokePalmares` escriben `updatedAt` en el perfil y falsean «última vez visto». |
| | `src/model/repository/accountDeletionRepository.ts:151-157` | Tras borrar la cuenta quedan ~12 claves locales (votos, `achievementsPublishedKey(uid)`…) pese a que el comentario promete lo contrario. |
| | `src/model/repository/preferenceStore.ts:102`; `ScoreScaleCard.tsx:42` | `void setPublicConfig(...)` sin `.catch` → `unhandledrejection` sin red. |
| | `src/core/utils/gistCompression.ts:45-46` | `void writer.write/close` sin capturar: gzip corrupto → `unhandledrejection` a telemetría. |

### View-model social

| Estado | Dónde | Qué pasa |
|---|---|---|
| | `src/viewmodel/useSocialViewModel.ts:334-340`, `:422` | La hidratación inicial depende de `lockProfileEditor`, que depende de `activePanel`: se repite en cada cambio de panel. |
| | `src/viewmodel/social/useSocialDirectory.ts:537-542` | Con una hidratación en vuelo, las llamadas con entradas nuevas reciben la vieja. Marcar «otra pasada». |
| | `src/viewmodel/useSocialViewModel.ts:1857-1888` | `cancelled` corta la rehidratación en cada cambio de dependencias, y el pestillo impide reintentar. |
| | `src/viewmodel/useSocialViewModel.ts:971`, `:1006-1013`, `:1404` | Perfil propio, `getGameItemById` y reseñas relacionadas usan `localState` obsoleto en vez de `liveLists`. |
| | `src/view/hooks/useSocialProfileSession.ts:47-84` | `gistId` solo se resuelve al cambiar la sesión; tras crear el canal no aparece Cuenta hasta recargar. |

### Vista

| Estado | Dónde | Qué pasa |
|---|---|---|
| | `src/view/components/StarPicker.tsx:9-36` ✔ | `tabIndex` fijo en la estrella 1 y flechas relativas al botón: por teclado solo se elige 1 o 2. |
| | `src/view/components/AdminAchievements.tsx:281-284`, `:368`, `:402` | Memos sin `catalogEpoch()`; «hoy → después» cuenta los añadidos dos veces. |
| | `src/view/components/GameTable.tsx:1396` | Detalle de «Vergüenza» usa `game.scored` en vez de `hasScore`; `score !== null` siempre cierto. |
| | `src/view/components/socialhub/SocialFeedScreen.tsx:271-275`, `:448` | Enter en el nombre del autor abre la reseña: el `keydown` del artículo hace `preventDefault`. |
| | `src/view/components/premios/AdminPremios.tsx:84-104` | Con Firestore fallando, publica en KV la foto vacía de premios. |
| | `src/view/components/premios/PremiosHub.tsx:121`, `PremiosReviewScreen.tsx:128` | Doble envío: `submitting` se enciende tras `await ensureLightAccount`. |
| | `src/view/components/premios/AdminPremiosVotos.tsx:68-80` | `try/finally` sin `catch`: el error al retirar una papeleta no se enseña. |
| | `src/view/components/stats/ExplodedRose.tsx:127` ✔ | `large-arc-flag` fijo a 0: con un solo género sale una astilla. |
| | `src/view/components/stats/useRevealOnScroll.ts:54` | Hijos montados después (tarjeta `full`, panel tras la primera sync) quedan a opacidad 0. |

### Borde

| Estado | Dónde | Qué pasa |
|---|---|---|
| | `functions/_lib/igdbCover.ts:446-484`, `functions/cover.ts:340` | Sin timeouts ni `try/catch` en IGDB: excepción → 500/1101 sin `Cache-Control`. |
| | `functions/_lib/igdbCover.ts:439-457`, `:486` | El token de Twitch no se invalida tras un 401 (hasta 30 días en KV). |

## Baja

- **Datos**
  - `localRepository.ts:125-159` — `normalizeGame` pierde `_v` y `shared` (latente; bloquea «Puertas abiertas»).
  - `catalog.ts:740/942/1211`, `computeStats.ts:181` — `years` duplicados cuentan como rejugados.
  - `socialGistSchema.ts:26-34` — `sharedGame` (strict) rechaza `years`, que la normalización emite.
  - `gistRepository.ts:484-494` — `buildGistReadResponse` omite chunks sin contenido; no se barren.
  - `catalog.ts:454` — `dieta` se fecha con el último movimiento de Próximos: la fecha se mueve.
  - `catalog.ts:719` — «Cien por cien» ignora los escalones extra.
- **Carreras**
  - `useSocialFriendships.ts:112-117` — no reinicia `friendships` al cerrar sesión.
  - `useSocialStartupTasks.ts:172-179` — `launchedRef` sin la huella.
  - `useIsAdmin.ts:30-32`, `scorePreferenceRepository.ts:37-44`.
  - `announcementRepository.ts:53-65`, `premiosVisibilityRepository.ts:62-73` — caché del fallo y `inFlight`.
  - `firebaseFriendshipRepository.ts:269-276` — `forceRefresh` borra el en-vuelo ajeno.
  - `AwardPanel.tsx:44-57` — el dibujo anterior pisa el canvas.
  - `SocialProfileDetailScreen.tsx:287-289`, `:337-340` — efectos atados a la identidad del objeto.
  - `GameTable.tsx:413-433` — `entering` colgado.
- **Borde**
  - `functions/api/premios.ts:53` — PUT con cuerpo vacío borra el calendario.
  - `cover-quota.ts:59`, `share/index.ts:86`, `announcement.ts:61` — `kv.put` sin capturar.
  - `github-oauth.ts:111` — `.json()` sin `catch`.
  - `App.tsx:533-560` — `importData` acepta cualquier JSON.
  - `/cover` vs `localCoverApi` (`vite.config.ts:417-468`) — recorte de `p` y `x=1` sin sello.
- **Vista**
  - `YearChart.tsx:292-293` — un solo punto pinta una cuña.
  - `SpeedGauge.tsx:167` — segmento encendido con 0.
  - `DonutShare.tsx:54-57` — denominador distinto al de la tarjeta vecina.
  - `FiltersSettings.tsx:70` — no deja cambiar solo mayúsculas.
  - `SocialProfileScreen.tsx:168` — `maxLength={60}` en vez de `PUBLIC_NAME_MAX_LENGTH`.
  - `coverMemory.ts:134-142` — `set` sin `delete` rompe el orden de poda.
  - `ShareReviewModal.tsx:68-73` — consentimiento reseteado un frame tarde.
  - `useScrollOnNavigate.ts:91-98` — un clic que no navega bloquea `ultima`.
  - Memos rotos: `StatsHub.tsx:167`, `StatsPanel.tsx:118`, `YearPanel.tsx:87`, `useAchievementNotice.ts:294`.
  - `PremiosPortada.tsx:147-149` — enseña «0 / 27».
- **Nombres y código muerto**
  - `GameTable.tsx:565`, `:921` — `cards` significa «list»; condición siempre cierta.
  - `firebaseProfileHealRepository.ts:263-270` — rama `profile.id !== uid` inalcanzable.
- **Comentarios que contradicen el código**
  - `announcement.ts:57-59` (par en `firestore.rules` que ya no existe), `crypto.ts:275-278`, `:290-305`,
    `types/firestore.ts:59`, `shareSchema.ts:13-15`, `useOpenFrontier.ts:48-50`, `socialPublishRepository.ts:29-41`,
    docblocks huérfanos en `admin/adminShared.ts` y `admin/adminCensus.ts`, duplicado en
    `indexedDbRepository.ts:429-436`, `useSignatureEffects.ts:18-20` («Clásico» → «Plata y acero»).
  - Textos `done` de `constancia` y `cadena-de-anos`: presente para la mejor racha histórica.
