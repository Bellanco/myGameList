# Plan: resumen del año — calendario nuevo y compartirlo en fin de año

> Objetivo: que el resumen del año se estrene el **15 de diciembre**, como hoy, y que en la **temporada de fin de
> año (15 de diciembre – 15 de enero)** se pueda compartir: con un **enlace público
> `/r/`** y con la **tarjeta del feed** a las amistades. Todo sin pasarse de los bordes que ya están medidos
> (arranque 190 kB, cupos gratuitos de Cloudflare y Firebase).

> ⚠️ **Documento vivo.** Guía de diseño, no contrato. Al abordar cada fase, verifica el estado real del código y
> actualiza este `.md`. Escrito el 12-10-2026 sobre `da15bfc7` (release 1.6.10).

## Decisiones tomadas (usuario, 12-10-2026)

| Decisión | Valor |
|---|---|
| Qué resumen se ve | El del año Y **del 15 de diciembre de Y al 14 de diciembre de Y+1**: se estrena el 15 y se ve todo el año siguiente. Es el calendario de hoy, sin cambios |
| Cuándo se puede compartir | **Del 15 de diciembre al 15 de enero** (ambos incluidos). Fuera de esa ventana se ve, pero no se comparte |
| Cómo se comparte | **Enlace público en `/r/`** (como las reseñas) **y la tarjeta del feed** a las amistades |
| Cuándo sale la tarjeta del feed | **Al compartir**, no al abrir el resumen (hoy se publica sola al abrirlo del 15 al 31 de diciembre) |
| Caducidad del enlace | **Al cerrar la ventana**: 16 de enero, 12:00 UTC, sea cual sea el rango |
| Cita de la mejor reseña | **Fuera.** El enlace no lleva `best.quote` (la propuesta de incluirla no se aceptó) |
| Actualizar el enlace | **Manual**: botón «Actualizar enlace» cuando tu resumen ha cambiado desde que lo compartiste. Mismo enlace siempre. Espera entre actualizaciones **por rango: mithril 1 día, oro 2, plata 3, bronce 5** |
| Carátulas en la página pública | **Solo para quien tenga el feed social activado y las carátulas encendidas** en ese navegador. Sin cuenta (modo artículo) o con las carátulas apagadas, no sale ninguna imagen |

La ventana de compartir empieza el 15 de **diciembre** (confirmado: en la primera respuesta se coló un
«septiembre»).

**Cambio de calendario (12-10-2026, usuario):** se propuso que el resumen se viera desde el 15 de julio, pero se
descartó: con cinco meses viéndolo a medias, el 15 de diciembre deja de ser un estreno y el aviso pierde fuerza.
El año en curso ya se sigue en Estadísticas (panel del año, `YearPanel`). Estrenarlo y poder compartirlo es el
mismo día.

---

## 1. Cómo está hoy

- **Calendario** (`src/core/stats/summaryYear.ts`, en el **arranque** porque lo consulta `App`): el resumen del año en
  curso «se estrena» el 15 de diciembre; el resto del año se enseña el anterior. `isSummarySeason` = 15–31 de
  diciembre.
- **Aviso** (`useYearSummaryNotice` → `YearSummaryToast`, perezoso): una vez por año y navegador, en temporada, si
  hay perfil social y algo completado ese año.
- **Tarjeta del feed** (`core/social/yearSummaryFeed.ts`): al abrir tu propio resumen en temporada se escribe
  `profiles/{uid}.yearSummary = { year, at }` (`publishYearSummarySeen`, 1 escritura de Firestore). Las amistades la
  leen del directorio que el feed ya trae (0 lecturas extra) y la ven 30 días (`YEAR_SUMMARY_FEED_DAYS`). Reglas:
  `profileYearSummaryIsSane()` en `firestore.rules`.
- **Dónde se ve**: dentro del perfil (`SocialProfileDetailScreen` → `YearSummary`, perezoso). Una amistad lo ve
  calculado en su navegador desde tu gist de listados, con precisión de mes (día solo la administración).
