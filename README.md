# myGameList

Aplicación web para gestionar listas de videojuegos con sincronización en GitHub Gist,
arquitectura MVVM y enfoque offline-first. Migrada de JavaScript vanilla a **React 19 + TypeScript**
conservando el estilo visual, el comportamiento y la compatibilidad con los datos previos.

## Características

- **Listas de juegos** con pestañas (completados, "vergüenza", en curso, próximos), filtros,
  ordenación por columnas y búsqueda.
- **Puntuación** en estrellas (0–5) con escala opcional **0–100**, elegible en Ajustes.
- **Sincronización CRDT** con GitHub Gist para minimizar pérdida de datos en conflictos, con
  merge por marcas de tiempo y tombstones. Compresión gzip del gist (gated).
- **Social**: perfiles, sistema de amistades y feed de reseñas (canal separado en Gist +
  Firebase Firestore/Auth).
- **Tema claro / oscuro / automático** con paleta clara "arena" (tonos cálidos) y azul de marca;
  todos los colores son variables CSS theme-aware (`src/styles/_base.scss`).
- **Offline-first / PWA**: Service Worker + `manifest.json`. El build inyecta en el Service Worker los
  chunks del arranque, así que la app arranca y las listas funcionan sin red; las pantallas perezosas
  (social, panel, temas) quedan disponibles offline tras visitarlas una vez.
- **Responsive** mobile-first (breakpoints en 1100 px y 1400 px).

## Stack

Dependencias principales (versiones declaradas en `package.json`):

- `react` / `react-dom` 19.3.0 (fijadas, sin `^`: el par tiene que ir siempre a la misma versión)
- `react-router-dom` ^7.9.5
- `@tanstack/react-virtual` ^3.13.24 (virtualización de listas)
- `firebase` ^12.13.0 (Analytics, Firestore, Authentication)
- `zod` ^4.4.3 (validación de esquemas)

Tooling: `vite` ^8.0.11, `@vitejs/plugin-react` ^6.0.1, `typescript` ^6.0.3, `vitest` ^5.0.0,
`eslint` ^9.39.4, `sass` ^1.99.0.

Node.js **≥ 22.16.0** (`engines` en `package.json`).

## Arquitectura MVVM

```
src/
  model/
    types/        contratos de datos (GameItem y relacionados)
    repository/   acceso a datos local, migración legacy, sync CRDT, Gist y Firebase
    schemas/      esquemas Zod (p. ej. gist social)
  viewmodel/      hooks de estado: listas, filtros, CRUD, sync, social
  view/
    components/   piezas visuales reutilizables e iconos
    hooks/        utilidades de UI (tema, preferencias) y los hooks de SESIÓN (ver nota)
    modals/       formularios y acciones de administración/sync
  core/
    constants/    labels, iconos, storage keys, configuración UI
    security/     sanitización, criptografía del token, validaciones defensivas
    utils/        comparadores y helpers puros
  styles/         SCSS: tokens de tema en _base.scss, resto por área
```

**Dónde la práctica se separa del esquema, y por qué conviene saberlo.** Las flechas de arriba describen la
intención, no una regla que nadie compruebe. Medido sobre el código (18-09-2026): de los 26 ficheros de `view/`
que importan un repositorio, **17 importan uno que habla con la red** (`firebaseGateway`, `firebaseRepository`,
`firebaseAdminRepository`, `socialGistRepository`, `publicShareRepository`, `shareAdminRepository`,
`coverStatsRepository`, `coverQuotaRepository`) en vez de pasar por un view-model. No es descuido repartido: son dos grupos con forma propia.

- `view/hooks/use*Session` (`useScoreScaleSession`, `useAppearanceSession`, `useSocialProfileSession`,
  `useLegacyProfileHeal`…) son view-models de sesión en todo menos en el nombre: no pintan nada, enlazan la
  sesión de Google con una preferencia y la hidratan. Su sitio natural sería `viewmodel/`, y moverlos es mudar
  ficheros, no reescribir lógica.
- Las pantallas que hablan con su repositorio directamente (`AdminHub`, `AccountHub`, `DangerZone`,
  `PublicReviewScreen`…) sí son la desviación de verdad, y ordenarlas es un refactor amplio sin red de pruebas
  de interfaz que lo respalde.

