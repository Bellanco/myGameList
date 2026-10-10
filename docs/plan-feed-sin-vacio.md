# Plan: que el feed no parezca vacío cuando hay amistades activas

> **Estado (10-10-2026): Fases 1 a 5 hechas en `develop` (sin push); Fase 6 pendiente.** Diagnóstico hecho leyendo
> el código de `develop` (después de `4e178363`). Cada fase empieza escribiendo el test que demuestra el fallo.
>
> Fase 1, dónde quedó: `useSocialDirectory.ts` (`readToken`, `REJECTED_TOKEN`, `rejectedTokenRef`,
> `feedReadFailed`, `githubReconnectNeeded`), `useSocialFriendships.ts` (`friendshipsFailed`), `SocialFeedScreen.tsx`
> (aviso de reconectar y vacío por error), `SocialHub.tsx` (botón con `onOAuthLogin` o `/ajustes` sin OAuth).
> Tests: `socialDirectoryReadFailures.test.ts`, `SocialOffline.test.tsx`, `socialFriendshipEdges.test.ts`. Maqueta:
> `feed-fallo`, `feed-fallo-parcial`, `feed-github`. El token de lectura es el PRINCIPAL (`readToken`), así que el
> punto 5 no necesitó pasar por `resolveSocialChannel`. Se retiró `SOCIAL_UI.status.socialReadUnauthorized`.
>
> Fase 2, dónde quedó: `socialConsentGate.ts` (`canPublishSocialInBackground`, `sealLegalConsent`),
> `LocalMeta.legalConsent`, `openSocialWrite({ requireConsent })` en `socialPublishRepository.ts` y el sellado al
> aceptar en `useSocialLegalConsent.ts`. Test: `socialPublishConsent.test.ts`. Dos cambios sobre lo planeado: el hub
> **no sella al comprobar** (era una escritura de IndexedDB más en cada apertura; la puerta sella lo que lee), y
> **retirar una reseña no exige la aceptación** (es publicar menos).
>
> Fase 3, dónde quedó: `viewmodel/social/backgroundSocialPass.ts` (`runBackgroundSocialPass`,
> `useBackgroundSocialPass`, montado en `IdleWork`), `LocalMeta.backgroundSocialPassAt`. Lo que decide si hay algo
> nuevo salió a `core/social/activityStamp.ts` (`localActivityChanged`, `collectLocalReviews` y
> `RECONCILE_LOGIC_VERSION`, reexportada desde `socialActivityReconcile`) para no cargar Firebase al preguntarlo, y
> `PROFILE_TOUCH_MIN_INTERVAL_MS` a `core/constants/socialActivity.ts` (reexportada desde `firebaseRepository`). Guarda
> extra: sin sesión de Google guardada (`hasStoredAuthSession`) no se carga el SDK. Medido: arranque crítico 187,4 de
> 190 kB (+0,1); el chunk de `IdleWork` no importa Firebase de forma estática. Texto legal revisado: no dice cuándo
> se publica, así que no cambia. Tests: `backgroundSocialPass.test.ts` y `backgroundSocialPassHook.test.ts`.
>
> Fase 4, dónde quedó: `stampOwnFriendshipsOnReturn` (`firebaseFriendshipRepository.ts`), `signalReturnIfAsleep` en
> `firebaseRepository.ts` (desde `touchOwnProfileActivity` y, además de lo planeado, desde la reescritura de perfil de
> `ensureProfileByEmail`, que mueve `updatedAt` sin pasar por el latido), `friendshipStamps` en
> `getSocialProfilesByUid`/`directoryProfileIsFresh` y el sello en `socialDirectoryFriendsKey`. Sin reglas que
> desplegar; el caso está en `tests/integration/firestore.rules.test.ts` (emulador: 145 en verde). Tests:
> `friendshipReturnSignal.test.ts`, `socialProfilesByUid.test.ts`, `socialDirectoryFriendsKey.test.ts`. Arranque sin
> cambios (187,4 kB).
>
> Fase 5, dónde quedó: `ACHIEVEMENT_DATES_RELIABLE_FROM` y la retirada de `seen` en `core/achievements/feed.ts`;
> `useSocialFeed` sin línea base (pierde el parámetro `friendsResolved`); `useAchievementBaselines.ts` BORRADO (era del
> ViewModel). La tarjeta PROPIA sigue esperando a `ready` (lo publicado leído), para no salir en un día más tardío y
> saltar. Anotado en la revisión general (hallazgo 15) y en `plan-logros.md` §8.4.

> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## El objetivo

Si alguien tiene amistades aceptadas que han usado la app en los últimos 30 días, su feed no puede salir vacío ni
dar a entender que «nadie la usa» o que «no funciona». Si ninguna amistad tiene nada reciente, el feed queda como
hasta ahora.

## Lo que ya está bien (no se toca)

- Reseñas y publicaciones no tienen ventana: las de un amigo activo salen sean de cuando sean.
- Deriva de gist entre el directorio y la amistad: se leen los dos y se fusionan.
- Amigo con el perfil apagado, ilegible o sin publicar: entrada sintetizada desde la amistad, sin corte por recencia.
- GitHub limitando o Firestore sin cuota: se usa la última copia guardada.
- Amigo recién aceptado: depósito `friendshipKeys` + huella `friendsKey` (`4e178363`, falta desplegar el cliente).
- Reglas que vacían a propósito: listas ocultas, el filtro de listas de quien mira, movimientos de más de 30 días,
  fechas futuras de más de un día y amigos inactivos de más de 30 días.

Descartados por el usuario: la memoria del gist ganador de la deriva (`socialGistWinnerByFriend`, riesgo bajo) y el
amigo con la aceptación legal pendiente que no acepta (se queda inactivo, y es coherente con la regla).

## Decisiones del usuario (10-10-2026)

| Tema | Decisión |
|---|---|
| P1 · publicar fuera del hub | **Sí.** Al arrancar la app y al volver a la pestaña, **solo si hay cambios** y con un **mínimo de 8 h** entre pasadas. La «última vez activo» sigue siendo como mucho una escritura al día (grano diario por privacidad). |
| P2 · amigo que vuelve | Tiene que desbloquearse en cuanto vuelve, sin esperar a que caduque la copia de 24 h. |
| P3 · logros | Los de las amistades son solo visibles: fuera la «primera foto». **Con cota**: hasta el 28-10-2026 no salen en el feed los fechados antes del 29-09-2026. |
| P4 · token caducado | Esos amigos se tratan como sin leer (**nada de reintentar sin token**: el cupo anónimo es de 60 peticiones/h por IP). Aviso de reconectar con botón. |
| P5 · lectura fallida | **Con copia local, ningún aviso.** Sin copia, error genérico. |
| Legal | **Sin la aceptación vigente no sale nada** del dispositivo, tampoco la «última vez activo». Aviso en el hub, como hoy, y además una **cápsula** en el carril de abajo que lleva a la pantalla de aceptación. |

## Fase 1 — Lectura fallida y token caducado (P5 + P4)

**Hoy.** Si una lectura falla y hay copia, se muestra la copia pero con un aviso de «servicio limitado» o «sin
conexión» (`useSocialDirectory.ts`, `reportFailure` tras `transientFailure`). Si no hay copia, la pantalla de vacío
dice «Todo tranquilo, tus amigos aún no han compartido nada» (`SocialFeedScreen.tsx`). Si fallan las amistades, el
error se descarta (`useSocialFriendships.ts`, `catch` vacío) y la pantalla dice «empieza buscando gente». Con el
token caducado, cada amigo dispara su propio 401 y el aviso dura unos segundos.