- **Enlaces públicos**: solo reseñas. KV `mygamelist-shares`; `POST /api/share` escribe artículo, propietario,
  índice del usuario, contador diario e índice de sugeridos (**5 escrituras**); `/r/:token` reescribe los `og:*` y la
  SPA pinta `PublicReviewScreen`, sin Firebase (`main.tsx`, `tests/e2e/sharedLink.test.ts`).

## 2. Los bordes, medidos

| Borde | Techo | Estado hoy | Fuente |
|---|---|---|---|
| Arranque crítico (comprimido) | **190 kB** | **188,4 kB → holgura 1,6 kB** | `npm run build && npm run validate` sobre `da15bfc7`, 12-10-2026 |
| Arranque total | 240 kB | 221,6 kB | ídem |
| KV · escrituras | **1.000/día** (cuenta) | Carátulas hasta 700 (`COVER_DAILY_BUDGET`) + contador por IP ~70 + JWKS ~28 → **~200 libres** en el peor día | `plan-capacidad-gratuita.md`, revisión del 04-10 (estimado) |
| KV · *list* | 1.000/día | 1 por publicación; «mis enlaces» con caché | ídem |
| KV · lecturas / Functions | 100.000/día | ~700–750 activos/día de techo (carátulas de amigos) | ídem |
| Firestore · lecturas | 50.000/día | ~800–1.000 activos/día de techo | ídem |
| Firestore · escrituras | 20.000/día | No aprietan | ídem |
| Workers · CPU | 10 ms/petición | — | plan gratuito |

Lo que hay que retener: **el arranque está a 1,6 kB del tope** y **las escrituras de KV son el cupo que se agota
primero** si muchos comparten el mismo día (y el 15 de diciembre lo hará todo el mundo a la vez, porque es cuando
sale el aviso).

## 3. Coste de lo nuevo por borde

| Borde | Coste | Cómo se queda dentro |
|---|---|---|
| Arranque | Solo cambia `summaryYear.ts` (`isShareSeason` sustituye a `isSummarySeason`: una comparación más) | Todo lo demás —botón, hoja de compartir, esquema, página pública— va en chunks perezosos que ya existen (`YearSummary`, `PublicReviewScreen`, social). **Objetivo: ≤ +0,2 kB**, medido tras la Fase 1 y al final |
| KV · escrituras | **3 por enlace de resumen** (artículo, propietario, índice), frente a 5 de una reseña: sin contador diario (el tope es «uno por año», que ya se sabe con el listado) y sin índice de sugeridos (el resumen no tiene «otras reseñas»). **Actualizar cuesta 1**: la caducidad es fija (16 de enero), así que propietario e índice no cambian y solo se reescribe el artículo | Medido en la Fase 0: ~830 libres un día medio (~275 enlaces) y ~185 el peor (~60). Freno de temporada descartado; se vigila |
| KV · *list* | 1 por publicación (el `listActiveShares` de `readShareStatus`, como hoy) | Una vez por persona y año, salvo renovaciones (máx. 1 al día) |
| Visita al enlace | `/r/:token` (1 invocación + 1 lectura) + `/api/share/:token` (1 invocación + 1–2 lecturas) | Una visita sin carátulas = 2 invocaciones y ~3 lecturas; 1.000 visitas en un día = 2 % de Functions. Las visitas anónimas, que son las que pueden ser muchas, nunca piden carátulas |
| Carátulas al visitar | Solo quien tiene el feed social y las carátulas encendidas: hasta 9 `/cover` (`COLLAGE_MAX`), en modo `'solo-cache'` (`c=2`) | Es la regla de lo ajeno del hub: resolver solo mientras el contador del día esté por debajo de `COVER_DAILY_BUDGET_AJENO` (250), **dentro** de los 700 de carátulas, así que no resta escrituras a los enlaces. La URL es la de `medio`, la misma del renglón: lo ya visto sale de la caché del navegador y del service worker |
| Firestore · lecturas | 1 por publicación (`readProfileFacts` lee el perfil para el nick y el rango). La tarjeta sale del directorio ya leído: 0 | Despreciable |
| Firestore · escrituras | 1 por persona y año (`yearSummary` en el perfil). Si se sube `LEGAL_VERSION`, 1 por usuario activo una vez | No aprietan |
| GitHub API | 0: el resumen propio sale de datos locales | — |
| Workers · CPU | Validar un JSON de ~3–4 kB | Nada de generar imágenes `og` dinámicas: con 10 ms de CPU no cabe. `og:image` sigue siendo la genérica |