Se intentó fijar la separación con una regla de ESLint y la medición la tumbó: prohibirlo alcanzaba a casi todo
el directorio, lo que no significa que el código esté mal, sino que **la regla describía otra arquitectura**. La
única frontera que sí está cerrada por herramienta es la de `core`, que no puede depender de repositorios
(`eslint.config.cjs`). El resto queda escrito aquí, que es mejor que un esquema que promete lo que no se cumple.

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor local Vite (puerto 8000) |
| `npm run build` | Compilación de producción |
| `npm run preview` | Preview del build |
| `npm run test` | Pruebas unitarias/componente de `src` y `tests/unit` |
| `npm run test:all` | Suite completa |
| `npm run test:watch` | Vitest en modo watch |
| `npm run test:coverage` | Cobertura |
| `npm run test:rules` | Tests de reglas de Firestore (emulador; necesita un JDK 21 o superior) |
| `npm run test:e2e` | Smoke end-to-end (Playwright) contra el build de producción |
| `npm run typecheck` | Tipos de los DOS proyectos: `src`/`tests` y `functions` (`tsconfig.functions.json`) |
| `npm run validate` | Validación CI + HTML + ESLint |
| `npm run lint` | Autocorrecciones ESLint |
| `npm run audit:privacy` | Auditoría de privacidad |
| `npm run audit:rules` | Auditoría (solo lectura) de los datos de producción contra `firestore.rules` |

## Configuración de Firebase

La app integra Firebase Analytics, Cloud Firestore y Authentication
(`src/model/repository/firebaseRepository.ts`). Variables de entorno (Vite), a partir de `.env.example`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (opcional; habilita Analytics)
- `VITE_ENABLE_ANALYTICS` (opcional; en producción `true` por defecto)

Pasos: crear proyecto en Firebase Console → habilitar Authentication → crear Firestore en modo
bloqueado con reglas seguras (`firestore.rules`) → copiar la config web a `.env` → `npm run dev`.

## Seguridad

- Sanitización y normalización centralizada (`src/core/security/`).
- **Token de GitHub cifrado en reposo** en localStorage (AES-GCM con clave de dispositivo no
  exportable en IndexedDB).
- Validación de formatos de token y Gist ID; renderizado React sin inyección HTML insegura.
- **CSP** y cabeceras de seguridad en `public/_headers`.
- Reglas de Firestore *owner-only* para la configuración privada.

Detalles y modelo de amenazas en [`SECURITY.md`](SECURITY.md). El token se guarda para permitir
sincronización persistente: úsalo en dispositivo de confianza y sobre HTTPS.

## Datos y compatibilidad

Los formatos antiguos se migran y normalizan al cargar
(`src/model/repository/migrateRepository.ts`, `localRepository.ts`), sin romper el histórico.

## Testing

Suite con Vitest (jsdom cuando se requiere): `tests/unit`, `tests/component`, `tests/integration`,
`tests/e2e`, además de tests colocados en `src`. Al cierre de la revisión de septiembre de 2026: **2266 casos**
(2 saltados por bandera de despliegue) en 195 ficheros, con **79,4 % de líneas y 70,3 % de ramas** cubiertas.
Los huecos y los puntos frágiles conocidos están inventariados en
[`docs/revision-general-2026-09.md`](docs/revision-general-2026-09.md).

## Despliegue (Cloudflare Pages)

App estática pura (React + Vite). Configuración en el repo:

- **`public/_headers`** — CSP para GitHub API + Firebase; `index.html` sin cache;
  `/assets/*` con cache inmutable (assets con hash); `service-worker.js` con revalidación.
- **`public/_redirects`** — `/* /index.html 200` (fallback SPA para React Router).
- **`public/service-worker.js`** — solo cachea GET same-origin y respuestas válidas; excluye APIs
  externas (GitHub/Firebase) para no cachear datos sensibles. Los marcadores
  `self.__SW_BUILD_ID__` / `self.__PRECACHE_ASSETS__` los sustituye en el build el plugin
  `serviceWorkerPrecache` (`vite.config.ts`) por el identificador de build y la lista de chunks del
  arranque; sin ellos la app no arrancaría sin red, y tanto el build como `npm run validate` fallan.
- **`public/fonts/`** — tipografías propias (generadas por `scripts/vendor-fonts.mjs`, todas OFL). No se usa
  Google Fonts: la CSP ya no lo permite. Para actualizar una familia, se re-ejecuta el script y se commitea el
  resultado; si cambia el nombre de la fuente base, hay que actualizar el `preload` de `index.html`
  (`npm run validate` avisa).
