# Plan: importar bibliotecas de juegos (primera integración: Playnite)

> Objetivo: que el usuario pueda traer los juegos que ya tiene y rellenar los listados más
> fácilmente. Los juegos importados caen en una **Bandeja de importados** y desde ahí se
> clasifican a las listas actuales (c/v/e/p), donde ya funcionan como el resto.

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Al implementar, confirma
> los formatos/endpoints reales y **actualiza este `.md` en consecuencia** (marca lo confirmado,
> corrige lo que cambie, anota decisiones).

## Enfoque (TL;DR)

- **La primera integración es Playnite** — la más sencilla y la que más cubre con menos riesgo:
  es un gestor (Windows) que ya agrega Steam/GOG/Epic/Xbox/PSN **en local**; con una extensión de
  export a JSON, el usuario suelta un fichero y **reutilizamos el import de fichero que ya existe**
  (`SettingsHub.tsx:312`). **Sin backend, sin CORS, sin secretos, sin nada específico de cada tienda.**
- Esta primera entrega incluye **todo el cimiento común** (Bandeja + clasificación + UI) que
  reutilizarán las futuras integraciones, **pero nada por plataforma**.
- **Añadidos futuros** (fuera de esta primera entrega): el **enriquecimiento con IGDB** y las
  **integraciones directas con servicios** — Steam, Xbox, PlayStation, GOG, EGS. Ver sección
  *Añadidos futuros* y **Anexo C**.
- **Nintendo**: fuera de alcance (no hay API; en Playnite tampoco se importa de forma fiable).

> **Regla de la primera entrega:** cero backend, cero credenciales, cero código específico de
> Steam/Xbox/PSN/GOG/EGS. Si algo requiere una API key, un proxy o un login de tienda, es un añadido futuro.

## Decisiones tomadas (2026-07-15)

1. **Persistencia de la bandeja:** solo local (no sync). **Caducidad: 30 días** — los no
   clasificados se purgan.
2. **Al clasificar:** siempre abre el formulario (`FormModal`) precargado.
3. **Duplicados:** los que ya están en tus listas se muestran en **sección aparte** marcados;
   re-import del mismo origen es idempotente; el mismo juego desde **otra plataforma** → **fusión**
   (acumula plataformas), no un duplicado.
4. **Acceso a la bandeja:** entrada en el **menú** con contador, visible solo si hay elementos.
5. **Los campos de import NO van al gist.** `externalIds`/`coverUrl`/`sources` viven **solo en la
   bandeja** (`ImportedGame`, local). `GameItem` **no se modifica**: al clasificar, el juego pasa
   al gist como un `GameItem` estándar. *Consecuencia:* un juego ya clasificado no conserva
   carátula ni IDs externos en el gist.
6. **Primera integración = Playnite.** IGDB y las integraciones directas de tienda son añadidos futuros.

---

## Alcance: primera integración vs. añadidos futuros

| Vía | Cómo | Qué da el usuario | Backend/secretos | ¿Entrega? |
|---|---|---|---|---|
| **Playnite** (agregador) | Export a JSON (Steam/GOG/Epic/Xbox/PSN ya agregados en local) → import de fichero. | Un **fichero `.json`**. | **Ninguno** | **Primera** |
| Steam | `GetOwnedGames` (oficial). Perfil público. | SteamID64. | Proxy + `STEAM_API_KEY` | Futuro |
| Xbox | OpenXBL (tercero). | API key OpenXBL. | Proxy + secreto | Futuro |
| PlayStation | `psn-api` (tercero/reverse-engineered). | Token NPSSO. | Proxy + secreto | Futuro |
| GOG | `embed.gog.com` (no oficial). | Login GOG (OAuth). | Proxy + OAuth | Futuro |
| EGS (Epic) | GraphQL/OAuth del launcher (tercero). | Login Epic (OAuth). | Proxy + OAuth | Futuro |
| **IGDB** (metadatos) | Enriquece los imports directos que llegan pobres. | — | Proxy + Twitch OAuth | Futuro |
| Nintendo | No hay API; en Playnite tampoco se importa fiable. | — | — | Fuera de alcance |

