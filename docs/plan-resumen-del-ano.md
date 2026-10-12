# Plan: resumen del año — calendario nuevo y compartirlo en fin de año

> Objetivo: que el resumen del año en curso se pueda ver desde el **15 de julio** hasta el 14 de julio siguiente, y
> que en la **temporada de fin de año (15 de diciembre – 15 de enero)** se pueda compartir: con un **enlace público
> `/r/`** y con la **tarjeta del feed** a las amistades. Todo sin pasarse de los bordes que ya están medidos
> (arranque 190 kB, cupos gratuitos de Cloudflare y Firebase).

> ⚠️ **Documento vivo.** Guía de diseño, no contrato. Al abordar cada fase, verifica el estado real del código y
> actualiza este `.md`. Escrito el 12-10-2026 sobre `da15bfc7` (release 1.6.10).

## Decisiones tomadas (usuario, 12-10-2026)

| Decisión | Valor |
|---|---|
| Qué resumen se ve | El del año Y **del 15 de julio de Y al 14 de julio de Y+1**. Del 15 de julio al 31 de diciembre es el año en curso (se va completando); del 1 de enero al 14 de julio, el año recién cerrado |
| Cuándo se puede compartir | **Del 15 de diciembre al 15 de enero** (ambos incluidos). Fuera de esa ventana se ve, pero no se comparte |
| Cómo se comparte | **Enlace público en `/r/`** (como las reseñas) **y la tarjeta del feed** a las amistades |
| Cuándo sale la tarjeta del feed | **Al compartir**, no al abrir el resumen (hoy se publica sola al abrirlo del 15 al 31 de diciembre) |
| Caducidad del enlace | **Al cerrar la ventana**: 16 de enero, 12:00 UTC, sea cual sea el rango |
| Cita de la mejor reseña | **Fuera.** El enlace no lleva `best.quote` (la propuesta de incluirla no se aceptó) |
| Carátulas en la página pública | **Solo para quien tenga el feed social activado y las carátulas encendidas** en ese navegador. Sin cuenta (modo artículo) o con las carátulas apagadas, no sale ninguna imagen |

La ventana de compartir empieza el 15 de **diciembre** (confirmado: en la primera respuesta se coló un
«septiembre»).

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
| Arranque | Solo cambia `summaryYear.ts` (unas líneas: dos comparaciones de fecha y `isShareSeason`) | Todo lo demás —botón, hoja de compartir, esquema, página pública— va en chunks perezosos que ya existen (`YearSummary`, `PublicReviewScreen`, social). **Objetivo: ≤ +0,2 kB**, medido tras la Fase 1 y al final |
| KV · escrituras | **3 por enlace de resumen** (artículo, propietario, índice), frente a 5 de una reseña: sin contador diario (el tope es «uno por año», que ya se sabe con el listado) y sin índice de sugeridos (el resumen no tiene «otras reseñas»). Renovar reescribe las mismas 3 | Con ~200 libres, **~65 enlaces nuevos al día** en el peor caso (carátulas al tope). Si la Fase 0 dice que el pico esperado supera ~40, se aplica el freno de temporada de la Fase 4 |
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

### Fase 1 — Calendario · S

`src/core/stats/summaryYear.ts` (arranque):

- `SUMMARY_SWITCH = { month: 6, day: 15 }` (15 de julio). `summaryYear(now)`: el año en curso desde el 15 de julio,
  el anterior antes.
- `isShareSeason(now)`: 15–31 de diciembre **o** 1–15 de enero. El año que se comparte es `summaryYear(now)` (en
  diciembre, Y; en enero, Y−1), así que no hace falta otra función.
- `isSummarySeason` desaparece como concepto: sus usos pasan a `isShareSeason` (aviso, señal) o a nada (ver).
- Comentarios del fichero, de `yearSummaryFeed.ts`, `useYearSummarySignal`, `useYearSummaryNotice` y
  `SocialProfileDetailScreen` (todos dicen «del 15 al 31»).
