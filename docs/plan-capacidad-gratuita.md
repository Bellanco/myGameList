# Plan: capacidad sin salir del plan gratuito

> Objetivo: subir el techo de usuarios **sin pagar** (Cloudflare Free + Firebase Spark) quitando los consumos
> que no aportan nada y, sobre todo, los que puede disparar **gente de fuera** de la app.

> ⚠️ **Documento vivo.** Salió del análisis de capacidad del 30-09-2026. Los recuentos de ficheros están medidos
> sobre el `dist` de ese día; el consumo por usuario es una **estimación leyendo el código**, no una medición en
> producción (ver Fase 0). Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## TL;DR

| Fase | Qué | Esfuerzo | Qué gana |
|---|---|---|---|
| 0 | Línea base de consumo real *(pendiente)* | S | Saber de qué número partimos y comprobar cada fase |
| 1 | Frenar la reconsulta de `/api/premios` ✅ | S | Deja de gastar 1 invocación + 1 lectura de KV **cada vez que se vuelve a la pestaña** |
| 2 | Enlaces relacionados sin `list()` ✅ | M | Una visita anónima pasa de 1 *list* + ~51 lecturas a **2 lecturas**; se cierra la puerta por la que un enlace viral tumba los enlaces de todos |
| 3 | Sacar `/assets/*` y `/fonts/*` de las Functions ✅ *(falta la vista previa de Cloudflare)* | M | Un dispositivo nuevo pasa de ~36 invocaciones a **0** por arrancar, y un despliegue deja de costar ~18 por dispositivo |
| 4 | Amistades en caché persistente ✅ | M | Deja de leer N documentos de `friendships` en cada recarga del social |
| 4b | Directorio y clasificación de premios en caché persistente ✅ | M | La consulta del directorio (hasta 50 lecturas) se guarda en IndexedDB con una edad según el rango |
| 5 | Umbrales de vigilancia *(pendiente)* | S | Avisar antes de que un cupo corte, no después |

Orden recomendado: 0 → 1 → 2 → 3 (con su prueba previa) → 4. Cada fase es un commit independiente y reversible.

**Estado (revisado el 01-10-2026):** fases 1 (`10094472`), 2 (`fc666e23`), 3 (`7d84a1f6`), 4 (`e6848d7b`) y 4b
(`2a5364de`) hechas el 30-09-2026. Pendientes: la Fase 0, la Fase 5 y la comprobación de la Fase 3 en la vista
previa de Cloudflare.

---

## Por qué estas y no otras: los cupos que cortan

Todo se reinicia cada día (KV y Workers a las 00:00 UTC; Firestore a medianoche del Pacífico).

| Cupo gratuito | Techo | Quién lo gasta hoy |
|---|---|---|
| KV · *list* | **1.000/día** | `/api/share/mine` (**cada detalle de reseña propia** y Ajustes → Personalización, sin caché en el cliente), publicar (`/api/share/related` ya no lista: lee el índice por autor, Fase 2) |
| KV · escrituras | **1.000/día** | Carátulas (tope propio de 700, `COVER_DAILY_BUDGET`; lo ajeno, `c=2`, solo resuelve por debajo de 250, `COVER_DAILY_BUDGET_AJENO`, desde el 05-10-2026) + publicar (5 por enlace desde la Fase 2) |
| Workers (Functions) | **100.000/día** | `/cover`, `/api/*`, `/r/*` (`/assets/*` y `/fonts/*` ya son estáticos, Fase 3) |
| KV · lecturas | 100.000/día | `/cover` sin caché, avisos, premios, enlaces |
| Firestore · lecturas | **50.000/día** | 3–4 por apertura; el social, ~110–170 por usuario medio y día y ~600–1.000 el intenso (recontado el 04-10-2026) |
| IGDB | 4 pet./s globales | Llenado inicial de carátulas (falla blando: 503 y reintento) |
| reCAPTCHA (App Check) | 10.000/mes | ~1 por hora de sesión con cuenta (falla abierto; ver Fase 5) |

Medido sobre el `dist` del 30-09-2026: el arranque pide **17 ficheros de `/assets` + 1 fuente**, y el service
worker vuelve a pedir esos **18** con `cache: 'reload'` al instalarse. Como las dos rutas son Functions, un
dispositivo nuevo gasta ~36 invocaciones solo en arrancar, más las pantallas perezosas. (Era así antes de la Fase 3:
hoy esos ficheros son estáticos y no cuentan.)