## 4. Fases

### Fase 0 — Línea base del pico · S · usuario + lectura de paneles

Sin ella, «~65 al día» es una cuenta, no una medida.

- Cloudflare → KV → `mygamelist-shares` y `mygamelist-covers` → *Metrics*: **escrituras al día de los últimos 30
  días, máximo y media**.
- Firebase → Firestore: cuántos perfiles tienen `social.enabled` y cuántos abrieron algo en los últimos 30 días.
  (Lo hace el usuario o se autoriza expresamente; no leer producción en modo auto.)
- Estimación del pico del 15 de diciembre: perfiles sociales activos × fracción que comparte (supuesto prudente:
  50 %) × 3 escrituras. Comparar con `1.000 − (pico de carátulas + ~100)`.
- **Salida:** decidir si hace falta el freno de temporada (Fase 4, punto 6). Anotarlo aquí.

**Medido el 12-10-2026** (panel de Cloudflare, `mygamelist-shares`, del 1 al 12 de octubre):

| Operación | Total (12 días) | Media diaria | Cupo diario |
|---|---|---|---|
| Lecturas | 2.300 | ~190 | 100.000 |
| Escrituras | 159 | **~13** | 1.000 (de la cuenta) |
| *List* | 195 | ~16 | 1.000 |
| Borrados | 1 | — | 1.000 |

19 claves vivas y 30,82 kB: unos pocos enlaces activos (3 claves por enlace, más índices y contadores). En las últimas
24 h el máximo fue de ~0,002 escrituras/s en una hora (~7). Compartir gasta hoy un **1–2 % del cupo de escrituras**.

Y `mygamelist-covers`, mismo periodo:

| Operación | Total (12 días) | Media diaria | Cupo diario |
|---|---|---|---|
| Lecturas | 27.650 | ~2.300 | 100.000 |
| Escrituras | 660 | **~55** | 1.000 (de la cuenta) |
| *List* | 0 | 0 | 1.000 |

2.110 claves y 362,74 kB. Entre los dos espacios, **~68 escrituras al día de media (~7 % del cupo)** y ~2.500 lecturas
(~2,5 %). El panel solo da el total del mes y la curva de 24 h, no el máximo diario: los días con una biblioteca
grande nueva pueden acercarse al tope de 700 de carátulas.

**Decisión: freno de temporada descartado.**

- Día medio: 1.000 − ~55 de carátulas − ~100 fijas − ~13 de reseñas ≈ **830 libres → ~275 enlaces de resumen** en
  un día.
- Peor día (carátulas al tope de 700): ≈ **185 libres → ~60 enlaces**. Para que algo falle tienen que coincidir en el
  mismo día UTC una biblioteca grande nueva y más de 60 personas compartiendo por primera vez; con 19 claves vivas
  en `mygamelist-shares` el uso real está muy lejos.
- Si aun así pasa, falla blando: el enlace responde «inténtalo mañana» (503 del middleware) y la tarjeta del feed,
  que va por Firestore, sale igualmente.
- **Vigilancia** en la temporada: si algún día de la primera semana `mygamelist-covers` + `mygamelist-shares` pasan
  de 600 escrituras (60 %, umbral de la Fase 5 de capacidad), se aplica el freno de la Fase 4 en la release siguiente.

Pendiente, sin bloquear: el número de perfiles sociales activos, para afinar la estimación del pico.

### Fase 1 — Calendario · S

El estreno sigue el 15 de diciembre; lo que cambia es que la **temporada** (aviso y tarjeta del feed) se alarga
hasta el 15 de enero, que será también la ventana de compartir.

1. `src/core/stats/summaryYear.ts` (arranque): `isShareSeason(now)` = 15–31 de diciembre **o** 1–15 de enero.
   `summaryYear` no cambia: en enero sigue dando Y−1, que es justo el año que se comparte. Tests de fronteras
   (14/15 de diciembre, 31 de diciembre → 1 de enero, 15/16 de enero).