> Nota de referencia (para los futuros): de las tiendas, **solo Steam es oficial**; el resto son
> APIs de terceros/no oficiales que pueden romperse. Playnite ya cubre esas tiendas trasladando
> ese mantenimiento a su propio proyecto (ver Anexo B).

---

## Arquitectura de la primera integración

Reutiliza el **import de fichero** de Ajustes (`SettingsHub.tsx:312`). **No introduce ningún
proxy ni Function nueva.** Piezas:

### A. Almacén de la Bandeja (local)
Estructura propia, **no** una 5ª pestaña de `TabData` (evita tocar `TAB_IDS`, sorting, filtros, sync):

```ts
type ImportSource = 'playnite' | 'steam' | 'xbox' | 'psn' | 'gog' | 'egs'; // hoy solo 'playnite'
type ExternalIds = { steam?: string; xbox?: string; psn?: string; gog?: string; egs?: string; igdb?: string };

interface ImportedGame {
  id: number;                 // local, propio de la bandeja
  name: string;
  platforms: string[];        // se ACUMULAN al fusionar (mismo juego en varias tiendas)
  genres: string[];           // Playnite ya los trae
  sources: ImportSource[];
  externalIds?: ExternalIds;  // para dedupe/fusión (local)
  coverUrl?: string;          // (futuro: IGDB) — Playnite no aporta URL cargable
  hours?: number | null;
  year?: number | null;
  existsInLists?: boolean;    // ya está en c/v/e/p → sección aparte
  importedAt: number;         // para la caducidad (TTL 30 días)
}
interface ImportInbox { imported: ImportedGame[]; updatedAt: number; }
```
**Persistencia: SOLO LOCAL** (object store IndexedDB dedicado). `GameItem` **no cambia** (los
campos de import no van al gist). **TTL = 30 días**: los no clasificados se purgan.

### B. Interfaz de conectores (extensible)
`src/model/repository/import/` con una interfaz común pensada para el futuro, hoy con una sola
implementación (Playnite):

```ts
interface RawExternalGame {
  externalId: string; name: string; source: ImportSource;
  genres?: string[]; platforms?: string[]; hours?: number | null; year?: number | null;
}
interface LibraryConnector {
  id: ImportSource;
  label: string;
  needsProxy: boolean;                 // Playnite = false
  fetchLibrary(input: unknown): Promise<RawExternalGame[]>; // Playnite: recibe el fichero
}
```

### C. Pipeline
`fetchLibrary(fichero) → dedupe/fusión → preview → insertar en la BANDEJA`.
(El paso de enriquecimiento IGDB **no aplica** a Playnite; queda para los futuros que llegan sin
género/plataforma.)

1. **Dedupe y fusión** (tres casos):
   - **Ya en tus listas** (por nombre normalizado `hasGameInLists:479` o `externalIds`) → entra
     marcado `existsInLists`, en sección aparte.
   - **Re-import mismo juego + mismo origen** (`externalIds[source]`) → idempotente, no duplica.
   - **Mismo juego, otra plataforma** → **fusión** (añade la plataforma y el `externalIds[source]`),
     sin crear otra entrada.
2. **Preview con selección** (checkboxes, avisos de duplicado).
3. **Inserción en lote en la bandeja**: `addGamesToStaging` (Anexo A).

### D. Normalización de tags (sin IGDB)
`src/core/utils/metadataNormalize.ts` — mapea las plataformas/géneros de **Playnite** a los tags
libres de la app, con tablas y **fallback al nombre crudo**; luego `getCanonicalTag`
(`FormModal.tsx:70`) para respetar la capitalización previa del usuario. (Las mismas tablas se
ampliarán para IGDB cuando llegue.)

### E. UI
Detallada en *Parte visual / UX*: botón **"Integraciones"** en Ajustes → pantalla de Integraciones
(de momento **solo la tarjeta de Playnite**) → **Bandeja** → clasificar a c/v/e/p.

---

## Parte visual / UX (pantallas y flujos)

Dos pantallas nuevas, un acceso persistente y el almacén Bandeja (sección A). Rutas con
`react-router-dom@7` (ya en uso).

