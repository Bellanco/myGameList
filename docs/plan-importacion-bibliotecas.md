# Plan: importar bibliotecas de plataformas (Steam, Playnite, GOG, PlayStation, Xbox, EGS, Nintendo)

> Objetivo: que el usuario pueda traer los juegos que ya tiene en sus plataformas e
> importar metadatos (nombre, género, plataforma, carátula…) para rellenar los listados
> más fácilmente. Los juegos importados caen en la lista **Próximos (`p`)** y desde ahí
> se mueven a las demás listas con los flujos que ya existen.

> ⚠️ **Documento vivo.** Este plan es una guía de diseño, **no un contrato cerrado**. Las
> APIs de terceros (Xbox/PSN/GOG/EGS) y los formatos de export (Playnite) **cambian sin
> aviso**, y algunos contratos (esquemas, endpoints, límites) aquí descritos son *previsión*
> y deberán confirmarse contra la realidad al implementar. **Al abordar cada fase, verifica
> el endpoint/formato real y actualiza este `.md` en consecuencia** (marca lo confirmado, corrige
> lo que cambie, anota decisiones). Trátalo como código: se revisa y se actualiza con la
> implementación.

## TL;DR / recomendación

La estrategia se apoya en **dos pilares** (columna vertebral) más una **capa de enriquecimiento
(IGDB)** y unos **conectores directos secundarios**:

1. **Steam — integración directa (pilar 1).** Es la **única tienda con API oficial y pública**
   de biblioteca. Trivial para el usuario: solo su SteamID público. Necesita un pequeño proxy
   server-side para la API key y CORS.
2. **Playnite — import de fichero (pilar 2).** Playnite ya agrega en local Steam/GOG/Epic/
   Xbox/PSN; con una extensión de export a JSON el usuario suelta un fichero y **reutilizamos
   el import de backup que ya existe** (`SettingsHub.tsx:312`). **Cero backend, cero CORS,
   cero secretos**, y trae géneros/plataformas ya rellenos. Es la vía multi-plataforma más
   robusta. Ver **Anexo B**.
3. **IGDB — enriquecimiento EN ALCANCE (no es un pilar, pero se implementa).** Rellena los
   metadatos (género/plataforma/año/carátula) de los **imports directos** (Steam/PSN/Xbox/GOG/EGS),
   que llegan pobres, y alimenta el autocompletado del alta manual. **Playnite no lo necesita**
   (ya trae género/plataforma). Ver **Anexo A**.
4. **Conectores directos de GOG / PlayStation / Xbox / EGS — secundarios.** Todos dependen de
   **APIs de terceros / no oficiales** (frágiles, se rompen cuando la tienda cambia). Se
   ofrecen **solo como alternativa para quien no use un agregador** como Playnite. Fases 3+.
5. **Nintendo — fuera de alcance.** No hay API; solo librerías que reversean el login de la
   Switch app (frágiles, zona gris de TOS). Solo alta manual.

> **Regla de diseño:** preferir siempre **oficial (Steam)** y **agregador (Playnite)** sobre
> integrar cada tienda por separado. Cada conector directo de terceros que añadamos es
> superficie que tendremos que mantener cuando se rompa.

---

## Viabilidad por plataforma

| Plataforma | Cómo se obtiene la biblioteca | Qué da el usuario | ¿Oficial? / CORS-secreto | Esfuerzo | Fase |
|---|---|---|---|---|---|
| **Steam** | `IPlayerService/GetOwnedGames` (+ `appdetails` para género). Perfil público. | Su **SteamID64** / URL (público). | ✅ **Oficial**. Sin CORS; API key server-side. | Bajo | **1 (pilar)** |
| **Playnite** (agregador) | Export a JSON (Steam/GOG/Epic/Xbox/PSN ya agregados en local). Import de fichero. | Un **fichero `.json`**. | Local. **Ninguno** (sin red). | Bajo | **2 (pilar)** |
| **Xbox** | OpenXBL (`xbl.io`) — "Title History". | Su **API key OpenXBL** (la genera él). | ⚠️ **Tercero**. API key; proxy. 150 req/h. | Bajo-Medio | 3 |
| **PlayStation** | `psn-api`: NPSSO → token → `getPurchasedGames`/`getUserPlayedGames`. | Su **token NPSSO**. | ⚠️ **Tercero / reverse-engineered**. Proxy obligatorio. | Medio | 3 |
| **GOG** | `embed.gog.com/user/data/games` (+ catálogo). Requiere sesión. | Login GOG (OAuth no oficial). | ⚠️ **No oficial**. Proxy + OAuth. | Medio-Alto | 4 |
| **EGS (Epic)** | GraphQL/OAuth del launcher (estilo legendary/Heroic): login Epic → `authorizationCode` → tokens → catálogo/library. | Login Epic (flujo no oficial). | ⚠️ **Tercero / reverse-engineered**. Proxy + OAuth. | Alto | 4 |
| **Nintendo** | No hay API pública. `nxapi`/`nso-api` + f-token de terceros (imink/flapg). | Login Nintendo + dependencia externa. | ⚠️ Muy frágil, zona gris de TOS. | Muy alto | **Fuera de alcance** |