2. Usos: `useYearSummaryNotice` y `useYearSummarySignal` pasan a `isShareSeason` y desaparece `isSummarySeason`.
   Comentarios que dicen «del 15 al 31» (`yearSummaryFeed.ts`, `firebaseRepository.ts`, `firestore.rules`, `App.tsx`).
   **Mientras no llegue la Fase 2**, la tarjeta del feed sigue saliendo al abrir el resumen, ahora hasta el 15 de
   enero: la Fase 1 se puede publicar sola.
3. Texto del aviso: quitar «Se actualiza hasta el 31», que en enero sería falso. No habla de compartir hasta que
   exista el botón (Fase 5).
4. Cierre: `npm run build && npm run validate` (el crítico no debe subir de 188,6 kB), suite y CHANGELOG.

**Hecha el 12-10-2026.** Medido con dos worktrees limpios (`d0c17a7f` y `9a55b2c4`, `vite build` + `ci-validate.js`
de cada uno), porque el árbol de trabajo tenía cambios de otra sesión: chunk de entrada +61 B minificados (+14 B
gzip), crítico **188,4 → 188,5/190 kB**. Suite: 335 ficheros, 3.762 tests en verde. `firestore.rules` solo cambia un
comentario: no hace falta desplegar reglas por esta fase.

### Fase 2 — La tarjeta del feed sale al compartir · S

- `useYearSummarySignal` deja de llamarse al pintar el resumen (`onOwnSummaryOpened`) y lo llama la acción de
  compartir (Fase 5). Guardas iguales (perfil publicado, una vez por año, caché local), con `isShareSeason`.
- `YEAR_SUMMARY_FEED_DAYS = 30` se mantiene: lo compartido el 15 de enero se ve hasta mediados de febrero.
- `firestore.rules`: sin cambios obligatorios. Opcional: acotar `yearSummary.year` a `request.time.year()` y el
  anterior, con su test en `firestore.rules.test.ts` y `audit:rules`.
- Quitar `wantsYearSummary`/`openSummaryOnMount` **no**: la tarjeta sigue abriendo el resumen de la amistad.

### Fase 3 — Lo que se publica: proyección y esquema · M

Puro, en `src/core/stats/` (p. ej. `publicYearSummary.ts`), testeado como la proyección social:

- **Entra:** `year`, `count`, `avgGrade`, `withReview`, `platforms`, `best` (nombre, nota, género y plataforma;
  **sin `quote`**), `podium`, `genres`, `when` **con precisión de mes** (sin `days` ni `day`),
  `strengths`, `weaknesses`, `previous` (cifras agregadas del año anterior), `palmares`.
- **No entra:** `common` (es la comparación con quien mira), `best.quote`, horas, fechas al día, nada de `SOCIAL_PRIVATE_FIELDS`.
- Topes en el esquema del **enlace** (no en el del gist): número de géneros, plataformas, podio y meses, largo de
  nombres. Un resumen cabe holgado en ~4 kB.
- `src/model/schemas/shareSchema.ts`: unión discriminada `kind: 'review' | 'year'` (los artículos v1 sin `kind`
  son reseñas). El servidor pone `authorNick`, `createdAt`, `expiresAt`, como en las reseñas.
- `scripts/audit-privacy.js`: añadir el artículo de resumen a lo que vigila.

### Fase 4 — Servidor · M

- `functions/_lib/shares.ts`: `publishYearShare` con **3 escrituras** (artículo, propietario, índice con metadata
  `{ kind: 'year', year, createdAt, expiresAt }`) y la misma validación doble del esquema.