- **Etiqueta de provisional** (en `yearSummaryLabels`, perezoso): del 15 de julio al 31 de diciembre, el título lleva
  «en curso», para que un año a medias no se lea como un año flojo.
- **Aviso del 15 de diciembre**: mismo momento, texto nuevo («ya puedes compartir tu resumen de Y»); sale en toda la
  ventana de compartir, no solo hasta el 31. No se añade aviso el 15 de julio (no pedido).
- Tests: `yearSummarySignal.test.ts`, `yearSummary.test.ts` y uno nuevo de fronteras (14/15 de julio, 14/15 de
  diciembre, 15/16 de enero, 31 de diciembre → 1 de enero).
- **Efecto al desplegar hoy (octubre):** el resumen visible pasa de 2025 a **2026 en curso**. Es lo pedido; avisarlo
  en el CHANGELOG.
- **Medir:** `npm run build && npm run validate`. Si el crítico pasa de 188,6 kB, algo perezoso se ha colado.

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
    token. Renovar, como mucho una vez cada 24 h (se mira `createdAt` de la fila: 0 escrituras más).
  - No cuenta para `maxActive` ni para el contador diario de reseñas.
  - Caduca al cerrar la ventana (16 de enero, 12:00 UTC): `expirationTtl` hasta esa fecha, mínimo 60 s.
- `GET /api/share/:token` y `functions/r/[token].ts`: rama por `kind`. Vista previa: «El 2026 de {nick}: 34 juegos
  terminados» / «Su mejor: {juego} ({nota})». `og:image` genérica.
- `/api/share/related` con un token de resumen: `items: []` sin leer nada más.
- Censo del admin (`/api/share/all`, `AdminUserShares`) y «mis enlaces» (`SharedReviewsCard`): pintar la fila de
  resumen (hoy dan por hecho `gameId`/`gameName`). Retirar y vetar funcionan igual (mismas tres claves).
- **Freno de temporada (solo si la Fase 0 lo pide):** bajar `COVER_DAILY_BUDGET` en la ventana (p. ej. 700 → 550:
  +150 escrituras, ~50 enlaces más al día). Las carátulas ya fallan blando y se completan otro día; un enlace que no
  se puede crear es peor. Constante y fechas juntas en `keys.ts`.
- Actualizar el comentario de `COVER_DAILY_BUDGET` (la cuenta de lo que queda para compartir) y
  `plan-capacidad-gratuita.md`.
- Pruebas con `wrangler pages dev` y KV local, como la Fase 2 de capacidad: contar escrituras con un KV espía
  (3 al crear, 3 al renovar, 0 al rechazar fuera de ventana).

### Fase 5 — Cliente · M

- **Botón «Compartir»** en la cabecera del resumen propio, solo con `isShareSeason` y perfil publicado. Abre una hoja
  con la vista previa de lo que se publica (la proyección de la Fase 3 pintada) y dos acciones:
  - «Avisar a mis amistades» → tarjeta del feed (Fase 2). 0 KV.
  - «Crear enlace público» → `POST` + avisar también + copiar / `navigator.share`. Si KV no tiene cupo (503 del
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

### Fase 6 — Textos legales y cierre · S

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
- **Aviso el 15 de julio.** No pedido; el resumen en curso aparece sin anunciarse.

## Checklist

- [ ] Fase 0: línea base de KV y perfiles; decisión sobre el freno.
- [x] Decisiones confirmadas (12-10-2026).
- [ ] Fase 1: calendario; crítico ≤ 188,6 kB.
- [ ] Fase 2: tarjeta al compartir.
- [ ] Fase 3: proyección + esquema + auditoría de privacidad.
- [ ] Fase 4: servidor con 3 escrituras, ventana y renovación; probado con KV espía.
- [ ] Fase 5: botón, hoja, página pública (carátulas solo con social + preferencia; modo artículo sin carátulas ni Firebase); maqueta.
- [ ] Fase 6: legal, CHANGELOG, medición final.