> **Nota clave:** de todas, **solo Steam es oficial**. Xbox/PSN/GOG/EGS son no oficiales y por
> eso se recomienda cubrirlas vía **Playnite** (que ya integra las cuatro) antes que con
> conectores directos. Los conectores directos existen para el usuario que no quiera/pueda
> usar Playnite (p. ej. no está en Windows).

### Metadatos (enriquecimiento) — EN ALCANCE (para imports directos)

Fuente para normalizar **nombre / géneros / plataformas / carátula / año** cuando la vía de
import no los trae. Necesaria para los **imports directos** (Steam/PSN/Xbox/GOG/EGS); Playnite ya
trae géneros/plataformas y no la usa.

- **IGDB** (Twitch/Amazon) — *recomendada si se activa*. Datos curados, gratis. Auth OAuth de
  Twitch (client_id + secret → token de app cacheable). **Sin CORS → proxy.**
- **RAWG** — alternativa más simple (una API key). Base menos mantenida; **tampoco CORS** en la
  práctica → igualmente proxy. Peor calidad de `platforms`.
- **Steam `appdetails`** — para el import de Steam se puede rellenar el género con la propia
  tienda (taxonomía Steam, más burda y con rate-limit) **en vez de** IGDB, evitando esa
  dependencia.

> Decisión (2026-07-14): **IGDB entra**, como fuente de enriquecimiento de todos los imports
> directos (Steam/PSN/Xbox/GOG/EGS) y del alta manual. El proxy `functions/api/metadata.ts` pasa
> a ser parte de la Fase 0/1 (no opcional). Playnite sigue sin usarlo.

---

## Arquitectura propuesta

Reutiliza lo que ya existe: el patrón de **Cloudflare Pages Function** (`functions/api/
github-oauth.ts`) para los proxies, y el **import de fichero** de Ajustes (`SettingsHub.tsx:312`)
para Playnite.

### A. Proxies serverless (Cloudflare Pages Functions) — solo donde hacen falta
Junto a `functions/api/github-oauth.ts`:

- `functions/api/metadata.ts` — proxy a IGDB (guarda `TWITCH_CLIENT_ID`/`SECRET`, cachea el
  token). **En alcance** para enriquecer los imports directos (Anexo A).
- `functions/api/steam.ts` — proxy a `GetOwnedGames` (guarda `STEAM_API_KEY`). Recibe SteamID64,
  devuelve `[{ appid, name, playtime }]`.
- `functions/api/xbox.ts`, `functions/api/psn.ts`, `functions/api/gog.ts`, `functions/api/egs.ts`
  — **secundarios**, uno por conector directo de tercero. Se añaden solo si se implementa esa vía.

> **Playnite NO necesita proxy** (es import local). Steam necesita `steam.ts` e IGDB `metadata.ts`.
> El resto, solo si se implementan los conectores directos.

Secretos como env vars de Cloudflare (mismo mecanismo que el OAuth actual; ver `wrangler.toml`).
Validación de origen y rate-limit básico en cada función.

### B. Capa de conectores (cliente)
`src/model/repository/import/` con una interfaz común para **todas** las vías (fichero o red):

```ts
type ImportSource = 'steam' | 'playnite' | 'xbox' | 'psn' | 'gog' | 'egs';

interface RawExternalGame {
  externalId: string;   // p.ej. appid de Steam, id de Playnite, etc.
  name: string;
  source: ImportSource;
  genres?: string[];    // presentes en Playnite; ausentes en Steam directo
  platforms?: string[]; // idem
  hours?: number | null;
  year?: number | null;
}

interface LibraryConnector {
  id: ImportSource;
  label: string;
  needsProxy: boolean;         // Playnite = false; Steam/otros = true
  fetchLibrary(input: unknown): Promise<RawExternalGame[]>; // fichero o credenciales
}
```
- `playniteConnector` (fichero) y `steamConnector` (SteamID → proxy) son las primeras.
- El enriquecimiento IGDB (`metadataRepository.ts`) es **un paso condicional del pipeline**, no
  del conector: solo se aplica a los juegos que llegan **sin** `genres`/`platforms` (imports
  directos); los de Playnite ya vienen completos y lo saltan.

### C. Pipeline de importación
`fetchLibrary → (enrich IGDB si faltan metadatos) → dedupe/fusión → preview → insertar en la BANDEJA`.

1. **Dedupe y fusión** (decisión: pregunta 3), tres casos:
   - **Ya existe en tus listas** (c/v/e/p, por nombre normalizado `hasGameInLists:479` o por
     `externalIds`): entra en la bandeja **marcado `existsInLists`** y se muestra en una
     **sección aparte** ("ya en tus listas"), para que el usuario lo sepa y decida.
   - **Re-import del mismo juego y mismo origen** (por `externalIds[source]`): **no** se duplica
     (idempotente).
   - **Mismo juego desde OTRA plataforma** (mismo nombre normalizado, distinto `source`):
     **no** se crea otra entrada; se **fusiona** en la existente añadiendo la nueva `platform` y
     el nuevo `externalIds[source]` (un juego puede tenerse en varias plataformas).
