# Plan: capacidad sin salir del plan gratuito

> Objetivo: subir el techo de usuarios **sin pagar** (Cloudflare Free + Firebase Spark) quitando los consumos
> que no aportan nada y, sobre todo, los que puede disparar **gente de fuera** de la app.

> ⚠️ **Documento vivo.** Salió del análisis de capacidad del 30-09-2026. Los recuentos de ficheros están medidos
> sobre el `dist` de ese día; el consumo por usuario es una **estimación leyendo el código**, no una medición en
> producción (ver Fase 0). Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## TL;DR

| Fase | Qué | Esfuerzo | Qué gana |
|---|---|---|---|
| 0 | Línea base de consumo real | S | Saber de qué número partimos y comprobar cada fase |
| 1 | Frenar la reconsulta de `/api/premios` | S | Deja de gastar 1 invocación + 1 lectura de KV **cada vez que se vuelve a la pestaña** |
| 2 | Enlaces relacionados sin `list()` | M | Una visita anónima pasa de 1 *list* + ~51 lecturas a **3 lecturas**; se cierra la puerta por la que un enlace viral tumba los enlaces de todos |
| 3 | Sacar `/assets/*` y `/fonts/*` de las Functions *(requiere decisión)* | M | Un dispositivo nuevo pasa de ~36 invocaciones a **0** por arrancar, y un despliegue deja de costar ~18 por dispositivo |
| 4 | Amistades en caché persistente | M | Deja de leer N documentos de `friendships` en cada recarga del social |
| 5 | Umbrales de vigilancia | S | Avisar antes de que un cupo corte, no después |

Orden recomendado: 0 → 1 → 2 → 3 (con su prueba previa) → 4. Cada fase es un commit independiente y reversible.

---

## Por qué estas y no otras: los cupos que cortan

Todo se reinicia cada día (KV y Workers a las 00:00 UTC; Firestore a medianoche del Pacífico).

| Cupo gratuito | Techo | Quién lo gasta hoy |
|---|---|---|
| KV · *list* | **1.000/día** | `/api/share/related` (anónimo, por visita), `/api/share/mine`, publicar |
| KV · escrituras | **1.000/día** | Carátulas (tope propio de 700, `COVER_DAILY_BUDGET`) + publicar (4 por enlace) |
| Workers (Functions) | **100.000/día** | **Cada** `/assets/*` y `/fonts/*` (pasan por `brotliAsset`/`staleAsset`), `/cover`, `/api/*`, `/r/*` |
| KV · lecturas | 100.000/día | `/cover` sin caché, avisos, premios, enlaces |
| Firestore · lecturas | **50.000/día** | 5–15 por apertura; el social, 60–150 por usuario y día |
| IGDB | 4 pet./s globales | Llenado inicial de carátulas (falla blando: 503 y reintento) |
| reCAPTCHA (App Check) | 10.000/mes | ~1 por hora de sesión con cuenta (falla abierto; ver Fase 5) |

Medido sobre el `dist` del 30-09-2026: el arranque pide **17 ficheros de `/assets` + 1 fuente**, y el service
worker vuelve a pedir esos **18** con `cache: 'reload'` al instalarse. Como las dos rutas son Functions, un
dispositivo nuevo gasta ~36 invocaciones solo en arrancar, más las pantallas perezosas.

---

## Fase 0 — Línea base · S

Antes de tocar nada, apuntar **una semana** de consumo real para poder comparar:

- Cloudflare → Workers & Pages → `mygamelist` → *Metrics*: peticiones de Functions al día y su reparto por ruta.
- Cloudflare → KV → `mygamelist-shares` y `mygamelist-covers` → *Metrics*: lecturas, escrituras y *list* al día.
- Firebase → Firestore → *Uso*: lecturas y escrituras al día.
- Panel de admin: contador diario de carátulas (`/api/cover-stats`).

Apuntar los números al pie de este documento (sección «Mediciones»).

---

## Fase 1 — Frenar la reconsulta de premios · S

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

## Fase 2 — Enlaces relacionados sin `list()` · M

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
- `related` pasa a leer **ancla + dueño + índice**: 3 lecturas, 0 *list*, 0 lecturas de artículos. Filtra los
  caducados por `expiresAt`. **Sin índice → lista vacía** (el pie no se pinta); nunca vuelve a listar.
