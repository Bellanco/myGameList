# PROPUESTAS DE FUNCIONALIDAD — futuras (producto)

> Funcionalidades **nuevas de producto** evaluadas para viabilidad sobre la base actual (2026-06-25).
> Distinta de `CODE-REVIEW-IMPROVEMENTS.md` (deuda de calidad/seguridad) y de `INTEGRATIONS.md` (fuentes de datos/libs).
> Cada propuesta lleva veredicto, encaje con el código actual (ficheros), esfuerzo, riesgo y decisiones abiertas.
> NADA de esto está implementado todavía. Marcar `[x]` al implementar.

## RESUMEN

| # | Funcionalidad | Viable | Esfuerzo | Riesgo | ¿Backend? |
|---|---|---|---|---|---|
| F1 | Tema claro/oscuro | ✅ | ~4-5 d | Bajo | No |
| F2 | Puntuación 0-100 ↔ estrellas | ✅ (con matiz) | A: ~2 d / B: ~4-5 d | Medio (sync) | No |
| F3 | Feed social: texto libre + hipervínculos | ✅ (con seguridad) | ~3-5 d | Medio (XSS) | No |
| F4 | "Empezó/completó un juego" como entrada en el feed | ✅ | ~2 d | Bajo-medio | No |
| F5 | "Me gusta" a una reseña | ✅ (con matiz arquitectónico) | ~2-3 d | Medio | No (vía gist) |

**Orden sugerido:** F1 (independiente, sin riesgo) → F2-A (presentación) → F3 → F4 (feed de actividad) → F5 (like).
F2-B y F5 conviene abordarlos **después del cutover v4** (`ENABLE_GAMES_WRAPPER_WRITE`, hoy `false`).
**F3 NO depende del cutover v4** (gist social = canal distinto): se eligió Opción B (`posts` en `social.json`), compatible
con clientes viejos en lectura; usable ya. Ver "PLAN F3" para el detalle de compatibilidad.

> 🎯 **Próximo a implementar (2026-06-25): F1 y luego F3.** Planes detallados de ambos al final del documento
> (sección "PLANES DETALLADOS"), verificados contra el código real (CSP, esquema del gist social, etc.).

---

## F1 — Tema claro/oscuro  ✅ ALTA viabilidad

**Estado base:** ~80% de los colores ya son variables CSS en `:root` (`src/styles/_base.scss`). Hoy forzado a oscuro
(`html { color-scheme: dark }`, `_base.scss:24`). No hay `prefers-color-scheme` ni toggle.

**Plan:**
- [ ] Definir paleta clara como `:root[data-theme="light"]` en `_base.scss`.
- [ ] Extraer los ~47 colores hardcodeados restantes a variables (sobre todo `_table.scss` —estrellas/chips/badges—
      y `_forms-and-buttons.scss` —estados de botón—; ~94 `rgba()` inline a revisar).
- [ ] Toggle en `src/view/components/SettingsHub.tsx` (claro / oscuro / automático).
- [ ] Estado + escritura de `data-theme` en `<html>` desde `App.tsx` (ya existe el patrón `document.body.classList.toggle`).
- [ ] Persistir preferencia en localStorage (patrón de `localRepository.ts`, clave nueva p.ej. `mis-listas-theme`).
- [ ] Inicializar el tema en `src/main.tsx` ANTES del primer render (evitar flash de tema).
- [ ] Actualizar `<meta name="theme-color">` dinámicamente (hoy hardcodeado `#1a1e24` en `index.html` y `manifest.json`).

**Riesgo:** bajo. No toca datos ni sync. Único trabajo real: diseñar la paleta clara respetando la marca (azul Steam)
y extraer los colores sueltos. **Candidata ideal para empezar.**

---

## F2 — Puntuación 0-100 ↔ estrellas  ✅ viable (dos caminos)