2. **Preview con selección**: modal con checkboxes (juego, plataforma, géneros); avisa de los ya
   presentes. Permite editar antes de confirmar.
3. **Inserción en lote en la BANDEJA**: `addGamesToStaging(items[])` (Anexo A5). Los juegos
   importados **no entran en c/v/e/p**, sino en un almacén nuevo de "importados" (ver
   sección **Parte visual / UX**). Solo al **clasificarlos** pasan a una lista y funcionan
   como el resto. En la bandeja los metadatos pueden estar incompletos (Steam directo).

### D. Cambios en el modelo de datos

**`GameItem` NO se modifica** (decisión: los campos de import no van al gist). Por tanto **no**
se toca `leanGameItem`/serialización del gist ni el merge CRDT. Los metadatos de import viven
**solo** en la bandeja local; al clasificar, el juego se crea como `GameItem` estándar.

**Almacén nuevo: la Bandeja de importados** (local, separado de las 4 listas). Estructura propia,
**no** una 5ª pestaña de `TabData` (evita tocar `TAB_IDS`, sorting, filtros, sync):

```ts
type ExternalIds = { steam?: string; xbox?: string; psn?: string; gog?: string; egs?: string; igdb?: string };

interface ImportedGame {
  id: number;                 // local, propio de la bandeja
  name: string;
  platforms: string[];        // se ACUMULAN al re-importar desde otra tienda (fusión, ver C1)
  genres: string[];           // de Playnite o de IGDB (imports directos)
  sources: ImportSource[];    // orígenes (puede ser multi-plataforma)
  externalIds?: ExternalIds;  // se acumulan por origen; para dedupe/fusión (local)
  coverUrl?: string;          // carátula IGDB para el preview de la bandeja (local, no va al gist)
  hours?: number | null;
  year?: number | null;
  existsInLists?: boolean;    // ya está en c/v/e/p → sección aparte
  importedAt: number;         // para la caducidad (TTL 30 días)
}
// Nuevo contenedor local:
interface ImportInbox { imported: ImportedGame[]; updatedAt: number; }
```
Al **clasificar** (graduar), `ImportedGame` → `GameDraft` (prefill del formulario) → `GameItem`
estándar. Los campos `externalIds`/`coverUrl`/`sources` se usan para prefill y dedupe pero **no**
se copian al `GameItem` sincronizado.
**Persistencia: SOLO LOCAL** (decisión: pregunta 1). La bandeja vive en `localStorage`/IndexedDB
del equipo; **no** viaja por el gist ni aparece en otros dispositivos — es una zona de paso. Al
**clasificar** un item, se elimina de `imported` y se inserta como `GameItem` normal en la lista
destino (ahí sí entra en el sync).

**Caducidad (TTL) = 30 días:** los items que llevan más de **30 días** en la bandeja (desde
`importedAt`) sin clasificar se **purgan automáticamente**. Aplica a todos los importados,
incluidos los marcados como duplicados.

### E. Almacenamiento de credenciales del usuario
- **Steam**: solo SteamID64 (público) → sin secreto que guardar.
- **Playnite**: fichero local → sin credenciales.
- **Xbox / PSN / GOG / EGS**: API key/token/OAuth **son secretos** → reutilizar el cifrado del
  token de sync (`core/security/crypto.ts` + config cifrada; patrón `getSyncConfig`/
  `ensureSyncConfigLoaded`). Nunca en claro en localStorage ni en el gist.

### F. UI
Detallada en la sección **Parte visual / UX** (dos pantallas nuevas + bandeja + acceso
persistente). Resumen: botón **"Integraciones"** en Ajustes → pantalla de import por plataforma
→ **Bandeja de importados** (almacén nuevo) → clasificar a c/v/e/p.

---

## Parte visual / UX (pantallas y flujos)

Introduce **dos pantallas nuevas**, un **acceso persistente** y el **almacén "Bandeja de
importados"** (sección D), separado de las 4 listas. Rutas con `react-router-dom@7` (ya en uso).

**Decisiones tomadas** (2026-07-14):
1. **Persistencia de la bandeja:** solo local (no sync). **Caducidad: 30 días** — los no
   clasificados se purgan.
2. **Al clasificar:** siempre abre el formulario (`FormModal`) precargado.
3. **Duplicados:** los que ya están en tus listas se muestran en **sección aparte** marcados;
   re-import del mismo origen es idempotente; mismo juego de **otra plataforma** → **fusión**
   (acumula plataformas), no duplicado.
4. **Acceso a la bandeja:** entrada en el **menú** con contador, visible solo si hay elementos.
5. **IGDB EN ALCANCE:** se usa para **enriquecer los imports directos** (Steam/PSN/Xbox/GOG/EGS),
   que llegan con metadatos pobres. Playnite no lo necesita (ya trae género/plataforma).