```
Ajustes ──[botón "Integraciones"]──▶ Pantalla Integraciones (tarjeta Playnite: soltar .json)
                                          │  (import + dedupe/fusión)
                                          ▼
                                   BANDEJA de importados  ◀── se guarda en el equipo (30 días)
                                          ▲
        [acceso persistente: entrada de menú con contador, solo si hay elementos]
                                          │
                                          ▼
                              Pantalla de la Bandeja
                                          │  clasificar cada juego → abre formulario → c/v/e/p
                                          ▼
                    el juego SALE de la bandeja y entra en la lista (sync, editar, mover…)
```

1. **Ajustes → botón "Integraciones"** (junto al import/export de backup, `SettingsHub.tsx:312-326`).
2. **Pantalla "Integraciones"** — una tarjeta por vía; hoy **solo Playnite** (input de fichero
   `.json` + botón Importar). Las tarjetas de Steam/Xbox/PSN/GOG/EGS se añadirán con cada futuro.
3. **Bandeja** — almacén `ImportInbox` local; caducidad 30 días. Dos secciones: **"Nuevos"** y
   **"Ya en tus listas"** (los `existsInLists`). Renderizable con `@tanstack/react-virtual`.
4. **Acceso persistente** — **entrada de menú con contador**, visible solo si `imported.length > 0`;
   desaparece al vaciarse. Extender `AppSection` (`BottomNavigation.tsx:6`).
5. **Clasificar** — **siempre abre `FormModal`** precargado; al guardar, el item sale de la bandeja
   y entra en la lista como `GameItem` normal. Acciones por item: Clasificar / Editar / Descartar.

---

## Prerrequisitos (pre-flight)

### Para la PRIMERA integración (Playnite) — mínimos, sin cuentas ni backend
- [ ] **IndexedDB**: object store dedicado para la bandeja ⇒ bump `DB_VERSION`
      (`idbConnectionRepository.ts:2`) + crear el store en `onupgradeneeded`; y bump
      `LOCAL_SCHEMA_VERSION` (`storageKeys.ts:5`).
- [ ] **Routing**: añadir `/integraciones` y `/bandeja` a `APP_ROUTE_PATHS` (`App.tsx:57`; hay
      test de regresión de rutas) y extender `AppSection` (`BottomNavigation.tsx:6`).
- [ ] **JSON de muestra de Playnite**: elegir **la** extensión de export soportada y capturar un
      **export real** — sin él no se puede escribir/validar el `playniteMapper`. Fijar y documentar aquí su esquema.
- **No hace falta**: ni CSP (Playnite no carga carátulas remotas), ni Cloudflare Functions, ni
  Steam API key, ni Twitch/IGDB, ni ningún secreto.

### Para AÑADIDOS FUTUROS (cuando toque cada uno)
- Acceso a **Cloudflare Pages** + `.dev.vars` para env vars (patrón `functions/api/github-oauth.ts`).
- **Steam**: `STEAM_API_KEY`. **IGDB**: app de **Twitch** (`TWITCH_CLIENT_ID`/`SECRET`) + añadir
  `https://images.igdb.com` a `img-src` en `public/_headers`. **Xbox/PSN/GOG/EGS**: OpenXBL key /
  NPSSO / apps OAuth.

### Verificado que NO bloquea (para todas las vías)
- **`GameItem`/gist:** al no llevar los campos de import al gist, **no** se toca `leanGameItem`
  (`socialProjection.ts:119-146`) ni la serialización. **Merge CRDT** (`syncRepository.ts`, por
  item completo) y **lectura del gist** (genérica, `legacyGamesFormat.ts:71`) intactos. **Zod**
  solo valida el gist social.

---

## Plan de entrega

> Recordatorio: al abordar cada punto, confirmar la realidad y **actualizar este documento**.

### Entrega 1 — Primera integración (Playnite)

**Cimiento común** (lo reutilizarán los futuros):
- [ ] Almacén `ImportInbox`/`ImportedGame` (sección A), **solo local**, store IndexedDB dedicado + TTL.
- [ ] `addGamesToStaging(items[])` — dedupe+fusión (marcar `existsInLists`, idempotente por
      `externalIds[source]`, fusionar plataformas si difiere el origen), **un solo persist**, id
      máx calculado una vez (Anexo A).