**Estado base:** `score?: number` 0-5 (`src/model/types/game.ts:12`), Zod `z.number().min(0).max(5)`
(`src/model/schemas/socialGistSchema.ts:14`), clamp a [0,5] en `localRepository.ts:63`. Render de estrellas en
`core/utils/renderStars.ts`, `StarRating.tsx`, `StarPicker.tsx`; filtro en `Toolbar.tsx` y `useGameListViewModel.ts`.
Mapeo pedido: 20=★, 60=★★★, 100=★★★★★  →  `numérico = estrellas×20`, `estrellas = ceil(numérico/20)`.

### Opción A — solo presentación (recomendada para empezar, ~2 d, riesgo bajo)
- Mantener `score` 0-5 como fuente de verdad. Añadir preferencia de usuario `scoreMode: 'star' | 'numeric'` (local, como F1).
- En modo numérico, mostrar `score×20`. No cambia modelo de datos ni sincronización.
- **Limitación:** solo múltiplos de 20 (no permite poner un 73).
- [ ] `scoreMode` en preferencias locales + toggle en `SettingsHub.tsx`.
- [ ] Render condicional en `StarRating.tsx` (`{score*20}/100` vs estrellas) y en `StarPicker.tsx`.
- [ ] Opciones de filtro del `Toolbar.tsx` etiquetadas según modo.

### Opción B — 0-100 real (granular, ~4-5 d, riesgo medio)
- Input fino 0-100. Campo NUEVO (no sobrescribir `score`).
- [ ] Utilidad `src/core/utils/scoreConversion.ts` (`starToNumeric`/`numericToStar`, definir round vs ceil).
- [ ] Ampliar Zod (`scoreModeSchema` opcional; rango 0-100 en campo nuevo).
- [ ] `ScorePicker` que conmuta entre estrellas y numérico.
- [ ] Filtro/orden en `useGameListViewModel.ts:315` convirtiendo según modo.
- [ ] Migración + bump `LOCAL_SCHEMA_VERSION` (asignar modo por defecto a juegos existentes).
- [ ] Decisión proyección social (`socialProjection.ts`): exponer modo o normalizar a una escala.
- ⚠️ **NO sobrescribir `score` 0-5 con 0-100**: los clientes en versión antigua lo recortan a 5 → corrupción.
- ⚠️ **Esperar al cutover v4** antes de tocar el esquema de puntuación (hoy `ENABLE_GAMES_WRAPPER_WRITE=false`).

---

## F3 — Feed social: texto libre + hipervínculos  ✅ viable (la clave es seguridad)

**Estado base:** feed ya operativo (`src/view/components/socialhub/SocialFeedScreen.tsx`, vm `useSocialViewModel.ts`),
datos en gist **público** `myGameList.social.json` (`src/model/types/social.ts`), tipos `review`/`recommendation`.

**Plan:** array `posts` dentro de `social.json` (Opción B, elegida 2026-06-25). Plan detallado al final del documento
(sección "PLAN F3"). Resumen:
- [ ] Compat (Fase 0): `normalizeSocialGistData` preserva `posts`; schema `posts` opcional. La lectura vieja lo ignora.
- [ ] Modelo/escritura: `SocialPostEntry` + `posts` en `SocialGistData`; `upsertPost`/`publishPost`.
- [ ] Render en `SocialFeedScreen.tsx` y `SocialDetailScreen.tsx`.

**Seguridad (CRÍTICO):** hoy NO hay DOMPurify; `core/security/sanitize.ts` solo recorta longitud.
- [ ] NO renderizar HTML. React escapa texto plano; el riesgo está al "linkificar".
- [ ] Validar URLs: solo `http(s):`, `rel="noopener noreferrer"`, longitud máx.
- [ ] Plantearse DOMPurify solo si se permite formato; el CSP fuerte del proyecto ayuda.

**Compatibilidad con código antiguo (NO depende del v4):** el gist social es otro canal. La lectura ya es tolerante →
clientes viejos ignoran `posts` sin romperse. Riesgo residual: un dispositivo viejo que reescriba su `social.json`
dropea sus posts (recuperable). Mitigación: actualizar el build en todos los dispositivos.