---

## Fase 0 — Línea base · S

Antes de tocar nada, apuntar **una semana** de consumo real para poder comparar:

- Cloudflare → Workers & Pages → `mygamelist` → *Metrics*: peticiones de Functions al día y su reparto por ruta.
- Cloudflare → KV → `mygamelist-shares` y `mygamelist-covers` → *Metrics*: lecturas, escrituras y *list* al día.
- Firebase → Firestore → *Uso*: lecturas y escrituras al día.
- Panel de admin: contador diario de carátulas (`/api/cover-stats`).

Apuntar los números al pie de este documento (sección «Mediciones»).

---

## Fase 1 — Frenar la reconsulta de premios · S · ✅ hecha (30-09-2026)

**Problema.** `usePremiosVisible` (montado siempre, desde `SettingsMenu`) sube `sello` en cada
`visibilitychange` a visible, y con `sello > 0` llama a `loadPremiosSnapshot(true)`, que hace
`fetch(API, { cache: 'no-store' })`. Es decir: **cada vuelta a la pestaña es una invocación y una lectura de KV**,
saltándose los 300 s de `Cache-Control` que el comentario da por buenos. Quien alterna ventanas cien veces al día
gasta cien.

**Cambio.** El mismo freno que ya tiene el aviso (`useAnnouncement`, `RECHECK_MS = 5 min`):

- La vuelta a la pestaña solo refresca si han pasado **5 minutos** desde la última consulta.
- El evento del panel (`PREMIOS_VISIBILITY_EVENT`) y el `BroadcastChannel` **siguen forzando** sin freno: son
  la vía por la que el administrador ve al momento lo que acaba de publicar.

**Verificación.** Test del hook con temporizadores falsos: dos vueltas en menos de 5 min → una sola petición;
una vuelta pasados 5 min → otra; el evento del panel → siempre.

---

## Fase 2 — Enlaces relacionados sin `list()` · M · ✅ hecha (30-09-2026)

**Problema.** `GET /api/share/related/:token` es **anónimo** y, por cada visita, hace
`kv.list({ prefix: 'user:{uid}:' })` y luego lee **cada** artículo del autor (hasta
`SHARE_MAX_ACTIVE_CEILING` = 50). Con **1.000 visitas al día** a enlaces compartidos se agota el cupo de *list*
de la cuenta entera, y desde ese momento **nadie** puede publicar ni abrir «mis enlaces» (`listActiveShares`
también lista). Es el único cupo pequeño que puede agotar alguien sin cuenta.

La Cache API del borde no sirve: no funciona en `*.pages.dev`.

**Cambio.** Un índice precalculado por autor, con lo justo para puntuar y pintar las tarjetas:

- Clave nueva `relidx:{uid}` (**no** puede empezar por `user:`: `/api/share/all` recorre ese prefijo y parte la
  clave por el último `:`). Valor: lista de `{ token, gameName, genres, rating, grade, snippet (160),
  reviewedAt, createdAt, expiresAt }` de sus enlaces activos. Con 50 enlaces son ~25 KB.
- **Se escribe una vez por operación**, no dentro de `removeShare`: `mine.ts` y `ban/[uid].ts` borran varios en
  paralelo y un leer-modificar-escribir por enlace se pisaría. Al publicar/renovar (`share/index.ts`), al retirar
  uno (`share/[token].ts`), al retirar todos (`mine.ts`) y al vetar (`ban/[uid].ts`).
- **Se autorrepara**: `readShareStatus` ya lista los enlaces vivos (fuente de verdad); si el índice no coincide, se
  reescribe. Así una carrera entre dos publicaciones simultáneas del mismo autor se corrige en su siguiente visita
  a «mis enlaces».
- `related` pasa a leer **dueño + índice** (la fila del propio enlace hace de ancla): 2 lecturas, 0 *list*, 0
  lecturas de artículos. Filtra los caducados por `expiresAt`. **Sin índice → lista vacía** (el pie no se pinta);
  nunca vuelve a listar ni escribe.
