# myGameList - React MVVM

Aplicacion web para gestionar listas de videojuegos con sincronizacion en GitHub Gist, arquitectura MVVM y enfoque offline-first.

## Estado actual

Migrada de JavaScript vanilla a React 19 + TypeScript manteniendo:
- Estilo visual y comportamiento funcional principal.
- Estructura de datos compatible con storage legacy.
- Sincronizacion CRDT para evitar perdida de datos.
- Diseno responsive mobile-first.

## Stack

- React 19
- TypeScript
- React Router
- Vite 8
- Vitest
- ESLint

## Arquitectura MVVM

Estructura principal:

- src/model
  - types: contratos de datos (GameItem, TabData, SyncConfig)
  - repository: acceso a datos local, migracion legacy, sync CRDT y Gist
- src/viewmodel
  - useGameListViewModel: estado de listas, filtros, ordenacion, CRUD, modales
  - useSyncViewModel: conexion/sincronizacion GitHub Gist
- src/view
  - components: iconos y piezas visuales reutilizables
  - hooks: utilidades de UI (debounce)
- src/core
  - constants: labels, rutas, breakpoints y claves de almacenamiento
  - security: sanitizacion y validaciones defensivas
  - utils: comparadores y helpers puros

## Scripts

- npm run dev: servidor local en puerto 8000
- npm run build: compilacion de produccion
- npm run preview: preview de build
- npm run test: pruebas unitarias
- npm run validate: validacion CI + HTML + ESLint
- npm run lint: autocorrecciones lint

## Seguridad

Medidas aplicadas:

- Sanitizacion y normalizacion centralizada en src/core/security/sanitize.ts.
- Validacion de formatos para token GitHub y Gist ID.
- Renderizado React sin inyeccion HTML insegura.
- Cabeceras de seguridad en public/_headers (CSP, X-Frame-Options, etc.).
- Sincronizacion robusta con merge CRDT para minimizar conflictos y perdida de informacion.

Nota: el token de GitHub se guarda en localStorage para permitir sincronizacion persistente, por lo que se recomienda usar dispositivo de confianza y HTTPS.

## Compatibilidad de datos

La app mantiene migracion de formatos antiguos mediante:
- src/model/repository/migrateRepository.ts
- src/model/repository/localRepository.ts

Esto permite cargar y normalizar datos legacy sin romper el historico existente.

## Testing

Pruebas incluidas:
- tests/unit/syncRepository.test.ts
- tests/unit/sanitize.test.ts

Se ejecutan con Vitest en entorno jsdom.

## Despliegue

La configuracion esta preparada para despliegue estatico con:
- index.html en raiz (entrada Vite)
- assets publicos en public/
- fallback SPA configurado en public/_routes.json