**Privacidad:** el gist es público → un post es visible para todo el directorio. Dejarlo claro en la UI.

---

## F4 — "Empezó / completó un juego" como ENTRADA EN EL FEED (estilo Steam)  ✅

> **Decisión del usuario (2026-06-25): NO es una notificación push.** La idea es que el evento aparezca como una
> entrada más en el feed social (igual que F3), no un aviso emergente con la app cerrada. Esto elimina la necesidad
> de backend/FCM y baja mucho el coste y el riesgo.

El estado del juego es la PESTAÑA (`c` completado, `e` en curso, `v` abandonado, `p` próximo) — `game.ts:1-2,31-38`.
Cambio de estado en `saveDraft()`/`migrateGame()` (`useGameListViewModel.ts:385-465`); botones en `GameTable.tsx:310-326`.

**Plan (~2 d) — reutiliza la infraestructura existente:**
- [ ] Emitir entradas `game_started` / `game_completed` al cambiar de pestaña (hook en `saveDraft`).
- [ ] Extender `socialPublishRepository.ts` (hoy solo publica `review`) con los nuevos tipos de actividad.
- [ ] Render en `SocialFeedScreen.tsx` / `SocialDetailScreen.tsx` como tipo nuevo (icono trofeo/play, sin rating).
- [ ] Opt-out en visibilidad (ya existen `hiddenTabs`/`hideGameTime` en el perfil) → no publicar si la pestaña está oculta.
- Patrón observador reutilizable ya presente: `syncMachineRepository.ts:33-47` (`subscribeSyncState`).

**Decisión de producto abierta (no bloquea, pero define el alcance):** hoy NO hay "amigos/seguir" (`friendships` es
solo-admin, stub; directorio público sin follow mutuo). El feed muestra actividad de **todo el directorio**. Si crece,
plantear un sistema de **follow** para filtrar. Para empezar sirve el directorio público actual.

**Fuera de alcance (anotado, NO objetivo):** push real con la app cerrada exigiría FCM/Web Push + handler `push` en el
service worker (hoy `public/service-worker.js` solo cachea) + un backend de fan-out. Descartado por decisión del usuario.

---

## F5 — "Me gusta" a una reseña  ✅ (con matiz arquitectónico)

**Estado base:** las reseñas son entradas `review` en el gist **público de su autor** (`myGameList.social.json`); el feed
las lee de todos los gists del directorio (`useSocialViewModel.ts`). Cada actividad ya tiene `key` estable
(`${actorProfileId}:${gameId}:${type}`). El perfil/identidad va por `profileId` (pseudónimo), no por uid/email.

**El matiz:** un usuario **solo puede escribir su propio gist** (y en Firestore, su propio doc — `firestore.rules`,
`isOwner`). No puede escribir un like dentro de la reseña ajena. Dos vías:

### Opción A — likes en el gist del que da el like (recomendada, ~2-3 d, sin backend)
- B guarda en SU propio gist público un array `likes: [{ key, likedAt }]` (la `key` de la actividad que le gusta).
- El feed ya carga todos los gists del directorio → **agrega los likes al leer** (cuenta por `key`, marca si el usuario
  actual ya dio like). Coste de conteo O(directorio), pero esas lecturas ya se hacen para el feed. Consistencia eventual.
- Toggle de like = reescritura del gist propio (mismo mecanismo que ya se usa para reseñas).
- [ ] `likes: Array<{ key: string; likedAt: number }>` en `SocialGistData` (`src/model/types/social.ts`) + Zod.
- [ ] `toggleLike(activityKey)` en `socialPublishRepository.ts` (upsert/borra en el gist propio).
- [ ] Agregación en `useSocialViewModel.ts`: contar likes por `key` y `likedByMe` al construir los items del feed.
- [ ] Botón de like + contador en `SocialFeedScreen.tsx` / `SocialDetailScreen.tsx`.
- ✅ Encaja con la filosofía "cliente estático puro" y con el endurecimiento de PII (C5): no expande superficie en Firestore.
- ⚠️ Conviene abordarlo **tras el cutover v4** (cambia el esquema del gist social).