- **Migración perezosa, sin script.** El índice de un autor con enlaces anteriores se crea la primera vez que abre
  «mis enlaces» o publica (la reparación lee los artículos que falten). Hasta entonces sus enlaces salen sin
  sugerencias, y los que nunca se reparen caducan solos en 7-90 días (`PROFILE_TIER_SHARE_TTL_DAYS`). Se descartó
  un script con `wrangler kv` porque habría que duplicar fuera de `functions/` la forma de las filas.

**Coste asumido.** Publicar pasa de 4 a 5 escrituras de KV: con el reparto de `COVER_DAILY_BUDGET` quedan ~57
publicaciones diarias en vez de ~71, muy por encima del uso real. Actualizar la cuenta en el comentario de
`COVER_DAILY_BUDGET` (`functions/_lib/keys.ts`) y en `docs/plan-compartir-resenas.md`.

**Privacidad.** El índice solo guarda lo que `related` ya enseña (adelanto de 160, nota, fecha, géneros); el uid
va en la clave, igual que en `owner:{token}`, y nunca en la respuesta.

**Verificación.** Tests de la función: publicar/retirar/vetar dejan el índice igual a lo que devuelve el listado;
`related` no llama a `list` (espía sobre el KV falso); índice ausente → `items: []`; caducados fuera.

---

## Fase 3 — `/assets/*` y `/fonts/*` como estáticos · M · ✅ hecha (30-09-2026, `7d84a1f6`)

**Problema.** `functions/assets/[[path]].ts` y `functions/fonts/[[path]].ts` convierten cada fichero del build
en una invocación de Workers. Existen por dos motivos:

1. **El 404 de los chunks viejos** (`_lib/staleAsset.ts`): con `/* /index.html 200` en `_redirects`, un chunk que
   ya no existe devuelve el shell con un 200, y `_headers` le pone `immutable`. Eso deja el dispositivo inservible
   un año.
2. **El brotli de calidad 11** del build (`_lib/brotliAsset.ts`): 159 kB de arranque frente a 185 kB (medido el
   25-09-2026).

**Cambio propuesto.** Resolver el motivo 1 sin Function y renunciar al motivo 2:

- Sustituir el comodín `/* /index.html 200` por **las rutas reales de la SPA**, una a una (`/social/*`,
  `/ajustes/*`, `/premios/*`, `/stats/*`, `/logros`, `/bandeja`, `/admin`, `/en-curso`, `/completados`,
  `/abandonados`, `/proximos`… ~15 hoy), todas a `/index.html 200`.
- Añadir un `404.html` de primer nivel (copia del shell, para que una ruta desconocida siga arrancando la app).
  Pages lo sirve **con estado 404** para lo que no casa, incluidos los chunks viejos. Un 404 cacheado bajo un hash
  muerto es inofensivo (ese hash no vuelve a existir) y sí dispara `vite:preloadError`.
- Borrar las dos Functions (`_routes.json` se regenera sin esas rutas) y el plugin `brotliAssets`.
- **Test de pares**, como los límites duplicados: las rutas del router y las de `_redirects` tienen que coincidir.
  Una ruta nueva olvidada daría 404 al recargar en ella.

**Prueba previa obligatoria.** La documentación de Pages **no** fija el orden entre `_redirects`, estáticos y
`404.html`. Antes de tocar nada, comprobar con `wrangler pages dev dist` y en un despliegue de vista previa que:
un chunk inexistente da 404; cada ruta de la SPA da 200 con el shell (también al recargar dentro de ella); los
ficheros existentes se sirven con sus cabeceras de `_headers`; `/r/:token`, `/cover` y `/api/*` siguen en sus
Functions.

**Lo que enseñó la prueba (30-09-2026, `wrangler pages dev`).**

- **El comodín `/* /index.html 200` ya no hacía nada**: Pages lo detecta como bucle y lo descarta. La SPA
  funcionaba porque no había `404.html` (modo SPA), no por esa regla. Por eso las reglas nuevas apuntan a `/`.
- `/social/*` **no** cubre `/social` a secas: hacen falta las dos líneas.
- `functions/r/[token].ts` pide el shell con `context.next()`. Sin la regla `/r/*`, un enlace **válido** habría
  salido con estado 404, y los generadores de vista previa (WhatsApp, Telegram…) suelen descartar esas páginas.