- `POST /api/share` con `kind: 'year'` (o `functions/api/share/year.ts`; preferible endpoint propio para no tocar
  el camino de las reseñas). Orden: sesión → veto → perfil (nick) → **ventana** → existente.
  - **Ventana en el servidor**, con holgura de husos: del 14-12 12:00 UTC al 16-01 12:00 UTC, y `year` debe ser el
    de esa temporada. Fuera, 409 con mensaje claro.
  - **Uno por persona y año**: si en el listado ya hay una fila `kind: 'year'` de ese año, se renueva sobre el mismo
    token: **el enlace no cambia nunca** y solo se reescribe el artículo (1 escritura). Espera mínima entre
    actualizaciones **por rango**, `PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS` en `src/core/constants/tiers.ts`
    (mithril 1, oro 2, plata 3, bronce 5 días), mirando el `updatedAt` del propio artículo (1 lectura). Si aún no
    toca, 429 con `nextUpdateAt` para que el cliente diga «podrás actualizarlo el día X».
  - El enlace es una **foto** del momento en que se comparte: lo que completes después no entra hasta que lo
    actualices. Dentro de la app, las amistades ven siempre el resumen vivo (sale de tu gist).
  - No cuenta para `maxActive` ni para el contador diario de reseñas.
  - Caduca al cerrar la ventana (16 de enero, 12:00 UTC): `expirationTtl` hasta esa fecha, mínimo 60 s.
- `GET /api/share/:token` y `functions/r/[token].ts`: rama por `kind`. Vista previa: «El 2026 de {nick}: 34 juegos
  terminados» / «Su mejor: {juego} ({nota})». `og:image` genérica.
- `/api/share/related` con un token de resumen: `items: []` sin leer nada más.
- Censo del admin (`/api/share/all`, `AdminUserShares`) y «mis enlaces» (`SharedReviewsCard`): pintar la fila de
  resumen (hoy dan por hecho `gameId`/`gameName`). Retirar y vetar funcionan igual (mismas tres claves).
- **Freno de temporada (descartado en la Fase 0; solo si la vigilancia lo pide):** bajar `COVER_DAILY_BUDGET` en la ventana (p. ej. 700 → 550:
  +150 escrituras, ~50 enlaces más al día). Las carátulas ya fallan blando y se completan otro día; un enlace que no
  se puede crear es peor. Constante y fechas juntas en `keys.ts`.
- Actualizar el comentario de `COVER_DAILY_BUDGET` (la cuenta de lo que queda para compartir) y
  `plan-capacidad-gratuita.md`.
- Pruebas con `wrangler pages dev` y KV local, como la Fase 2 de capacidad: contar escrituras con un KV espía
  (3 al crear, 1 al actualizar, 0 al rechazar fuera de ventana o antes de la espera del rango).

### Fase 5 — Cliente · M

- **Botón «Compartir»** en la cabecera del resumen propio, solo con `isShareSeason` y perfil publicado. Abre una hoja
  con la vista previa de lo que se publica (la proyección de la Fase 3 pintada) y dos acciones:
  - «Avisar a mis amistades» → tarjeta del feed (Fase 2). 0 KV.
  - «Crear enlace público» → `POST` + avisar también + copiar / `navigator.share`.
  - **«Actualizar enlace»**, manual: sale solo si el resumen ha cambiado desde que se compartió (el cliente guarda
    una huella de la proyección publicada y la compara; 0 peticiones) y deshabilitado con la fecha mientras no toque
    por rango. **Sin nombrar el rango** (ver «rangos ocultos al usuario»): «podrás actualizarlo el 3 de enero». Si KV no tiene cupo (503 del
    middleware), se dice «inténtalo mañana» **y la tarjeta del feed sale igualmente**.
- **Página pública**: `PublicReviewScreen` mira `kind` y, para `year`, monta `YearSummary` (ya perezoso) con voz en
  tercera persona con el nick y una prop de acceso a carátulas (`CoverAccess`):
  - **Modo artículo** (`standalone`, sin la app en el navegador, `main.tsx`): `false`. Ni una llamada a `/cover`;
    la portada sale tipográfica (nombres en vez de mosaico).
  - **Con la app** (`SharedReviewRoute` en `App.tsx`): `'solo-cache'` si hay perfil social activado; si no, `false`.
    La preferencia de carátulas del visitante (`useCovers`, apagada de fábrica) la sigue aplicando
    `useReviewCover`, así que con ellas apagadas tampoco sale nada.
  - Tema por defecto, como las reseñas. Sin Firebase en modo artículo: ampliar `tests/e2e/sharedLink.test.ts` con un
    artículo de resumen y comprobar que no se pide `/cover`.