**Cambios.**
1. **Una sola ruta para «no se pudo leer este amigo».** Fallo pasajero (red, límite, 5xx) **o 401/403 de
   credencial** → `previousEntryOf(uid)` (la copia del directorio, aunque haya caducado). Con copia: se usa y **no se
   avisa**. Sin copia: la entrada queda `socialUnreadable` y se cuenta. Un **404** se queda como hoy («ese perfil ya
   no publica»): ni copia ni error. El resultado de una pasada con copias **no se guarda** como copia nueva (ya es así
   para los pasajeros; se extiende al 401).
2. **Corte al primer 401** en la pasada: los amigos que falten no lanzan petición (van directos al punto 1).
   Muchos fallos de credencial seguidos desde una IP hacen que GitHub la bloquee un rato.
3. **Error genérico** cuando algún amigo se queda sin lectura y sin copia, o cuando fallan las amistades sin copia.
   Si el feed queda vacío por eso, la pantalla de vacío enseña el error en lugar de «todo tranquilo» o «busca
   gente». Texto propuesto: «No hemos podido cargar la actividad de tus amigos. Inténtalo de nuevo en un rato.» El
   vacío sin red mantiene su texto propio (`SOCIAL_UI.offline.bodyEmpty`).
4. **Aviso de reconectar GitHub**, fijo en el feed mientras dure el 401 (no una notificación que se va): «Tu conexión con GitHub
   ha caducado» + botón **«Volver a conectar»**, que reutiliza `beginGithubLogin` de `useSyncViewModel`. El OAuth ya
   vuelve a la pantalla de la que se salió (`ORIGIN_STORAGE_KEY`). Este aviso sale haya copia o no: sin él, el
   usuario no sabría que tiene que reconectar y tampoco podría publicar.
5. **Renovar la copia del token tras reconectar.** El feed lee con `getSocialSyncConfig()?.token`, una copia del
   token principal que solo se renueva en `resolveSocialChannel` (al publicar o reconciliar). Antes de releer el
   directorio hay que pasar por `resolveSocialChannel`, o el aviso no se iría.
6. **Amistades:** el `catch` de `refreshFriendships` deja de descartar el error y lo marca como «amistades sin
   cargar», para que el punto 3 lo vea. `getMyFriendships` ya sirve la copia guardada cuando la hay: solo falla sin
   copia.

**Tests.** En `SocialHub.test.tsx` o en uno nuevo: fallo pasajero con copia → actividad visible y sin aviso; fallo
sin copia → error genérico en lugar de «todo tranquilo»; 401 → una sola petición a GitHub, aviso de reconectar y
copia visible; amistades que fallan sin copia → error genérico, no «busca gente».

**Maqueta.** Añadir a `docs/maquetas/social.html` el aviso de reconectar y el vacío por error, y capturarlos con
`scripts/capturar-maqueta-social.mjs` en varios temas.

## Fase 2 — Puerta legal única para lo que sale fuera del hub

Requisito de la Fase 3, y arregla de paso que **la publicación de reseñas desde la app principal**
(`applyReviewPublication`, llamada desde `App.tsx`) **no comprueba hoy la aceptación vigente**.

**Cambios.**
1. **Versión aceptada en local**: `LocalMeta.legalConsent` (`uid`, versión y fecha). La sella la propia puerta con
   lo que lee de Firestore, y el hub al aceptar.
2. **`canPublishSocialInBackground(uid)`**: cierto solo si la versión sellada es `LEGAL_VERSION`. Sin sello, una
   lectura de `publicConfig/{uid}` como mucho al día. **Si la lectura falla, no se publica** (más estricto que el
   hub, que deja pasar con el estado `unknown`: publicar en segundo plano sin que la persona vea las condiciones es
   justo el caso que necesita certeza).
3. Sin aceptación: **no sale nada**, ni la «última vez activo», ni reseñas, ni movimientos. Se marca
   `markPendingSocialActivity()` y, al aceptar en el hub, la reconciliación publica lo que falte (las reseñas
   todas; los movimientos, dentro de los 30 días).
4. Se aplica a `publishReviewActivity` y a la pasada de la Fase 3. `unpublishReviewActivity` no la pide: retirar una
   reseña es publicar menos, y bloquearlo dejaría a la vista algo que la persona quiere quitar.

