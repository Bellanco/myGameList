# Plan: que la app siga siendo usable cuando un servicio se agota

> Objetivo: si se acaba un cupo gratuito (Firestore, Cloudflare Functions/KV, GitHub, reCAPTCHA) o un servicio se
> cae, el usuario sigue usando la app con lo que tiene en local, **sin ver errores** y sin que se estropee ningún
> dato. Lo que no se puede ofrecer se esconde o se explica en una línea, no se enseña como fallo.

> ⚠️ **Documento vivo.** Salió de la revisión del 04-10-2026 (tres barridos del código, uno por servicio, con los
> hallazgos graves comprobados a mano). Las líneas citadas se mueven: si una no coincide, manda el código y se
> corrige esto en la misma pasada.

## Cómo falla cada servicio

| Servicio | Al agotarse | Se reinicia |
|---|---|---|
| Firestore (Spark) | `FirebaseError` con código `resource-exhausted` («Quota exceeded.») | medianoche del Pacífico |
| Cloudflare Functions | según el ajuste de Pages *Settings → Runtime → Fail open / closed*: **fail closed** = página 1027 de Cloudflare (HTML); **fail open** = se sirve lo estático (aquí, `404.html` con estado 404). Los estáticos siguen en los dos casos | 00:00 UTC |
| Cloudflare KV | la operación lanza dentro de la Function («KV PUT failed: 429…»); sin captura acaba en 500 de Cloudflare | 00:00 UTC |
| GitHub | 403/429 con `x-ratelimit-remaining: 0` + `x-ratelimit-reset`, o `retry-after` (límite secundario, a veces sin cabeceras) | la hora que diga la cabecera |
| reCAPTCHA (App Check) | sin token; el SDK falla abierto y se bloquea un día tras un 403 | mensual |

Lo que **ya aguanta bien**: listas de juegos y su sincronización (no dependen de Firestore; la cola local es
persistente y respeta `x-ratelimit-reset`), la puerta legal, `getMyFriendships` (sirve copia vieja ante cualquier
fallo), latido, saneados de arranque, espejo de logros, resumen del año, apariencia, IGDB (503 blando) y App Check
con el cupo agotado (falla abierto).

## Fase 1 — Riesgos de datos · S · ✅ hecha (04-10-2026)

1. **Canal social vacío creado solo.** `attachExistingSocialGist` (`useSocialViewModel.ts`) traga el fallo de
   `getPrivateConfig`, y si `resolveOwnProfile` o la lectura del gist fallan devuelve `false`, que el llamador lee
   como «no tiene canal» y crea uno (`handleCreateSocialGist`, y el efecto «auto-crear»). Con Firestore sin cuota
   o caído, en un dispositivo sin la configuración social local, el usuario acaba con un canal nuevo y vacío, y al
   volver el servicio sus amistades pueden repuntarse a él.
   **Arreglo:** respuesta de tres valores (`linked` / `none` / `unknown`): `none` solo si las fuentes respondieron
   de verdad que no hay nada; cualquier fallo es `unknown`, y con `unknown` no se crea nada, se avisa en suave y el
   auto-crear no se repite en esa sesión.
2. **Posts duplicados.** `publishPost` escribe el gist y después `syncPublicIdentity` (Firestore); si esto falla,
   el usuario ve error con el texto aún en el compositor, reintenta y el post sale dos veces (id `profileId:now`).
   **Arreglo:** lo de Firestore tras escribir el gist es best-effort (se reintenta solo en la siguiente apertura).
3. **La frontera de logros puede retroceder.** `loadAchievementsConfig` devuelve la configuración vacía si falla
   la lectura, y `useOpenFrontier` llama a `advanceOpenFrontier`, que escribe la escalera. Con lecturas agotadas y
   escrituras no, se pisan escalones comunitarios.
   **Arreglo:** distinguir «falló» de «vacía» y no escribir sin una lectura buena.
4. **Borrar la cuenta con el servicio caído.** Si los borrados remotos fallan, igualmente se cierra la sesión y
   se borra lo local: quedan datos en Firestore y reintentar es difícil (RGPD, art. 17).
   **Arreglo:** si lo que falla es el servicio (cuota, caído, sin red), no tocar lo local ni la sesión y pedir que
   se reintente; el borrado remoto es idempotente.