6. **Los campos de import NO van al gist.** `externalIds`/`coverUrl`/`importedFrom`/`sources`
   viven **solo en la bandeja** (`ImportedGame`, local). `GameItem` **no se modifica**: al
   clasificar, el juego pasa al gist como un `GameItem` estándar con los campos de siempre.
   *Consecuencia:* un juego ya clasificado **no conserva carátula ni IDs externos** en el gist
   (si en el futuro se quieren carátulas en las listas, sería un cambio aparte).

### Flujo general
```
Ajustes ──[botón "Integraciones"]──▶ Pantalla Integraciones (importar por plataforma)
                                          │  (import + dedupe)
                                          ▼
                                   BANDEJA de importados  ◀── se guarda en el equipo
                                          ▲
        [acceso persistente: badge/botón visible siempre que la bandeja tenga elementos]
                                          │
                                          ▼
                              Pantalla de la Bandeja
                                          │  clasificar cada juego → c / v / e / p
                                          ▼
                    el juego SALE de la bandeja y entra en la lista
                        (ahí ya funciona como el resto: sync, editar, mover…)
```

### 1. Entrada en Ajustes — botón "Integraciones"
En `SettingsHub.tsx`, junto al import/export de backup (`:312-326`), un botón **"Integraciones"**
que navega a la pantalla de Integraciones.

### 2. Pantalla "Integraciones"
- Una **tarjeta por vía**. Orden por prioridad: **Steam** y **Playnite** (pilares) arriba; en un
  bloque "Avanzado" plegable: **Xbox / PSN / GOG / EGS**.
- Cada tarjeta: estado (conectado / no), el input que requiera (SteamID / fichero `.json` /
  API key…), y botón **"Importar"**.
- Al importar: ejecuta el conector → (preview opcional de selección) → los elegidos entran en la
  **Bandeja** aplicando la comprobación de duplicados (punto 6).

### 3. Bandeja de importados (almacén nuevo)
- Estructura propia `ImportInbox`/`ImportedGame` (sección D), **no** una 5ª pestaña.
- **Solo local** (pregunta 1): se guarda en el equipo, no se sincroniza. **Caducidad**: los no
  clasificados se purgan tras un tiempo prudencial (por defecto 30 días; ver sección D).
- Cada item conserva name, platforms (acumuladas), genres, externalIds, coverUrl, sources,
  hours, year, y `existsInLists` si ya está en tus listas.

### 4. Acceso persistente (entrada en el menú)
- **Entrada en el menú/navegación con contador** (pregunta 4), visible **solo si
  `imported.length > 0`**, que lleva a la pantalla de la Bandeja. Al vaciarse, desaparece.

### 5. Pantalla de la Bandeja
- Lista de importados: carátula, nombre, plataforma, género, origen y aviso **"ya en tus listas"**
  cuando aplique. Renderizable con `@tanstack/react-virtual` (ya en uso) si hay muchos.
- Dos secciones: **"Nuevos"** y **"Ya en tus listas"** (los `existsInLists`, diferenciados).
- Acciones por item: **Clasificar** (elegir lista destino c/v/e/p), **Editar**, **Descartar**.
  (Posibles acciones en lote más adelante.)
- Al **Clasificar** (pregunta 2): **siempre abre `FormModal`** precargado con los metadatos del
  item, para revisar/completar los obligatorios (género/plataforma; en Completados también año y
  nota) antes de confirmar. Al guardar, el item **sale de la bandeja** y entra en la lista como
  `GameItem` normal.

### 6. Comprobación de duplicados y fusión (pregunta 3)
Lógica detallada en **pipeline C1**. Resumen:
- **Ya en tus listas** (nombre normalizado o `externalIds`) → entra marcado `existsInLists` y se
  muestra en la sección aparte "Ya en tus listas".
- **Re-import mismo juego + mismo origen** → idempotente, no duplica.
- **Mismo juego, otra plataforma** → **fusión**: se añade la plataforma y el `externalIds[source]`
  al item existente (un juego puede tenerse en varias tiendas), sin crear otra entrada.

---

## Prerrequisitos (pre-flight) — resolver ANTES de empezar

Verificado contra el código (2026-07-14). Tres bloques: decisiones, cuentas/secretos y tocar-código-sí-o-sí.

### P0. Decisiones de alcance — CERRADAS (2026-07-14)
- [x] **IGDB: DENTRO.** Se usa para enriquecer los imports directos (Steam/PSN/Xbox/GOG/EGS). ⇒
      activa el prerrequisito de cuenta Twitch (P1) y el cambio de CSP (P3).
- [x] **Los campos de import NO van al gist** (ni social ni personal). ⇒ **no** se toca
      `leanGameItem` ni `socialGistSchema.ts`/`toPublicGame`. `GameItem` no cambia.
- [x] **Almacén de la bandeja:** object store IndexedDB dedicado (más limpio) ⇒ bump `DB_VERSION`.
- [x] **TTL = 30 días.** **Género en imports directos = IGDB.**

### P1. Cuentas y secretos a provisionar (dependen de ti / del despliegue)
- [ ] Acceso a **Cloudflare Pages** para añadir env vars (mismo mecanismo que `GITHUB_CLIENT_SECRET`)
      y un `.dev.vars` local para desarrollo.