- **Maqueta**: el botón y la hoja en `docs/maquetas/social.html` (pantalla del perfil con resumen), y capturas con
  `node scripts/capturar-maqueta-social.mjs`. La página pública, en local con datos sembrados.
- Revisar en los temas con skin de paleta y en claro/oscuro (la hoja es nueva: sin piezas de noche en claro).

### Fases 2 a 5 — hechas el 12-10-2026

Commits en `develop` (sin push): `23fb4fa6` (tarjeta al compartir), `8276316b` y `26287f29` (proyección y
esquema), `f73bbf2f`, `3d03e9e0`, `aa2b5dda` y `562a0761` (servidor), `231542eb`, `9fcf469e`, `e514f1e9`,
`4b8cca67`, `85be8da8`, `09d7d3bf` y `9b98d353` (cliente, e2e, maqueta y peso).

**Lo que cambió respecto al plan, y por qué:**

- **Índice compartido con las reseñas.** La fila del enlace de resumen vive en `user:{uid}:{token}` como las de
  reseñas, marcada con `kind: 'year'` (`gameId: 0`, `gameName: «Resumen de 2026»`). Así el censo del admin, el veto
  con purga, el borrado de cuenta y `DELETE /api/share/:token` lo alcanzan sin código aparte. `readShareStatus` lo
  separa (`active` = reseñas, `yearShares` = resúmenes): no cuenta para la cuota, no entra en el índice de
  sugeridos, y `GET /api/share/mine` lo devuelve en `yearShares`.
- **Endpoint propio**, `POST /api/share/year`. Crear: 3 escrituras; actualizar: 1 (más 1 lectura del artículo para
  la espera); fuera de ventana o antes de la espera: 0, y fuera de ventana ni una lectura (probado con KV espía en
  `tests/unit/shareYearFunction.test.ts`).
- **Ventana del servidor de 10:00 UTC del 14-12 a 12:00 UTC del 16-01**, no de 12:00: a mediodía se quedaban fuera
  las dos primeras horas del día 15 en UTC+13 y UTC+14.
- **Panel en línea, no hoja.** «Compartir mi resumen» encima del resumen, plegado: abrir tu resumen no cuesta ni una
  petición; desplegarlo pide «mis enlaces» (caché de 5 min) y, si ya hay enlace, su artículo para saber si ha
  cambiado. Lleva además **«Retirar enlace»** (el enlace es revocable como el de una reseña).
- **La página pública no pide sugerencias** para un resumen: se piden cuando ya se sabe que el artículo es una
  reseña. Ahorra 1 invocación y 2 lecturas de KV por visita.
- **Carátulas**: `coverAccess` en `PublicReviewScreen` → `'solo-cache'` si quien abre tiene perfil social en ese
  navegador (`App.tsx`), y siempre `false` en modo artículo. La preferencia de carátulas la sigue aplicando
  `useReviewCover`. El e2e comprueba que en modo artículo no sale ni una petición a `/cover`.
- **La espera por rango no vive en `constants/tiers.ts`** sino en `core/social/yearShareWindow.ts`: `tiers.ts` va
  en el arranque.
- **No se tocaron** `firestore.rules` (la acotación del año era opcional) ni `scripts/audit-privacy.js`: esa
  auditoría no cubre lo que se publica en KV (tampoco las reseñas). Lo que protege el artículo es el esquema
  estricto con denylist (`assertValidSharedYearSummary`) y sus pruebas.

**Medido** (worktrees limpios, `vite build` + `ci-validate.js`): crítico 188,5 → 188,8/190 kB entre `8d652e3e` y
`9b98d353`. Atribución por sourcemap del chunk de entrada: de +768 B minificados, ~480 B son de
`core/utils/reviewPath.ts` y `main.tsx` (trabajo de otra sesión en esas fechas); lo de este plan son ~170 B
(`App.tsx`, `publicShareRepository.ts`). Holgura que queda: **1,2 kB**. Suite: 342 ficheros, 3.810 tests en verde;
e2e de `sharedLink` en verde (5).

### Revisión del panel (12-10-2026, usuario)