- El `404.html` tiene que copiarse **después** de que `serviceWorkerPrecache` escriba el identificador de build
  en `index.html` (`closeBundle` con `order: 'post'`); `npm run validate` comprueba que salen iguales.
- Resultado: todas las rutas de la app (también las retiradas) → 200 con el shell; una dirección inventada, un
  chunk viejo y una fuente vieja → 404 con `no-store`; los ficheros existentes con su `immutable`; `/r/:token` →
  200 con su `og:title`; `/api/share/related` sigue en su Function. E2e: 276 en verde sobre el `dist` nuevo.

**Queda por comprobar en la vista previa de Cloudflare** (no se puede en local): lo mismo de la lista de arriba
contra el borde real, y en especial que `/r/:token` salga con 200 y que un chunk viejo dé 404.

**Qué se gana / qué se pierde.** Un dispositivo nuevo: ~36 invocaciones → 0 por arrancar. Un despliegue: ~18 por
dispositivo activo → 0. Un visitante de un enlace compartido: ~40 → 3 (`/r`, artículo, relacionados). A cambio,
**+26 kB en la primera carga** (las siguientes salen del service worker).

**3-bis (no hace falta con la fase 3 hecha).** Precachear los ficheros con hash **sin** `cache: 'reload'` y dejarlo solo
para el shell (`/`, `/manifest.json`). El hash garantiza el contenido, y `isShellFallback` sigue descartando un
HTML colado. El despliegue baja de ~18 invocaciones por dispositivo a casi 0; el arranque en frío sigue en ~36.

---

## Fase 4 — Amistades en caché persistente · M · ✅ hecha (30-09-2026)

**Problema.** `getMyFriendships` solo guardaba 60 s **en memoria**: cada recarga de la página con el social
abierto leía N documentos de `friendships`, uno por amigo. El directorio ya vivía en IndexedDB 30 min; las
amistades no.

**Lo implementado.**

- Copia en IndexedDB (`__friendships__:<uid>` en `profileCache`, con versión de forma) y **una sola edad**:
  memoria, luego IndexedDB, luego Firestore. Por defecto vale **15 min** (`MY_FRIENDSHIPS_MAX_AGE_MS`, decisión
  del usuario).
- **La pantalla de solicitudes pide 60 s** (`MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS`), la frescura de antes: es a
  donde se va a ver si ha llegado alguna. Ir y volver entre pantallas no cuesta lecturas mientras la copia tenga
  la edad que pide cada una.
- La dedupe «en vuelo» cubre solo la lectura de red, para que quien pide 60 s no herede la respuesta de quien se
  conformaba con 15 min.
- `invalidateMyFriendshipsCache` borra también la copia persistente y deja una **marca de tiempo**: una copia o
  una lectura anterior a la invalidación no se sirve ni se guarda (el borrado de IndexedDB es asíncrono, y una
  lectura que salió antes de aceptar una petición puede no traer la aceptación). Las acciones propias siguen
  releyendo al momento con `forceRefresh`.
- Si Firestore falla (sin salida, caído) y hay copia, se sirve aunque sea vieja, como el directorio sin red.
- El borrado de cuenta ya elimina la base de IndexedDB entera, así que la copia no deja rastro.

**Coste asumido.** Una petición que te envíen puede tardar hasta 15 min en aparecer en el feed o en el contador
de la campana; en la pantalla de solicitudes, como mucho 60 s.

**Verificación.** `tests/unit/friendshipRepository.test.ts` (recarga dentro de 15 min sin consulta, pasados 15 min
sí, 60 s en solicitudes, invalidación, copia vieja sin red, lectura en vuelo durante una invalidación) y
`tests/component/SocialHub.test.tsx` (la pantalla de solicitudes pide 60 s).

---

## Fase 4b — Directorio y clasificación de premios en caché persistente · ✅ hecha (30-09-2026)

**Problema.** La consulta del directorio (`profiles`, hasta 50 documentos = 50 lecturas) se repetía cada vez que
caducaba el feed: cada 30 min en bronce, 15 en plata, 10 en oro. Era el mayor gasto de Firestore que quedaba, ~100
lecturas por hora de uso del social y usuario. Y la clasificación de premios pedía hasta 60 perfiles **en cada
visita** con sesión, porque la única caché era la de 30 s en memoria (su comentario daba por hecho otra cosa).