- [ ] **Steam Web API key** (steamcommunity.com/dev/apikey) → env var `STEAM_API_KEY` (Fase 1).
- [ ] App de **Twitch** (IGDB está dentro) → `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`.
- [ ] **(Fases 3-4)** OpenXBL API key, NPSSO, apps OAuth de GOG/EGS. No hacen falta para empezar.

### P2. Datos de referencia
- [ ] **Playnite (Fase 2)**: elegir **la** extensión de export soportada y **capturar un JSON real
      de muestra** — sin él no se puede escribir/validar el `playniteMapper`. Fijar y documentar su esquema aquí.

### P3. Cambios en código no negociables (o se rompe algo)
- [ ] **CSP (BLOQUEANTE, IGDB está dentro):** añadir `https://images.igdb.com` a `img-src` en
      `public/_headers` (para la carátula del preview de la bandeja). Los `fetch` a `/api/*` son
      same-origin → OK (`connect-src 'self'`).
- [ ] **IndexedDB:** store dedicado para la bandeja ⇒ bump `DB_VERSION` (`idbConnectionRepository.ts:2`)
      + crear el store en `onupgradeneeded`; y bump `LOCAL_SCHEMA_VERSION` (`storageKeys.ts:5`).
- [ ] **Routing:** añadir `/integraciones` y `/bandeja` a `APP_ROUTE_PATHS` (`App.tsx:57`; hay
      test de regresión de rutas) y extender `AppSection` (`BottomNavigation.tsx:6`) para la
      entrada de menú con contador.
- [ ] Crear las Functions `functions/api/metadata.ts` (IGDB) y `functions/api/steam.ts` (aún no existen).

### Ya NO es bloqueante (por la decisión "los campos no van al gist")
- **`leanGameItem` / serialización del gist:** no se toca (los campos de import viven solo en la
  bandeja local). **Merge CRDT / zod / lectura del gist:** intactos, no intervienen.

---

## Fases de implementación

> Recordatorio: al empezar cada fase, **confirmar endpoints/formatos reales y actualizar este
> documento**. Las casillas y contratos de abajo son provisionales.

### Fase 0 — Cimiento común (sin cuentas externas)
- [ ] Campos aditivos en `GameItem` (`externalIds`, `coverUrl`, `importedFrom`) + tests de
      compresión/merge del gist.
- [ ] Almacén `ImportInbox`/`ImportedGame` (sección D), **persistencia solo local** + purga TTL.
- [ ] `addGamesToStaging(items[])` — inserta en la bandeja con dedupe+fusión (marcar
      `existsInLists`, idempotente por `externalIds[source]`, fusionar plataformas si difiere el
      origen), **un solo persist**, id máx calculado una vez (Anexo A5).
- [ ] `graduateFromStaging(importedId, targetTab)` — **abre `FormModal`**; al guardar, saca de la
      bandeja y crea el `GameItem` en la lista destino.
- [ ] `purgeStaleImports(now)` — purga los no clasificados pasados 30 días (valor a confirmar).
- [ ] Interfaz `LibraryConnector` y esqueleto de `src/model/repository/import/`.
- [ ] **UI (transversal):** ruta+botón "Integraciones" en Ajustes, pantalla de Integraciones,
      pantalla de la Bandeja (secciones "Nuevos"/"Ya en tus listas") y **entrada de menú con
      contador**. Ver *Parte visual / UX*.
- [ ] `functions/api/metadata.ts` (IGDB) + `metadataRepository.ts` + normalización de tags
      (Anexo A) — necesarios para el enriquecimiento de imports directos. El buscador con
      autocompletado en `FormModal` es un extra que puede ir después.

### Fase 1 — Steam (pilar 1)
- [ ] `functions/api/steam.ts` (`GetOwnedGames`, `STEAM_API_KEY`).
- [ ] `steamConnector` (SteamID64 / vanity URL → lista).
- [ ] Género: por IGDB (si activo) o por `appdetails` de Steam. Documentar el elegido.
- [ ] Preview → `addGamesToStaging` (bandeja). UX: avisar de que el perfil debe ser público.

### Fase 2 — Playnite (pilar 2)
- [ ] Fijar la extensión de export soportada y **documentar su esquema JSON** (Anexo B).
- [ ] `playniteMapper` (zod tolerante) → `RawExternalGame[]` → `addGamesToStaging` (bandeja).
- [ ] Enrutar el input de fichero de `SettingsHub` a "Playnite" (junto al import de backup).

### Fase 3 — Xbox (OpenXBL) y PlayStation (NPSSO) — conectores directos, secundarios
- [ ] `functions/api/xbox.ts` + `xboxConnector` (API key personal, cifrada).
- [ ] `functions/api/psn.ts` (intercambio NPSSO→token, refresh) + `psnConnector`; guía en la UI.
- [ ] Enriquecer género (faltan en estas fuentes) vía IGDB.