- **`wrangler.toml`** — `pages_build_output_dir = ./dist`.

Ajustes en el dashboard de Cloudflare Pages:

- **Framework preset**: React (Vite) · **Build command**: `npm run build` · **Output**: `dist`
- **Node.js** ≥ 22.16.0 (detectado de `engines`, sin `.nvmrc`)
- Variables `VITE_FIREBASE_*` en Production y Preview · Auto-deploy activado

### Antes de desplegar

1. **Subir la versión** en `package.json` y cerrar la sección `[Unreleased]` del CHANGELOG. El build hornea esa
   versión en `__APP_VERSION__` y con ella se etiqueta toda la telemetría: si no se sube, los errores del
   despliegue nuevo se atribuyen al anterior.
2. **`npm run audit:rules`** contra producción (necesita `firebase-admin` y credenciales; ver la cabecera del
   script). Solo lee. Busca perfiles o amistades reales que la validación de contenido de las reglas rechazaría:
   si hay alguno, desplegar las reglas dejaría a su dueño sin poder guardar su perfil, y sin ver ningún error.
3. **Desplegar reglas e índices de Firestore**, que Cloudflare Pages no toca:
   `firebase deploy --only firestore:rules,firestore:indexes`. El despliegue de índices **borra** los que ya no
   están en `firestore.indexes.json` y pedirá confirmación.
4. `npm run validate && npm test && npm run test:rules && npm run test:e2e` en verde.

### Checklist post-deploy

- Recargar una ruta interna (`/social`, `/ajustes`) sin 404.
- `/assets/*` y `/fonts/*` con cache inmutable en Network; sin bloqueos CSP en Console.
- **Arranca sin red**: cargar, cortar la conexión y recargar — la app debe pintar las listas (no un rectángulo
  en blanco). Ojo: en `localhost` el service worker se desregistra a propósito; hay que probarlo en el dominio
  desplegado o con `preview` sobre `127.0.0.1`.
- **La primera apertura no pide actualizar.** Abrir el dominio recién desplegado en una pestaña nueva: no debe
  salir el aviso de versión nueva. Ese documento ya ES la versión recién publicada (el HTML va con `no-store`),
  aunque durante unos segundos lo sirva todavía el service worker anterior. Lo distingue el identificador de
  build que comparten `<meta name="app-build">` y `service-worker.js`; si vuelve a salir, lo primero que hay que
  mirar es si el plugin `service-worker-precache` los ha dejado con el mismo valor.
- **Tipografías del propio origen**: ninguna petición a `fonts.googleapis.com` ni `fonts.gstatic.com`, ni con la
  paleta por defecto ni activando un tema.
- Login social y lectura/escritura de Gist OK.

## Documentación

| Documento | Qué contiene |
|---|---|
| [`DESIGN.md`](DESIGN.md) | Fuente de verdad del sistema visual: las cuatro capas, los tokens y los ocho temas |
| [`SECURITY.md`](SECURITY.md) | Modelo de seguridad tal y como está implementado, y cómo reportar una vulnerabilidad |
| [`CHANGELOG.md`](CHANGELOG.md) | Historial por versiones |
| [`docs/revision-general-2026-09.md`](docs/revision-general-2026-09.md) | Auditoría transversal (seguridad, rendimiento, escalabilidad, modularidad) con medidas y plan por fases |
| [`docs/plan-escalabilidad-firestore.md`](docs/plan-escalabilidad-firestore.md) | Coste del grafo de amistad y las fases ya implementadas |
| [`docs/temas.md`](docs/temas.md) · [`docs/logros/`](docs/logros/) | Cómo se añade un tema y cómo se dibuja una medalla |
| `docs/plan-*.md` | Un plan por línea de trabajo (logros, carátulas, importación, compartir reseñas…) |

Los `docs/plan-*.md` y la revisión son **documentos vivos**: describen intención y estado medido en una fecha,
no un contrato. Si una línea no coincide con el código, manda el código — y conviene corregir el documento en la
misma pasada.

## Licencia

Este proyecto se distribuye bajo la **GNU General Public License v3.0 o posterior** (GPL-3.0-or-later).
Consulta el archivo [`LICENSE`](LICENSE) para el texto completo.
