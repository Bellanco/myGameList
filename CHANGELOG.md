# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning follows the git tags.

## [Unreleased]

### Added
- **Panel de administración** (`/admin`, ruta oculta sin enlace en la navegación): censo de perfiles
  —incluidos los que tienen el social desactivado, que el directorio no muestra— con sus amistades, y
  acciones de moderación: suspender el social, purgar los restos legacy del perfil público (email,
  gist de juegos y token en claro) y borrar perfil + amistades. El acceso lo concede `isAdmin()` en
  las reglas de Firestore, no el cliente. El borrado es parcial a propósito: `privateConfig`,
  `publicConfig` y `userMap` son owner-only y sobreviven, igual que la cuenta de Google y los Gists.
- **Auto-saneado del perfil legacy al iniciar sesión**: el navegador del propio usuario respalda el token de
  GitHub cifrado y el id del gist de juegos en `privateConfig` (owner-only) y solo entonces los borra —junto al
  `email`— del perfil público. Si el respaldo falla no se purga nada y se reintenta en el siguiente arranque.
  Es el único actor que puede hacerlo: `privateConfig` no es legible ni escribible por el administrador.
- **Rango de perfil** (`tier`): bronce por defecto, plata, oro y mithril. Lo asigna el administrador
  desde el panel; las reglas impiden que el dueño se lo cambie. Mithril queda reservado a la cuenta
  del administrador. Se muestra como un punto de color en la esquina de cada tarjeta del directorio
  social, y determina cada cuánto se rehidrata el feed de QUIEN MIRA: bronce 30 min (como siempre),
  plata 15, oro 10 y mithril al abrir (con un suelo de 12 s). Las reglas impiden que el dueño se lo
  asigne, lo cambie o lo borre; solo puede conservarlo tal cual.
- El rango decide también **quién puede publicar** en el feed y con qué extensión: bronce no publica
  (el compositor no aparece), plata 1.000 caracteres, oro 10.000 y mithril sin límite. El compositor
  pasa a ser un campo de una línea que crece al saltar de línea, con el mismo contador de caracteres
  que el análisis de un juego; se publica con el botón o con Ctrl/⌘+Enter.
- **Tema claro "arena"** — paleta clara con tonos cálidos manteniendo el azul de marca.
- **Documentos legales** (`/legal/aviso`, `/legal/privacidad`, `/legal/cookies`) accesibles desde la
  app, con aceptación registrada por cuenta antes de activar lo social.
- **Analítica opt-in**: Google Analytics no se inicializa hasta que se acepta en el aviso, y se
  puede revocar desde Cuenta.
- **Borrado de cuenta** (RGPD art. 17): elimina perfil, amistades y configuración en la nube, y
  limpia los datos del dispositivo. Los Gists, al ser de la cuenta de GitHub del usuario, no se tocan.

### Changed
- El perfil público deja de publicar `email` y `social.gamesGistId`: el perfil propio se resuelve por
  uid y el gist de juegos se recupera de `privateConfig` (solo el dueño). Se purgan de los perfiles
  existentes en su siguiente guardado.
- Colores de acento centralizados en tokens `--*-rgb` theme-aware; eliminados los `rgba()` con
  valores incrustados en los partials SCSS.
- El perfil social ya no tiene juegos favoritos: desaparecen del editor, del directorio y del
  detalle, y dejan de publicarse en el gist. Para crear el perfil ahora basta con un nombre y al
  menos un juego completado.

### Fixed
- La preferencia de efectos visuales no llegaba a sincronizarse: faltaba `effects` en la allowlist de
  las reglas de `publicConfig`, que la denegaba en silencio.

## [3.3] - 2026-07-09

### Added
- Ordenación por columnas en las listas y en las tablas de detalle de perfil, con indicador sutil.

### Fixed
- La columna de puntuación ordena por nota fina, no por el espejo de 0–5 estrellas.
- El feed de reseñas ya no salta de posición en ediciones que solo cambian la nota.
- Se persiste `listedAt` para mantener el orden de completados al editar.
- La última fila de la lista deja de quedar tapada por la barra inferior fija.

### Changed
- Buckets estrella↔nota unificados y etiquetas del filtro de puntuación corregidas.
- Se deja de trackear la salida de cobertura generada.

## [3.2] - 2026-07-06

### Added
- **Escala de puntuación 0–100** opcional bajo la vista de 5 estrellas, elegible en Ajustes,
  sincronizada vía Firestore y publicada en el canal social. Nuevos juegos por defecto a 60 (3★).
- **Observabilidad**: error boundary global, handlers de `window` y telemetría enriquecida;
  analítica de eventos clave e identificación de usuario.

### Performance
- Cutover de compresión del gist de juegos; tamaño de chunks calculado por su huella comprimida.

## [3.1] - 2026-07-04

### Added
- **Compresión gzip del gist** (lectura + escritura *gated* por flag, con tests de cutover).
- Rediseño social: reseñas con medallón de nota, editor de perfil, estantería de favoritos y botón
  de peticiones; reseñas sin nota con medallón azul "¿?".
- Ruleta con dados 3D y micro-interacciones de movimiento en toda la app.

### Changed
- Extracción de componentes sociales (MetaSection, HubStatus, HubBackButton) y de helpers de sync;
  limpieza de código muerto y comentarios engañosos.

## [3.0] - 2026-07-02

### Added
- **Sistema de amistades**: directorio dividido en amigos/otros, peticiones y confirmación al dejar
  de ser amigos. Error boundary del hub social con reintento throttled.

### Fixed
- Varias condiciones de carrera y de caché del feed social: hidratar solo tras resolver amistades,
  revalidación de caché con `If-None-Match`, auto-sanado de `gistId` obsoleto, uso del nick social
  (nunca el nombre de Google) y endurecimiento frente a entradas de actividad malformadas.

## [2.1 – 2.9] - 2026-06-27 → 2026-07-01

- Base moderna tras la migración: React 19 + TypeScript, capa Firebase (Firestore/Auth), IndexedDB,
  canal social sobre Gist y sincronización CRDT endurecida, con numerosas correcciones.
  (~76 commits consolidados en este rango.)

## [2.0.1] - 2026-04-26

### Fixed
- **Button Double-Processing** — event deduplication flag to prevent toggle buttons firing twice.
- **Service Worker in Development** — SW auto-unregisters in localhost for proper module loading.
- **Form Button Labels** — `form:` structure in TAB_V_LABELS for correct bool button labels.

## [2.0.0] - 2026-04-25

### Added
- **TypeScript** support, **unit tests** (CRDT + UI helpers), **CRDT Sync** with GitHub Gist,
  **PWA** (Service Worker + manifest), responsive design, dynamic filters and an admin panel for
  tags (genres, platforms, years, strengths, weaknesses).

### Removed
- Duplicate `public/js/` folder and duplicate `ci.yml`.