### Fase 4 — GOG y EGS — conectores directos, secundarios
- [ ] `functions/api/gog.ts` + OAuth no oficial → `embed.gog.com/user/data/games`.
- [ ] `functions/api/egs.ts` + OAuth de Epic (estilo legendary/Heroic) → library/catálogo.
- [ ] **Antes de implementar**: reconfirmar que los endpoints siguen vivos; si Playnite ya
      cubre bien el caso, valorar **no** implementar el conector directo.

### Fuera de alcance — Nintendo
- Solo alta manual (con el buscador de metadatos si está activo). Documentar el porqué.

---

## Riesgos y decisiones abiertas

- **No oficialidad / TOS**: OpenXBL, psn-api, GOG, EGS y (sobre todo) Nintendo son no oficiales;
  pueden romperse o infringir TOS. Steam e IGDB son las vías estables. **Playnite traslada ese
  riesgo a un proyecto que ya lo mantiene.**
- **Documento vs realidad**: los contratos aquí son previsión. Confirmar y **actualizar el `.md`**
  al implementar cada fase (ver aviso de cabecera).
- **Coste/límites**: IGDB 4 req/s, RAWG 20.000/mes, OpenXBL 150 req/h → cachear y hacer batch.
- **Matching por nombre**: los nombres de tienda no siempre casan 1:1 con IGDB (ediciones, ™).
  Siempre preview editable antes de confirmar.
- **Tamaño del gist**: vigilar `coverUrl` y el volumen importado sobre compresión y merge CRDT.
- **Secretos**: toda API key/token en las funciones Cloudflare o cifrados en cliente; nunca en
  el bundle ni en el gist en claro.

---

## Puntos de anclaje en el código (referencia)

- Modelo del juego: `src/model/types/game.ts:4` (`GameItem`), listas `TabData` `:35`.
- Listas y transiciones: `src/core/constants/labels.ts:11` (etiquetas), `:41` (`TAB_ACTIONS`).
- Alta / mover / insertar: `src/viewmodel/useGameListViewModel.ts` →
  `GameDraft:28`, `saveDraft:330`, `migrateGame:291`, `moveGameToTab:451`, `deleteGame:394`,
  `addGameToProximos:489`, dedupe `hasGameInLists:479`.
- Alta manual (UI): `src/view/modals/FormModal.tsx` (borrador local `:92`, `getCanonicalTag:70`,
  `runSave:186`), import de backup `src/view/components/SettingsHub.tsx:312`.
- Proxy serverless de referencia: `functions/api/github-oauth.ts`, `wrangler.toml`.
- Sync/gist: `src/model/repository/gistRepository.ts:40`, `syncRepository.ts`, compresión
  `gistRepository.ts:44-77`; cifrado `src/core/security/crypto.ts`.

## Fuentes (investigación de APIs)
- Steam / CORS: <https://developer.valvesoftware.com/wiki/Steam_Web_API>, <https://steamcommunity.com/discussions/forum/1/1743358239838884448/>
- Playnite (export): <https://github.com/JosefNemec/Playnite/issues/791>, <https://github.com/NicodeSS/playnite-game-data-exporter>, <https://github.com/zachvlat/playnite-json>
- GOG (no oficial): <https://gogapidocs.readthedocs.io/en/latest/>, <https://koalakola.com/2025/06/28/gog-com-data-extraction-via-api/>
- PlayStation: <https://www.npmjs.com/package/psn-api>, <https://github.com/achievements-app/psn-api>
- Xbox (OpenXBL): <https://xbl.io/>, <https://api.xbl.io/docs>
- EGS (Epic, no oficial): <https://github.com/derrod/legendary>, <https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher>
- Nintendo (no oficial): <https://github.com/samuelthomas2774/nxapi>
- Metadatos IGDB / RAWG: <https://api-docs.igdb.com/>, <https://api.rawg.io/docs/>, <https://rawg.io/apidocs>

---

# Anexo A — Diseño técnico de la Fase 0 (con enriquecimiento IGDB)

> El cimiento (bandeja + `addGamesToStaging`/`graduateFromStaging`/`purge`) es **necesario para
> todas las fases**. El proxy IGDB + normalización enriquecen los imports directos; el buscador
> del alta manual (A4) es un extra que puede ir después.

Piezas: (A1) proxy IGDB, (A2) repositorio cliente de metadatos, (A3) normalización de tags,
(A4) buscador en `FormModal` (extra), (A5) inserción en lote.

## A1. Proxy IGDB — `functions/api/metadata.ts`

Función Cloudflare Pages análoga a `github-oauth.ts` (mismo estilo: handler `onRequest*`, helper
`json()`, secretos por `env`). Sirve desde el **mismo origen** que la SPA ⇒ **sin CORS** en cliente.

**Contrato** *(provisional — confirmar al implementar)*
```
GET /api/metadata?q=<texto>&limit=8      → búsqueda por texto
GET /api/metadata?ids=<id1,id2,...>      → detalle por IDs (para import en lote)

200 → { "results": MetadataResult[] }
4xx/5xx → { "error": string }

interface MetadataResult {
  externalId: string;      // id de IGDB → externalIds.igdb
  name: string;
  genres: string[];        // ya normalizados a los tags de la app (A3)
  platforms: string[];     // idem
  year: number | null;     // de first_release_date (epoch s → año)
  coverUrl: string | null; // https://images.igdb.com/.../t_cover_big/<hash>.jpg
}
```