## Fase 2 — «Modo servicio limitado» · M · ✅ hecha (04-10-2026)

- **Clasificador común** (`core/utils/network.ts`): cuota de Firestore (`resource-exhausted`), servicio caído
  (`unavailable`, `deadline-exceeded`, `internal`), límite de GitHub (403/429 con cabeceras o texto «rate limit»;
  hoy `buildGithubError` no guarda el estado), 429/5xx y respuestas que no son de la app (HTML).
- **Estado «limitado hasta»** por servicio, con la hora de reinicio de la tabla de arriba. Mientras dure, los
  repositorios sirven la copia local sin llamar, y se ve UN aviso discreto («Lo social está limitado hoy; tus listas
  funcionan con normalidad»), reutilizando `Notice`/`HubOfflineNotice`.
- **`reportFailure` deja de bloquear lo social** con errores de servicio: hoy cualquier error que no sea de red se
  pinta crudo (en inglés) en tono `err`, enciende `hasBlockingSocialIssue` y deja el feed y el editor bloqueados.
- **Feed con copias:** rescatar la copia caducada también con el clasificador nuevo; no vaciar lo que ya está en
  pantalla al pulsar «Actualizar»; marcar la copia como caducada en vez de borrarla al publicar/reconciliar/cambiar
  amistades; no guardar como fresco un feed con lecturas fallidas; cortar las lecturas pendientes tras el primer
  límite de GitHub.
- **`getSocialProfilesByUid`** (`firebaseSocialRepository.ts`, de `plan-directorio-amigos`): hoy un solo `getDoc`
  fallido rechaza todo y descarta las filas caducadas; debe usar la fila guardada de ese uid. `listSocialDirectory`
  igual con `getCachedDirectoryQuery`.
- **Gist social propio limitado:** rescatar el perfil cacheado aunque esté caducado (hoy solo con fallo de red).
- **El 403 de GitHub por límite** deja de decir «tu conexión con GitHub ha caducado» (`isGithubCredentialError`).
- **Premios:** `loadPremiosSnapshot` no puede devolver «vacío» ante un fallo: hoy `usePremiosVisible` guarda
  «oculto» en local y la entrada desaparece hasta que la API vuelve.
- **Enfriamiento compartido de GitHub** en `githubHttp.ts`: el token es el mismo para sync y social.

## Fase 3 — Compartir · M · ✅ hecha (04-10-2026)

- Cliente: `parse()` marca `unavailable` (estado 0, 429, ≥500 o cuerpo que no es JSON); `useShareViewModel` lo
  recuerda un rato (`Retry-After` o ~15 min) y **`ShareReviewButton` no se pinta** (hay retornos tempranos en
  `ShareReviewButton.tsx`). Ajustes enseña la última lista guardada en solo lectura en vez de «No has compartido
  ninguna reseña». Caché negativa en `listMyShares`.
- Servidor: `_middleware.ts` **solo en `functions/api/`** (nunca en la raíz: haría pasar los estáticos por
  Functions) que convierte excepciones en `503 {error, unavailable:true}` con `Retry-After`; el `try/catch` de
  `share/index.ts` deja de envolver las escrituras de KV («KV PUT failed: 429» llegaba al usuario) y `bumpDailyCount`
  no puede dar error tras publicar; `jwt.ts` tolera que falle la lectura de KV (hoy da «Sesión no válida»);
  `quota.ts` distingue el 429 de Firestore (hoy da «Necesitas tener tu espacio social creado»).
- Página pública: «no se puede cargar ahora» con reintentar, no «caducado o retirado»; `r/[token].ts` devuelve el
  shell si falla KV; el service worker sirve el shell en navegación si la red responde 429/5xx.

## Fase 4 — Carátulas · S · ✅ hecha (04-10-2026)

- `useCoverBackfill`: parar ante cualquier estado que no sea 2xx ni 404 (hoy un 500 recorre la biblioteca entera)
  y recordar una pausa según `Retry-After`.
- Apuntar «no tiene» solo con una cabecera propia (`X-Cover: no-tiene`) y nunca con HTML: con «fail open», `/cover`
  devolvería `404.html` y se apuntaría 90 días.
- `/cover` con `try/catch` → 503 `no-store`.
- **Después** de esto, poner Pages en «Fail open» (*Settings → Runtime*): la web sigue entera y solo se pierde lo
  que necesita Functions.