- [ ] `graduateFromStaging(importedId, targetTab)` — **abre `FormModal`**; al guardar, saca de la
      bandeja y crea el `GameItem` en la lista destino.
- [ ] `purgeStaleImports(now)` — purga los no clasificados pasados 30 días.
- [ ] Interfaz `LibraryConnector` + carpeta `src/model/repository/import/`.
- [ ] Normalización de tags `metadataNormalize.ts` (tablas Playnite + `getCanonicalTag`).
- [ ] **UI**: ruta+botón "Integraciones" en Ajustes, pantalla Integraciones (solo Playnite),
      pantalla de la Bandeja (secciones "Nuevos"/"Ya en tus listas") y entrada de menú con contador.

**Conector Playnite**:
- [ ] Fijar y documentar el esquema JSON de la extensión de export elegida (Anexo B).
- [ ] `playniteMapper` (zod tolerante) → `RawExternalGame[]` → `addGamesToStaging`.
- [ ] Enrutar el input de fichero de `SettingsHub` al `playniteMapper` (junto al import de backup).
- [ ] Tests (Vitest): mapper, dedupe+fusión, graduación vía formulario, purga TTL.

### Añadidos futuros (cada uno, cuando se decida)
- [ ] **IGDB** (enriquecimiento): `functions/api/metadata.ts` + `metadataRepository.ts` + ampliar
      `metadataNormalize.ts` + `img-src`. Habilita género/plataforma/carátula en los imports directos. (Anexo C)
- [ ] **Steam**: `functions/api/steam.ts` (`GetOwnedGames`) + `steamConnector` + tarjeta UI.
- [ ] **Xbox** (OpenXBL) y **PlayStation** (NPSSO): proxy + conector + credencial cifrada por usuario.
- [ ] **GOG** y **EGS**: proxy + OAuth no oficial. Reconfirmar que los endpoints siguen vivos.
- [ ] **Nintendo**: fuera de alcance; solo alta manual.

---

## Riesgos y notas

- **Playnite es solo Windows** y requiere que el usuario instale Playnite + una extensión de export.
- **Esquema del export**: depende de la extensión → fijamos una, validamos con `zod` (tolerante) y
  documentamos su formato aquí; hay que confirmarlo al implementar.
- **Consolas vía Playnite**: PS4/PS5 y Xbox **sí** se importan (Xbox con importer bien soportado;
  PSN con plugin de comunidad `playnite-library-psn`); **Nintendo no** de forma fiable (ver Anexo B).
- **Futuros no oficiales**: Steam es la única API oficial; Xbox/PSN/GOG/EGS son de terceros y pueden
  romperse (por eso Playnite va primero).

## Puntos de anclaje en el código

- Modelo del juego: `src/model/types/game.ts:4` (`GameItem`), `TabData` `:35`.
- Listas/transiciones: `src/core/constants/labels.ts:11`, `:41` (`TAB_ACTIONS`).
- Alta/mover/insertar: `useGameListViewModel.ts` → `GameDraft:28`, `saveDraft:330`,
  `moveGameToTab:451`, `addGameToProximos:489`, dedupe `hasGameInLists:479`.
- Alta manual (UI): `FormModal.tsx` (borrador local `:92`, `getCanonicalTag:70`, `runSave:186`),
  import de backup `SettingsHub.tsx:312`.
- Persistencia local/IDB: `storageKeys.ts:5` (`LOCAL_SCHEMA_VERSION`), `idbConnectionRepository.ts:2`
  (`DB_VERSION`), `localRepository.ts`, `indexedDbRepository.ts`.
- Routing: `App.tsx:57` (`APP_ROUTE_PATHS`), `BottomNavigation.tsx:6` (`AppSection`).
- Sync/gist (no se toca): `gistRepository.ts`, `syncRepository.ts`, `socialProjection.ts:119`
  (`leanGameItem`). Proxy de referencia (futuros): `functions/api/github-oauth.ts`, `wrangler.toml`.