### Opción B — likes en Firestore (tiempo real/escala, pero amplía superficie)
- Colección nueva, p.ej. `reviewLikes/{activityKey}/likers/{profileId}` o un contador con `FieldValue.increment`.
- Requiere **nuevas `firestore.rules`** (cualquier autenticado crea/borra SU like; lectura agregada) + tests de emulador.
- Ventaja: conteo exacto y barato sin leer todos los gists; base para tiempo real.
- Desventaja: amplía justo la superficie de escritura/PII que C5 está reduciendo. Usar SIEMPRE `profileId`, nunca uid/email.

**Recomendación:** Opción A (gist agregado al leer) para mantener la pureza estática y la coherencia con C5; subir a B
solo si el conteo por lectura de directorio se vuelve caro al crecer el número de perfiles.

---

# PLANES DETALLADOS (próximos a implementar)

> Verificados contra el código real el 2026-06-25. Dato clave: la CSP (`public/_headers`) usa `script-src 'self'`
> SIN `unsafe-inline` ni nonce → un `<script>` inline en `index.html` quedaría bloqueado; por eso F1 usa un fichero
> estático `public/theme-init.js` (es `'self'`, permitido).

## PLAN F1 — Tema claro/oscuro  ✅ IMPLEMENTADO (2026-06-25, rama `develop`)

> Hecho y verificado: `typecheck` + `eslint` + `npm test` (130 ok) + `build` verdes; probado en navegador (alterna
> claro↔oscuro, persistencia tras recarga, `theme-color` dinámico, init sin flash vía `theme-init.js` cargado
> antes del CSS). **UI: botón-icono compacto y discreto en el `app-header`** que ALTERNA claro↔oscuro (sol/luna,
> 2 estados) — NO en Ajustes (decisión del usuario 2026-06-25). El estado "auto" intermedio se ELIMINÓ por confuso
> (en sistemas oscuros parecía no cambiar + icono redondo). **Defecto sin valor guardado: tema del sistema
> (`prefers-color-scheme`); si no se detecta, OSCURO** (no se persiste hasta que el usuario pulsa). Ficheros: `_base.scss` (paleta dark + bloque `[data-theme=light]` +
> tokens `--star-*`/`--fg-*`/`--overlay-hover`/`--detail-row-bg`), `_table.scss` + `_forms-and-buttons.scss` +
> `_layout.scss` (header bar + badge "LISTADOS" → variables; colores hardcodeados → variables), `storageKeys.ts`
> (`THEME_KEY`), `useTheme.ts` (hook), `ThemeToggle.tsx` (botón-icono), `Header.tsx`, `labels.ts`
> (`settings.appearance`), `public/theme-init.js` + `index.html`.
> ✅ **Barrido light ampliado (2026-06-25):** barra inferior (`.bottom-nav*` → `--bg`/`--surface-glass`/`--overlay-hover`)
> y overlays/modales (admin-warning, sync-badge, sync-status-msg, code, hovers → `--fg-*`/`--overlay-hover`) pasados a
> variables. Nuevo token `--surface-glass`. El panel del modal ya era var-based. Verificado en navegador (nav + modal
> "Nuevo juego" en claro; oscuro sin regresión).
> ✅ **Social hub pasado a tema (2026-06-25):** textos azul-claro → tokens `--hub-text`/`--hub-text-muted`; tarjetas y
> degradados → `--hub-card-bg`/`--hub-grad-start`/`--hub-grad-end`; overlays/bordes blancos → `--overlay-hover`/`--border`;
> acentos verde/ámbar → `--fg-*`. Verificado en navegador (gateway/pasos/tarjetas en claro; oscuro sin regresión).
> Los badges decorativos "rejugar/oportunidad" (`_table.scss`) se dejan: son círculos con gradiente propio + texto
> claro, legibles en ambos temas (no dependen del fondo). **F1 (tema claro/oscuro) queda completo.**

