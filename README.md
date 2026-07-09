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
- **Social**: perfiles, sistema de amistades, feed de reseñas y favoritos (canal separado en Gist +
  Firebase Firestore/Auth).
- **Tema claro / oscuro / automático** con paleta clara "arena" (tonos cálidos) y azul de marca;
  todos los colores son variables CSS theme-aware (`src/styles/_base.scss`).
- **Offline-first / PWA**: Service Worker + `manifest.json`.
- **Responsive** mobile-first (breakpoints en 1100 px y 1400 px).

## Stack

Dependencias principales (versiones declaradas en `package.json`):

- `react` / `react-dom` ^19.2.0
- `react-router-dom` ^7.9.5
- `@tanstack/react-virtual` ^3.13.24 (virtualización de listas)
- `firebase` ^12.13.0 (Analytics, Firestore, Authentication)
- `zod` ^4.4.3 (validación de esquemas)

Tooling: `vite` ^8.0.11, `@vitejs/plugin-react` ^6.0.1, `typescript` ^6.0.3, `vitest` ^4.1.5,
`eslint` ^9.39.4, `sass` ^1.99.0.

Node.js **≥ 20** (`engines` en `package.json`).

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
    hooks/        utilidades de UI (debounce, tema…)
    modals/       formularios y acciones de administración/sync
  core/
    constants/    labels, iconos, storage keys, configuración UI
    security/     sanitización, criptografía del token, validaciones defensivas
    utils/        comparadores y helpers puros
  styles/         SCSS: tokens de tema en _base.scss, resto por área
```

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
| `npm run test:rules` | Tests de reglas de Firestore (emulador) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate` | Validación CI + HTML + ESLint |
| `npm run lint` | Autocorrecciones ESLint |
| `npm run audit:privacy` | Auditoría de privacidad |

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
`tests/e2e`, además de tests colocados en `src`.

## Despliegue (Cloudflare Pages)

App estática pura (React + Vite). Configuración en el repo:

- **`public/_headers`** — CSP para GitHub API + Firebase; `index.html` sin cache;
  `/assets/*` con cache inmutable (assets con hash); `service-worker.js` con revalidación.
- **`public/_redirects`** — `/* /index.html 200` (fallback SPA para React Router).
- **`public/service-worker.js`** — solo cachea GET same-origin y respuestas válidas; excluye APIs
  externas (GitHub/Firebase) para no cachear datos sensibles.
- **`wrangler.toml`** — `pages_build_output_dir = ./dist`.

Ajustes en el dashboard de Cloudflare Pages:

- **Framework preset**: React (Vite) · **Build command**: `npm run build` · **Output**: `dist`
- **Node.js** ≥ 20 (detectado de `engines`, sin `.nvmrc`)
- Variables `VITE_FIREBASE_*` en Production y Preview · Auto-deploy activado

Checklist post-deploy: recargar una ruta interna (`/social`, `/ajustes`) sin 404; `/assets/*` con
cache inmutable en Network; sin bloqueos CSP en Console; login social y lectura/escritura de Gist OK.

## Licencia

Este proyecto se distribuye bajo la **GNU General Public License v3.0 o posterior** (GPL-3.0-or-later).
Consulta el archivo [`LICENSE`](LICENSE) para el texto completo.