**Lo implementado.** `listSocialDirectory` acepta `maxAgeMs` y guarda cada consulta en IndexedDB (un registro,
una entrada por tamaño). La edad la marca el rango de quien mira, decisión del usuario:

| Rango | Directorio (`PROFILE_TIER_DIRECTORY_TTL_MS`) | Premios (`PROFILE_TIER_PREMIOS_PROFILES_TTL_MS`) |
|---|---|---|
| Bronce | 2 h | 6 h |
| Plata | 1 h 30 | 4 h |
| Oro | 1 h | 2 h |
| Mithril | 30 min | 30 min |

La actividad de los amigos sigue al ritmo del feed (sale de sus gists). Lo que tarda más en verse es lo que vive en
el perfil de los demás: un perfil nuevo en «descubrir», nick, foto, rango y logros. Lo propio se ve al momento:
cada escritura del perfil invalida la copia (también la de IndexedDB), y los refrescos forzados se la saltan.

**Verificación.** `tests/unit/socialDirectoryPersisted.test.ts`.

---

## Fase 5 — Umbrales de vigilancia · S

No es código: son los números a los que hay que mirar, para apuntarlos en la checklist de despliegue del README
(pendiente: revisado el 01-10-2026, el README aún no los recoge).

- **Al 60 % de cualquier cupo diario** (Fase 0 dice dónde mirar) → revisar antes de que corte.
- **App Check sigue en `monitor`.** No pasar a `enforce` por encima de ~300 usuarios activos al día sin
  facturación: reCAPTCHA da 10.000 verificaciones al mes.
- **Panel de admin**: `adminCensus` y `revokePalmares` leen colecciones enteras (perfiles, amistades). Con 2.000
  perfiles y 5.000 amistades, cada apertura del censo son ~7.000 lecturas, el 14 % del día. Abrirlo con cuidado.
- **Carátulas**: el contador diario del panel. Con la cuota de 700, caben ~2 bibliotecas grandes nuevas al día.

---

## Lo que NO se hace

- **Pasar a Workers Paid ni a Blaze.** Es la solución más barata en esfuerzo, pero la decisión es mantener la app
  gratuita. Queda como salida si los cupos vuelven a apretar tras este plan.
- **Caché del borde (Cache API).** No funciona en `*.pages.dev`.
- **Tocar el cupo de carátulas ni poner cola a IGDB.** Ya falla blando (503 sin guardar y reintento), y
  `COVER_DAILY_BUDGET` protege las escrituras de KV que comparten con los enlaces.
- **Paginar el censo del panel.** Solo lo usa el administrador; se vigila (Fase 5).
- **Leer gists ajenos con otra estrategia.** GitHub limita por usuario (5.000/h), no de forma global.

## Impacto esperado (estimado; confirmar con la Fase 0)

| Perfil | Invocaciones hoy | Tras el plan |
|---|---|---|
| Dispositivo nuevo, sin carátulas | ~45–50 | ~2–3 |
| Usuario habitual, día normal | ~10–30 | ~5 |
| Usuario habitual, día de despliegue | +25–35 | +0–2 |
| Visitante anónimo de un enlace | ~40 invocaciones + 1 *list* + ~51 lecturas de KV | 3 invocaciones + 4 lecturas |

*(Recontado el 04-10-2026: ver «Revisión del 04-10-2026» al final; el primer techo resultó ser KV *list*.)*

Con eso, Workers deja de ser el primer techo para el uso normal: pasa a serlo **Firestore** (~5.000 activos al
día con uso ligero, menos cuanto más social) y, para usuarios nuevos, **las carátulas**.

## Checklist

- [ ] Fase 0: una semana de números apuntada abajo.
- [x] Fase 1: test del freno en verde (falla con el código anterior). En producción: comprobar que las invocaciones de `/api/premios` caen.
- [x] Fase 2: `related` sin `list` (probado con `wrangler pages dev` y KV local); comentarios de cupo actualizados.
- [x] Fase 3: prueba previa en `wrangler pages dev`; test de pares de rutas (`tests/unit/redirectsRoutes.test.ts`).
- [ ] Fase 3: comprobación en la vista previa de Cloudflare antes de subir a producción (ver arriba).
- [x] Fase 4: TTL de 15 min (60 s en solicitudes); recarga del hub sin consulta a `friendships`.
- [ ] Suite completa (`npm test`, `npm run test:rules`, `npm run test:e2e` sobre un `dist` recién construido) y
      checklist de despliegue del README en cada fase.