Enfoque: `data-theme` en `<html>`, paleta por variables CSS, persistencia local, init sin flash vía script estático.

**Fase 1 — Tokens de color**
- [ ] `_base.scss`: el `:root` actual = paleta OSCURA (sin cambiar valores). Añadir `:root[data-theme="light"]` con los
      equivalentes claros de las mismas variables. Mantener `--steam*` (marca) salvo ajuste de contraste.
- [ ] `color-scheme` dinámico: `:root { color-scheme: dark }` + `:root[data-theme="light"] { color-scheme: light }`
      (sustituye al `html { color-scheme: dark }` fijo).
- [ ] Extraer a variables los ~47 colores hardcodeados que rompen el tema: `_table.scss` (estrellas `#3d5573/#7dd3ff`,
      chips, badges) y `_forms-and-buttons.scss` (estados de botón). Variables nuevas (`--star-empty`, `--star-full`,
      `--chip-…`) + su versión clara en el bloque light.

**Fase 2 — Estado y persistencia**
- [ ] `storageKeys.ts`: `THEME_KEY = 'mis-listas-theme'` (`'dark' | 'light' | 'auto'`).
- [ ] Hook `src/view/hooks/useTheme.ts`: lee preferencia, resuelve `'auto'` con `matchMedia('(prefers-color-scheme: light)')`,
      escribe `document.documentElement.dataset.theme`, persiste y actualiza `<meta name="theme-color">`. Autocontenido.

**Fase 3 — Init sin flash (CSP)**
- [ ] `public/theme-init.js`: lee `localStorage['mis-listas-theme']`, aplica `documentElement.dataset.theme` + `theme-color`.
- [ ] Referenciarlo como PRIMER elemento del `<head>` en `index.html` (`<script src="/theme-init.js"></script>`): `'self'`
      pasa la CSP; síncrono → corre antes de pintar. No hay que tocar `_headers`.

**Fase 4 — UI**
- [ ] Componente `ThemeToggle` (claro/oscuro/automático) con `useTheme`, montado en `SettingsHub.tsx` (autosuficiente,
      sin añadir props al hub presentacional).

**Fase 5 — Verificación**
- [ ] `typecheck` + `eslint` + `build`. Visual: sin flash al recargar en claro; conmutar; contraste a11y de
      estrellas/chips/botones; modo auto con `prefers-color-scheme`.

Riesgo: bajo. No toca datos ni sync. Reversible quitando el bloque light + el toggle.

## PLAN F3 — Feed social con texto libre + hipervínculos

> **Decisión (2026-06-25): OPCIÓN B — `posts` dentro de `myGameList.social.json`** (campo aditivo en el mismo fichero).
> **Aclaración del análisis:** F3 **NO depende del cutover v4** (eso es el gist de *juegos*). El gist *social* es otro
> canal. Verificado en código: la lectura social ya es TOLERANTE (`normalizeSocialGistData` ignora campos desconocidos;
> `assertValidSocialGist` estricto solo corre al ESCRIBIR). La escritura hace `PATCH` nombrando solo `social.json`.
> ⇒ Un cliente VIEJO **leyendo** un gist con `posts` no se rompe (los ignora). El ÚNICO riesgo residual: un cliente
> viejo que **reescriba** su propio `social.json` (p.ej. al guardar una reseña/perfil) **dropea sus `posts`** porque no
> conoce el campo. Recuperable (repostear). Mitigación: actualizar el build en todos los dispositivos del usuario antes
> de usarlo a fondo (consejo operativo análogo a v4, pero aquí la lectura NO se rompe en ningún caso).

Diseño: el `activity` del gist es `z.strictObject` atado a juego (gameId/gameName/rating); un post libre no encaja ahí
sin debilitar la validación. → array `posts` SEPARADO **dentro de `social.json`**, con su propio sub-esquema estricto.
El feed lo fusiona con `activity` al leer.