**Tests.** Unitario de la puerta (sellado, sin sello con lectura buena o fallida, versión vieja). Publicación de
reseña con versión vieja → no escribe y deja la marca de pendiente.

## Fase 3 — Publicar desde la app principal (P1)

**Hoy.** La «última vez activo» (`touchOwnProfileActivityThrottled`) y la reconciliación (`reconcileReviewActivity`)
solo corren con el hub abierto (`useSocialStartupTasks.ts`, `useSocialViewModel.ts`). Los movimientos solo salen
ahí o de paso al guardar una reseña (`withMoveActivity`). Quien usa la app sin abrir el hub desaparece del feed de
sus amigos a los 30 días.

**Cambios.**
1. Un hook nuevo montado desde `IdleWork` (fuera del chunk de arranque), que corre **al arrancar y al volver a la
   pestaña** (`visibilitychange`), cuando el navegador queda ocioso.
2. Condiciones, en este orden y sin red hasta la última: el social dado de alta en este dispositivo (config social
   con gist y token), la puerta legal de la Fase 2, **8 h** desde la última pasada (`LocalMeta.backgroundSocialPassAt`)
   y hay cambios. Para «hay cambios» basta el recuento que ya usa la reconciliación (`activityReviewCount`,
   `activityMoveCount`, versión y marca de pendiente), sin red.
3. Qué hace: `reconcileReviewActivity({ games })`, que ya publica movimientos y reseñas pendientes y retira los
   huérfanos (1 GET + 1 PATCH a GitHub si hay cambios), y `touchOwnProfileActivityThrottled`, que sigue a 20 h. La
   «última vez activo» solo se escribe si pasa la puerta, aunque no haya cambios que publicar.
4. Que no estorbe: sin aviso en pantalla, y los fallos no se muestran (se reintenta en la siguiente pasada). Va en
   la misma fila de escrituras que el hub (`serializeSocialWrite`).

**Con la app cerrada no se ejecuta nada.** Si la persona vuelve a las 36 h o tras varios días, la pasada corre al
abrir y publica todo lo de los últimos 30 días que falte. Cada movimiento sale en el día en que movió el juego, porque
se calcula de las fechas guardadas en él. Lo de más de 30 días no se publica (tampoco lo vería nadie).

**Medir antes de comitear.** Peso del arranque contra el tope de `scripts/ci-validate.js` (215 kB): Firebase y el
publicador tienen que llegar por `import()` dentro del hook, nunca de forma estática. Delta medido con un worktree
contra `HEAD`.

**Tests.** Que no corra sin social, sin aceptación, antes de 8 h ni sin cambios. Que corra con cambios y respete la
fila de escrituras. Que la «última vez activo» no se escriba sin aceptación.

## Fase 4 — Señal de regreso (P2)

**Hoy.** La copia del perfil de un amigo dormido (más de 30 días) vale 24 h (`directoryProfileIsFresh` +
`INACTIVE_PROFILE_MAX_AGE_MS`). Si vuelve, sus amigos tardan hasta un día en verlo, porque no tienen forma de saber
que ha vuelto.

**Cambios.**
1. **Quien vuelve avisa.** `touchOwnProfileActivity` ya lee su perfil antes de escribir: si el `updatedAt` anterior
   tenía más de 30 días, sella también el `updatedAt` de **sus documentos de amistad aceptados** (solo ese campo). Las
   reglas ya lo permiten (`friendshipHealOwnFields`: `affectedKeys().hasOnly([... "updatedAt"])`), así que **no hay
   que desplegar reglas**. Coste: una escritura por amistad, una sola vez por regreso.
2. **Quien mira lo nota.** `getSocialProfilesByUid` recibe el `updatedAt` de cada amistad. Una copia de perfil
   **dormida** cuyo `cachedAt` sea anterior a ese sello no vale y se relee: con eso queda desbloqueado.