**Auth IGDB (Twitch OAuth, servidor)**
1. `POST https://id.twitch.tv/oauth2/token?client_id=…&client_secret=…&grant_type=client_credentials`
   → `{ access_token, expires_in }` (token de app ~60 días).
2. **Cachear el token en el edge** (variable de módulo con expiración, o Cache API/KV).
3. IGDB (*apicalypse*):
   ```
   POST https://api.igdb.com/v4/games
   Headers: Client-ID: <id>, Authorization: Bearer <token>
   Body: search "<q>"; fields name,genres.name,platforms.name,first_release_date,cover.image_id;
         where version_parent = null & category = 0; limit 8;
   ```
4. **Normalizar en el servidor** al `MetadataResult` (carátula:
   `https://images.igdb.com/igdb/image/upload/t_cover_big/<image_id>.jpg`).

**Env vars**: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (como `GITHUB_CLIENT_SECRET`).
**Endurecimiento**: validar `q`, limitar `limit`, `Cache-Control` corto, rate-limit por origen.

> Alternativa RAWG: `GET https://api.rawg.io/api/games?search=…&key=…`, mapear
> `genres[]`/`platforms[]`/`released`/`background_image` al mismo contrato.

## A2. Repositorio cliente — `src/model/repository/metadataRepository.ts`
```ts
export interface MetadataResult { /* = contrato A1 */ }

export async function searchGameMetadata(
  query: string, signal?: AbortSignal,
): Promise<MetadataResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`/api/metadata?q=${encodeURIComponent(q)}&limit=8`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: MetadataResult[] };
  return data.results ?? [];
}
```
El *debounce* (≈300 ms) y el `AbortController` los gestiona la UI (A4).

## A3. Normalización de tags — `src/core/utils/metadataNormalize.ts`
Los géneros/plataformas de IGDB (y de cada tienda) no coinciden 1:1 con los tags libres de la
app. Mapear con tablas pequeñas y **caer al nombre crudo** si no hay entrada:
```ts
const GENRE_MAP: Record<string, string> = { 'Role-playing (RPG)': 'RPG', 'Adventure': 'Aventura', /* … */ };
const PLATFORM_MAP: Record<string, string> = {
  'PC (Microsoft Windows)': 'PC', 'PlayStation 5': 'PS5', 'Xbox Series X|S': 'Xbox Series',
  'Nintendo Switch': 'Switch', /* … */
};
```
Al aplicar en el formulario, pasar cada tag por `getCanonicalTag(lookup, value)` (ya existe en
`FormModal.tsx:70`) para respetar la capitalización previa del usuario. **Esta normalización la
comparten Playnite y los conectores de tienda**, no solo IGDB.

## A4. Buscador en `FormModal.tsx` (solo si IGDB activo)
`FormModal` ya mantiene el borrador local (`draft`/`setLocalDraft`, `:92`, `:105-111`) y el
patrón de tags. Añadir el buscador **solo en alta nueva** (`!initialDraft.id`), encima del campo
Nombre (`:276-288`):
- Estado local `query`/`results`/`loading`; `useEffect` con debounce 300 ms + `AbortController`.
- Desplegable (miniatura `coverUrl`, nombre, año, plataformas). Al elegir:
```ts
function applyMetadata(m: MetadataResult) {
  setLocalDraft((prev) => ({
    ...prev,
    name: m.name,
    genres: dedupeCanonical([...prev.genres, ...m.genres], lookups.genres),
    platforms: dedupeCanonical([...prev.platforms, ...m.platforms], lookups.platforms),
    years: currentTab === 'c' && m.year ? [...new Set([...prev.years, m.year])] : prev.years,
    externalIds: { ...prev.externalIds, igdb: m.externalId }, // requiere extender GameDraft
    coverUrl: m.coverUrl ?? prev.coverUrl,
  }));
}
```
- **No rompe el flujo manual**: solo prerrellena; `runSave` (`:186`) valida igual.

## A5. Inserción en lote + cambios de modelo
**Modelo** (`game.ts`, aditivo): `externalIds`, `coverUrl`, `importedFrom` (ver sección D).
Extender también `GameDraft` (`useGameListViewModel.ts:28`) con `externalIds?`/`coverUrl?` y
propagarlos en `saveDraft` (`:330`).

**Inserción en lote en la BANDEJA** — `addGamesToStaging(games[])` (inspirado en el actual
`addGameToProximos` `:489`, pero escribe en `ImportInbox`, no en `p`):
```ts
addGamesToStaging(games: Partial<GameItem>[]): { added: number; duplicates: number; invalid: number }
```
Puntos críticos (el `addGameToProximos` actual no vale para lotes):
- **Calcular el `id` máximo UNA vez** y auto-incrementar (el actual lo recalcula por juego →
  colisión si se llama en bucle).