- **Migración única** con un script en `scripts/` (vía `wrangler kv`) que construya `relidx:` para los autores que
  ya tienen enlaces vivos. Cuesta una escritura por autor; se lanza en el despliegue.

**Coste asumido.** Publicar pasa de 4 a 5 escrituras de KV: con el reparto de `COVER_DAILY_BUDGET` quedan ~57
publicaciones diarias en vez de ~71, muy por encima del uso real. Actualizar la cuenta en el comentario de
`COVER_DAILY_BUDGET` (`functions/_lib/keys.ts`) y en `docs/plan-compartir-resenas.md`.

**Privacidad.** El índice solo guarda lo que `related` ya enseña (adelanto de 160, nota, fecha, géneros); el uid
va en la clave, igual que en `owner:{token}`, y nunca en la respuesta.

**Verificación.** Tests de la función: publicar/retirar/vetar dejan el índice igual a lo que devuelve el listado;
`related` no llama a `list` (espía sobre el KV falso); índice ausente → `items: []`; caducados fuera.

---

## Fase 3 — `/assets/*` y `/fonts/*` como estáticos · M · *requiere decisión*

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

**Qué se gana / qué se pierde.** Un dispositivo nuevo: ~36 invocaciones → 0 por arrancar. Un despliegue: ~18 por
dispositivo activo → 0. Un visitante de un enlace compartido: ~40 → 3 (`/r`, artículo, relacionados). A cambio,
**+26 kB en la primera carga** (las siguientes salen del service worker).

**Si se descarta esta fase (3-bis).** Precachear los ficheros con hash **sin** `cache: 'reload'` y dejarlo solo
para el shell (`/`, `/manifest.json`). El hash garantiza el contenido, y `isShellFallback` sigue descartando un
HTML colado. El despliegue baja de ~18 invocaciones por dispositivo a casi 0; el arranque en frío sigue en ~36.

---

## Fase 4 — Amistades en caché persistente · M

**Problema.** `getMyFriendships` solo guarda 60 s **en memoria** (`MY_FRIENDSHIPS_CACHE_TTL_MS`): cada recarga
de la página con el social abierto lee N documentos de `friendships`, uno por amigo. El directorio ya vive en
IndexedDB 30 min; las amistades no.

**Cambio.** Guardar la vista en IndexedDB con TTL corto (**propuesta: 5 min**) junto al resto de cachés de
`indexedDbRepository`. Se sigue invalidando en `sendFriendRequest`, `acceptFriendRequest` y `deleteFriendship`
(`invalidateMyFriendshipsCache`, que tendrá que borrar también la copia persistente) y se salta con el refresco
manual (`forceRefresh`).

**Decisión pendiente.** El TTL: con 5 min, una petición recibida puede tardar hasta 5 min en aparecer en la
bandeja si no se refresca a mano.

**Verificación.** Recargar dos veces seguidas el hub → la segunda no consulta `friendships`; aceptar una petición
→ la lista se actualiza al momento.

---

## Fase 5 — Umbrales de vigilancia · S

No es código: son los números a los que hay que mirar, apuntados en la checklist de despliegue del README.

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
| Dispositivo nuevo, sin carátulas | ~45–50 | ~5 |
| Usuario habitual, día normal | ~10–30 | ~5 |
| Usuario habitual, día de despliegue | +25–35 | +0–2 |
| Visitante anónimo de un enlace | ~40 invocaciones + 1 *list* + ~51 lecturas de KV | 3 invocaciones + 3–4 lecturas |

Con eso, Workers deja de ser el primer techo para el uso normal: pasa a serlo **Firestore** (~5.000 activos al
día con uso ligero, menos cuanto más social) y, para usuarios nuevos, **las carátulas**.

## Checklist

- [ ] Fase 0: una semana de números apuntada abajo.
- [ ] Fase 1: test del freno en verde; en producción, las invocaciones de `/api/premios` caen.
- [ ] Fase 2: `related` sin `list`; migración de `relidx:` lanzada; comentarios de cupo actualizados.
- [ ] Fase 3: prueba previa en `wrangler pages dev` y vista previa **antes** del cambio; test de pares de rutas.
- [ ] Fase 4: TTL decidido; recarga del hub sin consulta a `friendships`.
- [ ] Suite completa (`npm test`, `npm run test:rules`, `npm run test:e2e` sobre un `dist` recién construido) y
      checklist de despliegue del README en cada fase.

## Mediciones

*(Rellenar en la Fase 0 y tras cada fase.)*
