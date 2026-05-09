# myGameList - React MVVM

Aplicacion web para gestionar listas de videojuegos con sincronizacion en GitHub Gist, arquitectura MVVM y enfoque offline-first.

## Estado actual

Migrada de JavaScript vanilla a React 19 + TypeScript manteniendo:
- Estilo visual y comportamiento funcional principal.
- Estructura de datos compatible con storage legacy.
- Sincronizacion CRDT para reducir perdida de datos en conflictos.
- Diseno responsive mobile-first.

## Stack real del proyecto

Dependencias principales declaradas en package.json:
- react ^19.2.0
- react-dom ^19.2.0
- react-router-dom ^7.9.5
- @tanstack/react-virtual ^3.13.24

Tooling principal declarado:
- vite ^8.0.11
- @vitejs/plugin-react ^6.0.1
- typescript ^6.0.3
- vitest ^4.1.5
- eslint ^9.39.4
- sass ^1.99.0

## Estado de dependencias (verificado el 2026-05-09)

Resumen de comprobacion con npm outdated:
- Upgrade mayor aplicado en este estado del repositorio para:
  - @vitejs/plugin-react: 4.x -> 6.0.1
  - vite: 6.x -> 8.0.11
  - eslint: 8.x -> 9.39.4
- Pendiente de major adicional:
  - eslint: 9.39.4 -> 10.3.0

Conclusion:
- Las dependencias estan actualizadas al estado objetivo del upgrade implementado.
- ESLint se mantiene en v9 por compatibilidad actual de plugins (react/jsx-a11y) con la major 10.

## Arquitectura MVVM

Estructura principal:
- src/model
  - types: contratos de datos (GameItem y tipos relacionados)
  - repository: acceso a datos local, migracion legacy, sync CRDT y Gist
- src/viewmodel
  - useGameListViewModel: estado de listas, filtros, ordenacion, CRUD, modales
  - useSyncViewModel: conexion/sincronizacion con GitHub Gist
- src/view
  - components: iconos y piezas visuales reutilizables
  - hooks: utilidades de UI (debounce)
  - modals: formularios y acciones de administracion/sync
- src/core
  - constants: labels, iconos, storage keys y configuracion UI
  - security: sanitizacion y validaciones defensivas
  - utils: comparadores y helpers puros

## Scripts

- npm run dev: servidor local Vite en puerto 8000
- npm run build: compilacion de produccion
- npm run preview: preview de build
- npm run test: pruebas unitarias de src y tests/unit
- npm run test:all: ejecucion completa de pruebas
- npm run test:watch: modo watch de Vitest
- npm run test:coverage: cobertura
- npm run validate: validacion CI + HTML + ESLint
- npm run lint: autocorrecciones ESLint

## Seguridad

Medidas aplicadas:
- Sanitizacion y normalizacion centralizada en src/core/security/sanitize.ts.
- Validacion de formatos para token GitHub y Gist ID.
- Renderizado React sin inyeccion HTML insegura.
- Cabeceras de seguridad en public/_headers (CSP, X-Frame-Options, etc.).
- Sincronizacion con merge CRDT para minimizar conflictos y perdida de informacion.

Nota: el token de GitHub se guarda en localStorage para permitir sincronizacion persistente. Se recomienda usar dispositivo de confianza y HTTPS.

## Compatibilidad de datos

La app mantiene migracion de formatos antiguos mediante:
- src/model/repository/migrateRepository.ts
- src/model/repository/localRepository.ts

Esto permite cargar y normalizar datos legacy sin romper el historico existente.

## Testing

Suite de pruebas actual:
- Unit: tests/unit
- Integration: tests/integration
- E2E: tests/e2e

Ejecucion con Vitest (entorno jsdom para pruebas que lo requieren).

## Despliegue

Configurada para despliegue estatico con:
- index.html en raiz (entrada Vite)
- assets publicos en public/
- fallback SPA en public/_routes.json
