# INTEGRACIONES — fuentes de datos y librerías para enriquecer el proyecto

> Catálogo de integraciones evaluadas para enriquecer myGameList (2026-06-21), atadas a los hallazgos de la
> revisión global (ver [`CODE-REVIEW-IMPROVEMENTS.md`](./CODE-REVIEW-IMPROVEMENTS.md)).
> Restricción del proyecto: **cliente estático puro** (Cloudflare Pages, sin backend), pero **ya hay Cloudflare**
> disponible (Pages Functions / Workers como proxy ligero). Datos personales (reseñas, notas) NO salen; esto es
> solo para enriquecer METADATOS.
> Marcado **[v]** lo verificado en vivo el 2026-06-21; ⚠️ = cifra propensa a cambiar, verificar en docs oficiales.

---

## PARTE A — Fuentes de datos de videojuegos

**Motivación:** hoy se rellenan a mano géneros, plataformas, años y horas en `FormModal`. Una fuente de datos
permite **autocompletar desde el nombre del juego** y añadir **carátulas** a la `GameTable` (hoy solo texto).

### Recomendación primaria: RAWG detrás de un Cloudflare Worker con caché KV

**RAWG** cubre en una sola llamada casi todos los objetivos:
- `background_image` (carátula), `genres`, `platforms`/`parent_platforms`, `released` (año),
  `metacritic` (crítica) y `playtime` (horas aproximadas, estilo HLTB pero burdo).
- **[v]** Free tier: **20.000 req/mes**, API key simple, **solo proyectos NO comerciales** + **backlink a RAWG**
  obligatorio en las páginas que usan sus datos. Plan Business $149/mes si fuera comercial (<100k MAU). Caso personal = free tier.
- Permite **CORS directo** desde navegador (prototipado sin infra), pero eso **expone la API key** en el bundle.

**Por qué con Worker (recomendado) y no directo:**
1. Oculta y rota la key (variable de entorno del Worker, fuera del bundle).
2. Caché compartida en **Cloudflare KV / Cache API** (clave por nombre de juego) → multiplica el límite de 20k/mes
   y hace el autocomplete instantáneo en repeticiones.
3. Permite **sumar más fuentes sin tocar el cliente** (IGDB, SteamGridDB, scraper HLTB) más adelante.

### Complementos opcionales
- **SteamGridDB** — solo arte (carátulas/portadas/logos curados, mejor que `background_image`). Token + proxy
  requeridos. Para una vista "galería". Ojo a licencias de las imágenes.
- **IGDB (vía Twitch)** — catálogo más completo (consolas/exclusivos) y mejor crítica agregada. OAuth de Twitch con
  **client secret NO exponible** + **CORS bloqueado** → **Worker obligatorio**. Solo si RAWG se queda corto. ⚠️ ~4 req/s.
- **Wikidata / Wikipedia REST** — sin auth y **CORS abierto** (directo desde navegador). Plataformas/fecha/IDs cruzados
  como fallback gratis sin secretos. Cobertura desigual; sin crítica ni duración.
- **HowLongToBeat** — **sin API oficial**; solo scraping frágil (zona gris de ToS, CORS bloqueado). Pragmático:
  empezar con `playtime` de RAWG; añadir scraper HLTB en el Worker solo si se necesita precisión main/extra/100%.

> Las que requieren secreto/CORS (IGDB, SteamGridDB, Steam Storefront, HLTB) **obligan a proxy**; RAWG y Wikidata
> pueden ir directas. Por eso **RAWG + Worker** es el punto óptimo cobertura/esfuerzo.

### Funciones que desbloquea
- Botón "buscar metadatos" en `FormModal` → autorrellena géneros/plataformas/año/horas/score sugerido.
- Carátulas en la tabla / vista galería.
- Dashboard de estadísticas (distribución de géneros, horas totales, línea temporal por año) sobre los datos ya estructurados.

---

## PARTE B — Librerías (cada una resuelve un hallazgo de la revisión)

### Alto valor / encaje directo con la deuda detectada
| Librería | Resuelve | Nota |
|---|---|---|
| **Radix UI Dialog** / **React Aria** | A11y-1 (modales sin focus trap) | Reemplaza el `<div role="button">` de `FormModal` por diálogo accesible (trap + restauración de foco + `::backdrop`). Alternativa cero-deps: `<dialog>` nativo + `showModal()`. |
| **react-hook-form** + `@hookform/resolvers` (Zod ya presente) | P3 (re-render del árbol al teclear) + validación | Draft local al modal, validación declarativa con el Zod que ya usas. |
| **TanStack Query** | Caché/dedup de la API de datos + in-flight dedup (B2 sync) | Mismo ecosistema que `@tanstack/react-virtual` ya usado. Ideal para la Parte A. |
| **vite-plugin-pwa** (Workbox) | M3 build (service worker manual, shell desactualizado offline) | Genera SW con precache + estrategias probadas; mantiene la CSP. Quita código frágil. |
| **Dexie.js** | Simplifica `indexedDbRepository.ts` (285 líneas a mano) | Migración opcional; reduce superficie de bugs de IndexedDB. |
| **Fuse.js** / **Orama** | Búsqueda del toolbar (hoy `includes` simple) | Fuzzy search tolerante a typos sobre nombre/géneros. |

### A considerar con cuidado (mayor coste/cambio)
- **Yjs** / **Automerge** (CRDT maduro) — podrían sustituir `mergeCrdt` y cerrar de raíz S1/S2 (no-determinismo, sin
  mutex). Cambio arquitectónico grande; el CRDT actual funciona a <1000 juegos. Solo si la sync sigue fallando tras C1/C2/S1.
- **Sentry** (`@sentry/react`) — soporta web (a diferencia de Crashlytics, ver README). Cubriría el hueco de telemetría
  de los `catch {}` silenciosos (B3 social) con source maps + `ErrorBoundary`.
- **Playwright** — e2e reales del flujo social/sync en navegador (hoy solo "smoke"); justo lo que `PENDING.md` lista como pendiente de verificar.

### Probablemente innecesarias
Zustand/Jotai (el MVVM con hooks cumple), date-fns (se usa `Date.now`), UI kit completo (rompería el estilo propio). No añadir sin necesidad concreta.

---

## ORDEN SUGERIDO
1. **Worker RAWG + caché KV** + botón "autocompletar" en `FormModal` → mayor salto de valor.
2. **react-hook-form + Zod** en `FormModal` (mata P3 + ordena validación; sinergia con 1).
3. **Radix/React Aria Dialog** (cierra A11y-1) — o `<dialog>` nativo si se prefiere cero deps.
4. **vite-plugin-pwa** (sustituye el SW manual).
5. Más adelante: TanStack Query (si crece el consumo de API), Sentry (telemetría), Playwright (e2e), SteamGridDB/IGDB (arte/cobertura).

> ⚠️ Pendiente de verificar en vivo antes de montar: límites actuales del free tier de Cloudflare Workers/KV,
> rate limits de IGDB/SteamGridDB, y términos comerciales de RAWG. (WebSearch estuvo caído en la sesión de evaluación;
> RAWG se verificó por fetch directo a rawg.io/apidocs.)
