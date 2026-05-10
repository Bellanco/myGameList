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

## Firebase (Analytics, Firestore y Authentication)

La app incluye una capa de integracion en el repositorio:
- src/model/repository/firebaseRepository.ts

Servicios preparados:
- Firebase Analytics (web)
- Cloud Firestore
- Firebase Authentication

Importante sobre Crashlytics:
- Firebase Crashlytics no tiene soporte oficial para aplicaciones web JavaScript.
- Se deja trazabilidad de errores via eventos de Analytics como alternativa inicial.

Variables de entorno necesarias (Vite):
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID
- VITE_FIREBASE_MEASUREMENT_ID (opcional, habilita Analytics)
- VITE_ENABLE_ANALYTICS (opcional: en produccion por defecto true, usar false para desactivar)

Pasos rapidos:
1. Crear proyecto en Firebase Console.
2. Habilitar Authentication (por ejemplo Google o Email/Password).
3. Crear base de datos Cloud Firestore en modo bloqueado y reglas seguras.
4. Copiar la configuracion web al archivo .env local a partir de .env.example.
5. Ejecutar npm run dev.

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

## Guia Cloudflare Pages (optima y escalable)

Esta guia deja la app lista para produccion con React + Vite en Cloudflare Pages,
manteniendo seguridad estricta, cache eficiente y fallback SPA.
### 0) Prerequisitos: Node.js versión

La versión de Node.js se configura automáticamente via `engines` en package.json:
```json
"engines": {
  "node": ">=20.0.0"
}
```

Cloudflare Pages detecta y usa Node 20+ para el build.
No es necesario .nvmrc ni configuración manual en el dashboard.
### 1) Ajustes obligatorios en el repositorio

- Cabeceras de seguridad y cache en public/_headers:
  - CSP ampliada para GitHub API + Firebase/Auth/Firestore.
  - index.html sin cache para que cada deploy se refleje al instante.
  - /assets/* con cache inmutable de 1 ano (archivos con hash de Vite).
  - service-worker.js con revalidacion para actualizar rapido el cliente.
- Fallback SPA en public/_redirects:
  - Regla `/* /index.html 200` para soportar refresh directo en rutas de React Router.
- Service Worker en public/service-worker.js:
  - Solo cachea peticiones GET del mismo origen.
  - Excluye APIs externas (GitHub/Firebase) para evitar cachear datos sensibles o estancados.
  - Cachea unicamente respuestas validas (status 200 y type basic).
- Wrangler alineado a Pages en wrangler.toml:
  - Compat date actualizada.
  - pages_build_output_dir apuntando a ./dist.

### 2) Ajustes obligatorios en Cloudflare Pages (dashboard)

Configura el proyecto con estos valores:

- **Framework preset**: React (Vite) ← IMPORTANTE, no solo "Vite"
- **Build command**: npm run build
- **Build output directory**: dist
- **Root directory**: (vacío)
- **Node.js**: 20 o superior (detectado automáticamente de package.json engines)
- **Production branch**: main (o la que uses)
- **Auto-deploy**: ✓ activar para que cada push redeploy automáticamente

Variables de entorno (Production y Preview):
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID
- VITE_FIREBASE_MEASUREMENT_ID (opcional)
- VITE_ENABLE_ANALYTICS (opcional)

### 3) Ajustes recomendados de optimizacion aplicados

- Carga diferida (lazy) de secciones no criticas en src/App.tsx:
  - SocialHub
  - SettingsHub

Esto reduce el peso inicial del bundle y mejora el tiempo de interaccion en la
primera carga de la seccion principal.

### 4) Validacion post deploy (checklist rapido)

1. Abrir la web y recargar una ruta interna (/social o /ajustes): no debe haber 404.
2. Verificar en DevTools Network que /assets/* se sirve con cache immutable.
3. Verificar en DevTools Console que no hay bloqueos CSP para Firebase o GitHub API.
4. Confirmar login social y lectura/escritura remota en Gist.
5. Publicar un nuevo deploy y comprobar que index.html se actualiza de inmediato.

### 5) Escalado futuro recomendado

1. Seguir separando pantallas grandes en chunks lazy cuando crezca la app.
2. Mantener CSP por lista blanca minima: solo dominios realmente usados.
3. Revisar trimestralmente dependencias y compatibilidad de Vite/Cloudflare.
4. Mantener tests de humo E2E en rutas internas para detectar roturas de fallback.

## Análisis de performance y bundles

Para detalles sobre el presupuesto de bundles, métricas esperadas en Lighthouse
y guía de medición en dispositivos móviles a 360px, ver [BUNDLE_ANALYSIS.md](BUNDLE_ANALYSIS.md).

Resumen de optimizaciones aplicadas:
- Code splitting con manualChunks: firebase, react, router, virtual como chunks separados.
- Lazy loading: SocialHub, SettingsHub, FormModal, ConfirmModal.
- Cache inmutable de 1 año para assets versionados.
- Service Worker optimizado para evitar cachear datos sensibles de APIs.

## Guía de deployment paso a paso

Para instrucciones detalladas incluyendo:
- Configuración exacta de variables de entorno
- Pasos de validación post-deploy (60 segundos)
- Troubleshooting rápido
- Métricas esperadas en Lighthouse

Ver [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md).

## Cambios recientes en esta optimización (Mayo 2026)

Actualización completa para Cloudflare Pages óptimo y escalable:

### Seguridad
- ✅ CSP abierta para Firebase + GitHub APIs (connect-src, frame-src, img-src)
- ✅ Headers de seguridad adicionales (X-Frame-Options, X-Content-Type-Options, etc.)

### Rendimiento
- ✅ Code splitting: firebase (364 kB), react (189 kB), router (16 kB), virtual (16 kB)
- ✅ Lazy loading: SocialHub, SettingsHub, FormModal, ConfirmModal
- ✅ Bundle principal reducido a 122 kB (antes 700+ kB)
- ✅ Primer load: ~50 kB gzip (excluye vendors en caché)

### Caché estratificado
- ✅ /assets/*: 31536000s (1 año, immutable) para renovaciones de vendor sin invalidar caché
- ✅ /index.html: sin cache (deploy inmediato)
- ✅ /service-worker.js: revalidación breve

### Fallback SPA
- ✅ public/_redirects: /* /index.html 200 para soporte de rutas internas
- ✅ public/_routes.json: limpiado para solo Functions

### Node.js
- ✅ Configurado en package.json engines: >=20.0.0
- ✅ Cloudflare Pages detecta automáticamente, sin .nvmrc necesario

### Service Worker
- ✅ Solo cachea same-origin
- ✅ Excluye APIs externas (GitHub, Firebase)
- ✅ Validación de respuestas seguras

## Checklist de deployment final

- [ ] git push de todos los cambios
- [ ] Conectar repositorio en Cloudflare Pages
- [ ] Framework preset: **React (Vite)**
- [ ] Build command: npm run build
- [ ] Output dir: dist
- [ ] Agregar todas las variables VITE_FIREBASE_* en Production + Preview
- [ ] Activar auto-deploy
- [ ] Primer deploy completado sin errores
- [ ] Validar rutas SPA: /social, /ajustes sin 404 (test después de recargar)
- [ ] Verificar caché inmutable en Network tab
- [ ] Verificar sin bloques CSP en Console
- [ ] Firebase/Auth conectan correctamente
- [ ] Lighthouse: Performance ≥ 70 (primera visita)
- [ ] Lighthouse: Performance ≥ 90 (revisita con caché)