Un solo botón **al final del resumen**, sin panel ni opciones sueltas (`b9e0499f`): «Crear enlace» si no lo hay (avisa
también a tus amistades), «Actualizar enlace» si el resumen cambió y ya toca, y «Compartir» en cualquier otro caso
(menú de compartir del sistema o, sin él, copiar). Si cambió pero aún no toca, «Compartir» y debajo la fecha. Fuera
«Avisar a mis amistades», copiar aparte y «Retirar enlace»: el enlace caduca solo el 16 de enero. La retirada sigue
existiendo para la administración (censo) y en el borrado de cuenta. Como el botón ya no está plegado, abrir tu
resumen en temporada pide «mis enlaces» (caché de 5 min) y, si hay enlace, su artículo.

### Fase 6 — Textos legales y cierre · S · ✅ hecha el 12-10-2026

`LEGAL_VERSION` sube a `2026-10-12` (mismo criterio que con los enlaces de reseñas: lo que veían tus amistades lo
puede leer cualquiera con el enlace). Condiciones: un párrafo nuevo con lo que se publica, la actualización y la
caducidad. Privacidad: la copia en Cloudflare, el destinatario «cualquier persona», el aviso a tus amistades al
compartir (no al consultar) y el borrado de cuenta. Fechas de los dos documentos al 12-10-2026.


- `legalContent.ts`: el resumen del año como contenido que se puede publicar por enlace (qué datos, caducidad,
  retirada). Decidir con el usuario si sube `LEGAL_VERSION` (como al estrenar los enlaces de reseñas).
- `CHANGELOG.md` → `[Unreleased]`. Sin subir versión ni tocar `master` (release del usuario).
- Medición final: `npm run build && npm run validate` (crítico y total), suite entera, `audit:rules` si se tocaron
  reglas, `audit:privacy`.

## Lo que NO se hace

- **Imagen `og` dinámica** del resumen (tarjeta con cifras): 10 ms de CPU en Workers gratis y sin caché de borde en
  `*.pages.dev`. Se queda la genérica.
- **Enlace autocontenido** (el resumen comprimido en la URL, 0 KV): no se puede retirar ni vetar y rompe el censo
  del admin. Queda como salida si las escrituras de KV no dieran ni con el freno.
- **Leer el gist desde el servidor** para comprobar el resumen: los Functions no leen gists (decisión del plan de
  reseñas). El contenido lo afirma el cliente y lo acota el esquema, como el texto de una reseña.
- **Carátulas para visitantes sin cuenta social.** Ni por política (nada de arte de terceros a quien no tiene la app)
  ni por cupo (son las visitas que pueden ser miles).
- **Ver el resumen del año en curso desde julio.** Descartado: el estreno del 15 de diciembre pierde fuerza (ver
  «Cambio de calendario»).

## Checklist

- [x] Fase 0: línea base de KV (12-10-2026); freno descartado, vigilancia al 60 %. Falta el número de perfiles.
- [x] Decisiones confirmadas (12-10-2026).
- [x] Fase 1: temporada hasta el 15 de enero (`0780111d`, `fca12888`, `9a55b2c4`); crítico 188,4 → 188,5 kB.
- [x] Fase 2: tarjeta al compartir.
- [x] Fase 3: proyección + esquema (la auditoría estática no cubre KV: ver «Fases 2 a 5»).
- [x] Fase 4: servidor con 3 escrituras, ventana y renovación; probado con KV espía.
- [x] Fase 5: panel, página pública (carátulas solo con social + preferencia; modo artículo sin carátulas ni Firebase); maqueta.
- [x] Probar el servidor con `wrangler pages dev` y KV local (12-10-2026), con un artículo sembrado: `GET
  /api/share/:token`, vista previa de `/r/:token`, `related` vacío, enlace inexistente y 401 sin sesión; la página
  pública en Chromium, sin `/cover` ni terceros. Crear y actualizar con sesión real quedan para la ventana (abre el
  14-12); hasta entonces las cubre el KV espía de `shareYearFunction.test.ts`.
- [x] Fase 6: legal (`LEGAL_VERSION` 2026-10-12), CHANGELOG.