3. La huella del directorio (`socialDirectoryFriendsKey`) incluye ese sello, para que la copia del feed (≤30 min)
   tampoco tape el regreso. También la cambia un saneado de identidad (nick o foto), que es raro y solo cuesta
   una rehidratación.

Retraso tras el regreso: de 24 h a ≤45 min (15 min de copia de amistades + ≤30 min de feed).

**Tests.** Unitario de `directoryProfileIsFresh` con el sello de la amistad; `touchOwnProfileActivity` con perfil
dormido → escribe las amistades; con perfil activo → no las toca. Reglas: test en el emulador de que un participante
puede escribir solo `updatedAt` en su amistad.

## Fase 5 — Logros visibles sin «primera foto» (P3)

**Hoy.** Un logro de un amigo solo sale en el feed si **no** estaba en la primera foto que tomó este dispositivo
(`useAchievementBaselines`, `achievementsPeerSeen`). Con una amistad nueva o un dispositivo nuevo no sale ninguno.

**Cambios.**
1. `achievementFeedEntries` deja de filtrar por la foto: sale todo logro fechado en los últimos 30 días, con su
   tope de 5 días por persona. Vale para amigos y para los propios.
2. **Cota temporal** `ACHIEVEMENT_DATES_RELIABLE_FROM = 29-09-2026` (el día siguiente a la 1.4.7, `32e43d83`,
   `freezeDates`): en el feed no sale ningún logro fechado antes. Las fechas malas publicadas antes del arreglo
   siguen congeladas en los espejos, y la cota las tapa hasta que salen solas de la ventana el 28-10-2026. **A
   partir de ese día la cota no recorta nada** y se retira en una limpieza (anotar en la revisión general).
3. `useSocialFeed` deja de usar `useAchievementBaselines`. Su guardado en `src/model/repository/`
   (`seedAchievementsPeerSeen`) y el campo de `LocalMeta` **no se borran sin preguntar** (regla de staging del
   repositorio).
4. Corregir `docs/plan-logros.md` §8.4 (la línea base deja de existir en el feed).

**Tests.** Amistad nueva con un logro de hace 3 días → sale; logro fechado el 20-09 → no sale (cota); logro de hace
40 días → no sale.

## Fase 6 — Cápsula del aviso legal

**Cambios.** Una cápsula más del carril de abajo a la izquierda, con el mismo lenguaje que `AnnouncementToast` y
`YearSummaryToast`: «Hay condiciones nuevas. Acéptalas para seguir compartiendo tu actividad». Al pulsarla lleva a
`/social`, que abre la pantalla de aceptación.

- Sale solo a quien tiene el social dado de alta en ese dispositivo y no tiene la versión vigente (lo sabe la
  puerta de la Fase 2, sin lecturas extra).
- **Una vez por versión** (`LocalMeta.legalNoticeShownFor = LEGAL_VERSION`). Perezosa, como las otras cápsulas: su
  hoja y su chunk no viajan en el arranque (ver la memoria de chunks de CSS).
- Revisar en todos los temas: cada skin cuadra la cápsula en el suyo.

**Tests.** Que salga con la versión vieja, una sola vez, y que lleve a `/social`. a11y de la cápsula con la región
viva, como sus gemelas.

## Orden y despliegue

1. Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 6. Cada una con su test en rojo antes del arreglo, la suite
   en verde y un commit propio, en llamadas separadas (nunca `test | grep && commit`). Comitear solo los ficheros
   propios: hay otra sesión con cambios sin comitear en `gistConfigRepository.ts` y `gistConfig.test.ts`.
2. **No hay reglas que desplegar**: la Fase 4 usa permisos que ya existen. Aun así, pasar `audit:rules` y el test del
   emulador antes de subir.
3. **Texto legal**: no cambia qué se publica, solo cuándo (el texto no dice «al abrir el espacio social»).
   Comprobarlo en `core/constants/legal.ts` al cerrar la Fase 3: si algo lo contradice, se corrige el texto y se
   decide con el usuario si sube `LEGAL_VERSION`.
4. CHANGELOG y la checklist de despliegue del README.