**Fase 0 — Compatibilidad con el código antiguo (lo que pidió el usuario)**
- [ ] `normalizeSocialGistData`: **leer y PRESERVAR** `posts` (round-trip); `getEmptySocialGistData` incluye `posts: []`.
      Así un cliente NUEVO nunca dropea posts al reescribir (ya hace read-merge: `readSocialGist → upsert → write`).
- [ ] `posts: z.array(postSchema).optional()` en `socialGistSchema` → gists viejos SIN `posts` siguen validando al escribir.
- [ ] (Opcional) `socialGistNeedsRewrite`/`schemaVersion`: marcar gist "posts-aware" para diagnóstico; no imprescindible
      por ser aditivo. NO subir el mínimo de schemaVersion exigido en lectura (rompería compat).
- [ ] Documentar el riesgo residual (drop por dispositivo viejo al reescribir) en la UI/README de la feature.

**Fase 1 — Modelo y esquema (frontera de privacidad)**
- [ ] `social.ts`: `SocialPostEntry { id; profileId; authorName; text; links:{url;label?}[]; createdAt; updatedAt }` +
      `posts?: SocialPostEntry[]` en `SocialGistData`.
- [ ] `socialGistSchema.ts`: `postSchema = z.strictObject({...})` con `text: z.string().max(TEXT_MAX)`,
      `links: z.array(z.strictObject({url,label})).max(N)`, y `posts: z.array(postSchema).optional()` en `socialGistSchema`.

**Fase 2 — Saneado (sin DOMPurify, sin HTML)**
- [ ] `sanitize.ts`: `isValidHttpUrl(url)` (solo `http:`/`https:`; descarta `javascript:`/`data:`), `safePostText` (trim+cota),
      normalización de links.
- [ ] Util de presentación `linkifyText(text)` → fragmentos React: texto plano (escapado) + `<a href rel="noopener noreferrer"
      target="_blank">` solo para URLs válidas. CERO `dangerouslySetInnerHTML`.

**Fase 3 — Escritura**
- [ ] `gistRepository.ts`: `upsertPost(data, input)` (espejo de `upsertReviewActivity`, sobre `posts`) con saneado +
      `assertNoSocialPrivateFields` como red.
- [ ] `socialPublishRepository.ts`: `publishPost({text,links})` reusando `readSocialGist → remapSocialActorIds → upsert →
      writeSocialGist → ensureProfileByEmail` (no-op sin sesión Google/gist social).

**Fase 4 — UI y feed**
- [ ] Formulario "Nueva publicación" (textarea + enlaces) en el hub social; validación de URL en cliente; aviso de PÚBLICO.
- [ ] `useSocialViewModel.ts`: donde hoy `flatMap((entry) => entry.activity)` (≈459) y la hidratación del directorio (≈876-905),
      incluir `posts` mapeados a items del feed con discriminador `kind:'post'` (+ `profileDisplayName`/`socialGistId`).
- [ ] `SocialFeedScreen.tsx`/`SocialDetailScreen.tsx`: rama `kind === 'post'` con autor, fecha y `linkifyText(text)` (sin estrellas).

**Fase 5 — Verificación**
- [ ] Tests: `isValidHttpUrl` (rechaza `javascript:`), `linkifyText` (no inyecta HTML), `postSchema` (rechaza extras/`javascript:`).
      `typecheck`/`eslint`/`build`. Manual: publicar post con enlace, verlo en feed propio y en otro dispositivo.

Riesgos: (a) XSS = punto crítico → "nunca HTML, solo URLs http/s validadas". (b) posts PÚBLICOS (gist). (c) compat con
clientes viejos: la LECTURA no se rompe (campo ignorado); riesgo residual = drop al REESCRIBIR desde un dispositivo
viejo → mitigado actualizando el build en todos los dispositivos (NO requiere el cutover v4; es un canal distinto).