## Mediciones

*(Rellenar en la Fase 0 y tras cada fase.)*

## Revisión del 04-10-2026 (recuento sobre `d407ccd9`)

Estimación leyendo el código, como el resto del documento; la Fase 0 sigue pendiente.

**Por usuario y día** (ligero: 1–2 aperturas sin social · medio: social ~1 h, N≈10 amigos, 1 reseña, 5 detalles
de reseña propia · intenso: social varias horas, N≈30, 3 reseñas + 1 post, premios, perfiles de amigos con carátulas):

| Cupo | Ligero | Medio | Intenso |
|---|---|---|---|
| Firestore · lecturas (50.000) | 3–4 | ~110–170 | ~600–1.000 |
| KV · *list* (1.000) | 0 | ~6 | ~34 |
| Functions (100.000) | ~8 | ~70–165 | ~2.000 el primer día (carátulas de amigos) |
| KV · lecturas (100.000) | ~8 | ~95–190 | ~2.150 el primer día |

Con una mezcla 70 % ligeros / 25 % medios / 5 % intensos, el orden de los techos es **KV *list* (~300 activos al
día)**, Firestore (~650) y Functions/KV lecturas (~700–750). Las escrituras de Firestore no aprietan.

**De dónde sale cada techo** (lo que hay que mirar primero):

- ***list*:** `useShareViewModel.refresh` llama a `/api/share/mine` al montar `ShareReviewButton`, sin caché, y
  `readShareStatus` (`functions/_lib/quota.ts`) lista el prefijo del usuario en cada llamada.
- **Firestore:** el directorio (50 lecturas) se vuelve a pagar tras **cada** reseña propia, porque
  `ensureProfileByEmail` invalida su copia aunque no escriba el perfil (`firebaseRepository.ts`), y un post lo
  fuerza al momento (`onPublished`). Las amistades cuestan N cada 15 min (60 s en solicitudes), y el saneado semanal
  las invalida aunque no escriba. `publicConfig` se lee dos veces al arrancar y `privateConfig`/consentimiento en
  cada montaje del social, sin caché. Publicar hace 4 escrituras incondicionales (`userMap`, `privateConfig` ×2 y
  el `deleteField` del token legacy).
- **Functions:** cada carátula de un amigo es una invocación la primera vez, cada tamaño es una URL distinta, y
  el 404 de «no tiene carátula» sale con `no-store` y nadie lo recuerda para juegos ajenos.

**Cifras de este documento que no cuadraban:** el visitante anónimo son 4 lecturas de KV, no 3; el dispositivo
nuevo, ~2–3 invocaciones; y las escrituras de KV que deja `COVER_DAILY_BUDGET` son menos de lo que dice su
comentario en `functions/_lib/keys.ts`, que olvida el contador por IP (~70/día) y las claves JWKS (~28/día):
quedan ~38 publicaciones al día, no ~57.

**Por comprobar:** `useSocialDirectory` lee los gists de los amigos con `getSocialSyncConfig()?.token` sin esperar
a `ensureSyncConfigLoaded`; si el descifrado llegara tarde, esas lecturas irían sin token (60/h por IP). En la
práctica las lecturas de Firestore que preceden al disparo dan tiempo de sobra, pero no está garantizado.

**Tras `docs/plan-directorio-amigos.md` (04-10-2026, mismo método).** El feed lee por uid a los amigos y a uno
mismo (ya no los 50 más recientes), «Perfiles» pide 34 recientes solo al abrirla, y la caché de «mis enlaces» quita
el techo de KV *list*. Por usuario y día: medio ~60–100 lecturas de Firestore, intenso ~600–750 (dominado ahora por
releer las amistades, N cada 15 min y cada 60 s en solicitudes). Con la mezcla 70/25/5, Firestore da para
**~800–1.000 activos al día** y Cloudflare (carátulas de amigos, cuenta pesimista) para ~700–750: los dos techos
quedan casi a la par. Siguiente palanca: amistades incrementales (ver ese plan); y antes de nada, la Fase 0.