## Fase 5 — Menores · S

- Escala de nota solo en memoria: guardarla en local (o pasarla a `preferenceStore`); hoy vuelve a estrellas.
- Rango propio: copia local del último perfil leído; hoy cae a bronce (pierde compositor y cupo de premios).
- Copia local del aviso y de la configuración, categorías y papeleta de Premios.
- Sincronización: mensaje propio y en `warn` para el límite de GitHub, sin toast en ciclos automáticos, limpiar el
  mensaje al recuperarse; `syncNow` y `handleOnline` respetan `retryAfterMs`; mínimo de 60 s y tope mayor para el
  límite secundario.
- App Check: tope de 3-5 s en `getAppCheckToken` (si un bloqueador impide reCAPTCHA, «Compartir» se cuelga).
- Login de GitHub fallido: proponer la conexión manual con token.
- `preferenceStore.ts`/`ScoreScaleCard.tsx`: `.catch` en los `setPublicConfig` sueltos.

## Checklist

- [x] Fase 1 (04-10-2026): canal vacío (`attachExistingSocialGist` de tres valores y auto-crear cerrado en la
      sesión), posts sin duplicar (identidad best-effort tras escribir el gist), frontera solo sobre lectura buena
      y escribiendo la unión, borrado de cuenta que se detiene si el servicio no atiende. Clasificador
      `isServiceUnavailable` en `core/utils/network.ts`, listo para la Fase 2. Suite, e2e y emulador en verde.
- [x] Fase 2 (04-10-2026), en cinco commits:
      `59c37530` errores de servicio en tono `warn` con texto propio y aviso persistente «servicio limitado»
      (`HubOfflineNotice variant="limited"`), sin bloquear feed ni editor; `ae71328c` feed y perfiles con copias
      (`getSocialProfilesByUid` por uid, `listSocialDirectory`, rescate de la hidratación, lecturas parciales que no
      se guardan, caché del feed marcada como caducada en vez de borrada); `fb48c7e3` + `33e98eec` GitHub: estado y
      marca `rateLimited` en el error, espera compartida en `githubFetch`, el 403 por límite ya no es «conexión
      caducada», gist de amigo y listados de amigo con su copia; `e6364155` Premios no se apaga con la API caída;
      y la cuota de Firestore (`firestoreQuota.ts`): vista una vez, las lecturas sociales van a lo guardado hasta
      la medianoche del Pacífico.
      **Ajuste respecto al plan:** el aviso persistente lo retira el feed al cargar bien, aunque el perfil propio
      haya fallado (de eso avisa el mensaje breve): lo que se ve está al día.
- [x] Fase 3 (04-10-2026): servidor con `ServiceUnavailableError` + `unavailable()` (503, `unavailable: true`,
      `Retry-After` hasta las 00:00 UTC) y `functions/api/_middleware.ts` (las rutas generadas siguen siendo
      `/poster`, `/cover`, `/r/*`, `/api/*`); publicar distingue `InvalidShareError` (400) de KV; el contador diario
      no da error tras publicar; JWKS sin KV; perfil 429/5xx → no disponible; `/r/` con el shell si falla KV.
      Cliente: «no disponible» por la marca, un 5xx, HTML o sin red —**no** por el 429, que también es el límite
      diario—, recordado hasta 1 h; el botón no se ofrece; Ajustes enseña la última lista para copiar (se borra con
      la cuenta); página pública con «no se puede cargar ahora» y reintentar; el service worker sirve el shell si una
      navegación responde 429/5xx.
- [x] Fase 4 (04-10-2026): `useCoverBackfill` para ante HTML, 429 o 5xx y guarda una pausa
      (`COVER_BACKFILL_PAUSE_KEY`, `Retry-After` o 15 min, tope 24 h); otro 4xx se salta sin apuntar; «no tiene»
      solo con un 404 que no sea HTML (no se exige `X-Cover`, para no desconocer los 404 ya cacheados una semana
      en el borde, que no la llevan). `/cover` firma su 404 con `X-Cover: no-tiene` y convierte excepciones en 503
      `no-store` con `Retry-After`.
- [ ] Poner Pages en «Fail open» (*Settings → Runtime*): ya es seguro. Es un ajuste del panel, lo hace el usuario.
- [ ] Fase 5: menores.