- **Un solo `persist(...)`** al final (no N escrituras → no N ciclos de guardado).
- **Dedupe y fusión** (pipeline C1): marcar `existsInLists` si ya está en c/v/e/p; idempotente
  por `externalIds[source]`; y si el mismo juego llega de otra tienda, **fusionar** (acumular
  `platforms`/`externalIds`/`sources` en el item existente) en vez de crear otra entrada.
- Reutilizar `normalizeTag` + `uniqueCaseInsensitive` (`:507-508`) y `normalizeName` para el match.

**Graduación** — `graduateFromStaging(importedId, targetTab)`: **siempre abre `FormModal`**
(pregunta 2) precargado con los metadatos del item; al guardar (`onSave`), elimina el item de
`imported` y crea el `GameItem` en `targetTab` con `_ts`/`listedAt`/`_v`. Reutiliza el flujo de
`saveDraft` (`:330`) para validar obligatorios (`c` exige `years`+`score`; todas `genres`+`platforms`).

**Purga (TTL)** — `purgeStaleImports(now)`: elimina de `imported` los items con
`now - importedAt > TTL` (por defecto 30 días) no clasificados. Ejecutar al arrancar la app y/o
al abrir la bandeja.

**Definición de hecho (Fase 0)**: `GameItem`/`GameDraft` con campos nuevos sin romper sync
(tests de compresión/merge); `ImportInbox` persistido **solo local**; `addGamesToStaging` (con
dedupe+fusión y un único persist), `graduateFromStaging` (vía formulario) y `purgeStaleImports`,
cubiertos por tests (Vitest). Buscador IGDB solo si se activa el enriquecimiento.

---

# Anexo B — Playnite (pilar 2: import multi-plataforma sin backend)

## Qué es y por qué es un pilar
[Playnite](https://playnite.link) es un gestor de bibliotecas open source (Windows) que, con
*plugins de librería*, **agrega en una base de datos local** los juegos de Steam, GOG, **Epic
(EGS)**, EA, Ubisoft, Battle.net, Amazon, itch.io, **Xbox** y **PlayStation** (estos dos vía
plugins de la comunidad). Playnite ya resolvió la parte difícil (autenticarse contra cada tienda)
**en la máquina del usuario**.

Ventajas frente a integrar cada API:
- **Sin backend, sin CORS, sin secretos**: la app solo lee un fichero local.
- **Multi-plataforma de una vez**: un import trae Steam+GOG+Xbox+PSN+EGS juntos.
- **Metadatos ya rellenos**: el export incluye `name`, `platform`, `source`, `genres`,
  `playtime`, fecha y estado → mapea directo a `GameItem` y **cumple la validación** sin IGDB.
- **Reutiliza infraestructura**: mismo mecanismo de *import de fichero* del backup
  (`SettingsHub.tsx:312-326`, `onImport`), con otro *mapper*.
- **Traslada el riesgo de no-oficialidad** a Playnite, que ya mantiene esos plugins.

Limitaciones (documentarlas en la UI):
- **Solo Windows** y requiere instalar Playnite + una extensión de export.
- **Nintendo** no queda cubierto de forma fiable.
- El **esquema del JSON depende de la extensión** → fijamos una y validamos defensivo. **Este
  esquema hay que confirmarlo e ir actualizándolo en el `.md` al implementar.**

## Flujo para el usuario
1. Instala Playnite y los plugins de sus tiendas (una vez).
2. Instala una extensión de export a JSON (p. ej. *Playnite Game Data Exporter* o *playnite-json*)
   y pulsa "Exportar".
3. En la app: **Importar → Playnite**, suelta/selecciona el `.json`.
4. Preview con selección (duplicados avisados) → confirmar → van a Próximos.

## Diseño
- **Mapper** `src/model/repository/import/playniteMapper.ts`:
  ```ts
  // Valida el JSON con zod (tolerante) y mapea a RawExternalGame[]/Partial<GameItem>.
  // name; platforms ← [platform] (normalizado, A3); genres ← genres[];
  // hours ← playtime(seg)→h; externalIds/importedFrom ← source (steam/gog/xbox/psn/egs);
  // años ← releaseDate (opcional).
  ```
- **Entrada**: reutilizar el `FileReader`/input del import de backup, enrutando el tipo "Playnite"
  al `playniteMapper` en vez del parser de backup.
- **Salida**: `addGamesToProximos(...)` (Anexo A5) → dedupe + un solo persist + resumen.
- **Robustez**: fijar y **documentar** la extensión soportada; `zod` descarta entradas inválidas
  sin abortar todo; siempre preview.

## Encaje temporal
Playnite **no depende del proxy ni de IGDB**, así que se entrega justo tras la Fase 0 (que aporta
`externalIds`/`importedFrom` y `addGamesToProximos`). Para "traer lo que ya tengo", **Steam
directo (Fase 1) + Playnite (Fase 2)** cubren el objetivo con la mínima superficie frágil; los
conectores directos de Xbox/PSN/GOG/EGS quedan como alternativa para quien no use Playnite.