## Fuentes
- Playnite (export/plugins): <https://playnite.link/addons.html>, <https://github.com/NicodeSS/playnite-game-data-exporter>, <https://github.com/zachvlat/playnite-json>, <https://github.com/XenorPLxx/playnite-library-psn>, <https://github.com/JosefNemec/PlayniteExtensions/issues/64>
- Steam: <https://developer.valvesoftware.com/wiki/Steam_Web_API>
- GOG: <https://gogapidocs.readthedocs.io/en/latest/>
- PlayStation: <https://github.com/achievements-app/psn-api>
- Xbox (OpenXBL): <https://xbl.io/>
- EGS (no oficial): <https://github.com/derrod/legendary>
- Nintendo (no oficial): <https://github.com/samuelthomas2774/nxapi>
- Metadatos IGDB/RAWG: <https://api-docs.igdb.com/>, <https://api.rawg.io/docs/>

---

# Anexo A — Diseño técnico del cimiento (primera integración)

Base que reutilizarán también los añadidos futuros. Sin IGDB ni proxies.

## Almacén y persistencia
`ImportInbox`/`ImportedGame` (sección A) en un **object store IndexedDB dedicado** (bump de
`DB_VERSION` en `idbConnectionRepository.ts:2` + creación en `onupgradeneeded`; bump de
`LOCAL_SCHEMA_VERSION`). **No** sincroniza. `GameItem` no se modifica.

## `addGamesToStaging(games[])`
Inspirado en el actual `addGameToProximos` (`:489`) pero escribe en `ImportInbox`:
```ts
addGamesToStaging(games: RawExternalGame[]): { added: number; merged: number; duplicates: number; invalid: number }
```
- **Id máximo UNA vez** y auto-incrementar (el actual lo recalcula por juego → colisión en bucle).
- **Un solo `persist(...)`** al final.
- **Dedupe/fusión** (pipeline C1): `existsInLists` si ya está en c/v/e/p; idempotente por
  `externalIds[source]`; fusión de `platforms`/`externalIds`/`sources` si el mismo juego llega de
  otra tienda. Match con `normalizeName` + `normalizeTag`/`uniqueCaseInsensitive` (`:507-508`).

## `graduateFromStaging(importedId, targetTab)`
**Siempre abre `FormModal`** precargado (`ImportedGame` → `GameDraft`); al guardar (`onSave`),
elimina el item de `imported` y crea el `GameItem` en `targetTab` con `_ts`/`listedAt`/`_v`,
reutilizando el flujo de `saveDraft` (`:330`) para validar obligatorios (`c` exige `years`+`score`;
todas `genres`+`platforms`). No hace falta modificar `FormModal` (se abre en modo "nuevo" con valores precargados).

## `purgeStaleImports(now)`
Elimina de `imported` los items con `now - importedAt > 30 días` no clasificados. Ejecutar al
arrancar la app y/o al abrir la bandeja.

## Normalización de tags — `metadataNormalize.ts`
Tablas `PLATFORM_MAP`/`GENRE_MAP` (empezando por la taxonomía de Playnite, p. ej.
`'Sony PlayStation 5' → 'PS5'`, `'PC (Windows)' → 'PC'`) con **fallback al nombre crudo**; después
`getCanonicalTag` contra los `lookups` existentes. Ampliable a IGDB en el futuro.

**Definición de hecho (Entrega 1)**: `ImportInbox` local persistido con TTL; `addGamesToStaging`
(dedupe+fusión, un persist), `graduateFromStaging` (vía formulario) y `purgeStaleImports`, más el
`playniteMapper`, cubiertos por tests (Vitest); UI navegable (Integraciones + Bandeja + menú).

---

# Anexo B — Playnite (la primera integración)

## Qué es y cobertura
[Playnite](https://playnite.link) (Windows, open source) agrega en local, vía *plugins de
librería*, los juegos de Steam, GOG, **Epic**, EA, Ubisoft, Battle.net, Amazon, itch.io, **Xbox**
y **PlayStation**. Ya resolvió autenticarse contra cada tienda **en la máquina del usuario**;
nosotros solo leemos su export.

Cobertura de **consolas** (confirmada 2026-07):
- **Xbox** (incl. juegos de consola y Game Pass de tu cuenta MS): ✅ importer bien soportado.
- **PlayStation PS4/PS5**: ✅ vía plugin de comunidad `playnite-library-psn` (login PSN; no nativo,
  puede romperse).
- **Nintendo Switch**: ⚠️ **no** hay import automático de lo que posees (solo entradas manuales /
  metadatos / *playtime* con firmware Atmosphere). Queda como alta manual.

Ventajas frente a integrar cada API: sin backend, sin CORS, sin secretos; multi-plataforma de una
vez; **metadatos ya rellenos** (nombre/plataforma/source/géneros/playtime) → cumplen la validación
sin IGDB; reutiliza el import de fichero existente; y el riesgo de no-oficialidad lo mantiene Playnite.

## Flujo
1. El usuario instala Playnite + los plugins de sus tiendas (una vez).
2. Instala una extensión de export a JSON (p. ej. *Playnite Game Data Exporter* o *playnite-json*)
   y exporta.
3. En la app: **Integraciones → Playnite**, suelta/selecciona el `.json`.
4. Preview (duplicados avisados) → confirmar → van a la Bandeja → clasificar.

## Diseño
- `src/model/repository/import/playniteMapper.ts`: valida el JSON con `zod` (tolerante) y mapea a
  `RawExternalGame[]` — `name`; `platforms ← [platform]` (normalizado); `genres ← genres[]`;
  `hours ← playtime(seg)→h`; `externalIds`/`sources ← source (steam/gog/xbox/psn/egs)`;
  `year ← releaseDate` (opcional). Entradas inválidas se descartan sin abortar todo.
- Reutiliza el `FileReader`/input del import de backup (`SettingsHub`), enrutando el tipo
  "Playnite" al `playniteMapper` en vez del parser de backup.
- Salida a `addGamesToStaging(...)` → dedupe/fusión + un solo persist + resumen.
- **Fijar y documentar aquí** la extensión de export soportada y su esquema (prerrequisito).

---

# Anexo C — Añadidos futuros (diseño técnico)

Se apoyan en el mismo cimiento (Anexo A). Cada uno añade lo suyo. **Nada de esto entra en la
primera entrega.**

## C1. IGDB (enriquecimiento) — `functions/api/metadata.ts`
Function Cloudflare Pages análoga a `github-oauth.ts`. Sirve same-origin (sin CORS en cliente).
- **Contrato** *(provisional)*: `GET /api/metadata?q=<texto>&limit=8` (y `?ids=`) →
  `{ results: { externalId, name, genres[], platforms[], year, coverUrl }[] }`.
- **Auth**: token de app de Twitch (`client_credentials`, cacheado ~60 días) → consultas
  *apicalypse* a `https://api.igdb.com/v4/games`. Env: `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`.
- **Cliente** `metadataRepository.ts`: `searchGameMetadata(q, signal)` con debounce + `AbortController`.
- **Uso**: paso condicional del pipeline **solo para imports directos** (llegan sin género/plataforma);
  amplía `metadataNormalize.ts`. Requiere `https://images.igdb.com` en `img-src` (`public/_headers`)
  para las carátulas. Opcional: buscador con autocompletado en `FormModal` (alta manual asistida).

## C2. Steam — `functions/api/steam.ts`
Proxy a `IPlayerService/GetOwnedGames` (`STEAM_API_KEY` server-side). `steamConnector`: SteamID64 /
vanity URL → `[{ appid, name, playtime }]`. Género vía IGDB (C1) o `appdetails`. Perfil público.

## C3. Xbox (OpenXBL) y PlayStation (NPSSO)
`functions/api/xbox.ts` (API key personal del usuario) y `functions/api/psn.ts` (intercambio
NPSSO→token). Credenciales cifradas en cliente (`core/security/crypto.ts`). Enriquecer con IGDB.

## C4. GOG y EGS
`functions/api/gog.ts` (OAuth no oficial → `embed.gog.com/user/data/games`) y `functions/api/egs.ts`
(OAuth de Epic, estilo legendary/Heroic). Antes de implementar, reconfirmar endpoints; si Playnite
ya cubre bien el caso, valorar no hacer el conector directo.
