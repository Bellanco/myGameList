# Instrucciones para Copilot

## Visión del proyecto
Este repositorio implementa una **aplicación web para gestionar listas de videojuegos** con frontend moderno en **HTML5, Vanilla JavaScript y CSS3**. La aplicación sincroniza datos usando **GitHub Gist REST API** (crear, actualizar, eliminar). El frontend permite **crear, editar y borrar** entradas desde la interfaz.

Arquitectura: **Frontend-only SPA** sin backend dedicado. Persistencia remota vía GitHub Gist.

## Stack y requisitos
- **Frontend**: HTML5 semántico, Vanilla JS (ES6+), CSS3 con BEM, TypeScript (type safety)
- **Build tools**: Vite (dev server), ESLint (linting), html-validate (validation)
- **Testing**: Vitest (unit tests)
- **Persistencia remota**: GitHub Gist REST API con CRDT (Conflict-free Replicated Data Type)
- **PWA**: Service Worker + manifest.json para funcionalidad offline
- **Node.js**: 20+ LTS 

## Convenciones de código

### JavaScript/TypeScript
- **Estructura**: Clase principal `SteamListApp` con métodos organizados por concern (render, form, sync, admin)
- **Estilo**: ES6+, `const`/`let` (sin `var`), arrow functions, template literals
- **Naming**: camelCase para variables/métodos, UPPERCASE para constantes
- **DOM**: Manipulación directa con `innerHTML` (escapada con `UI.esc()`), delegación de eventos en `document`
- **Validación**: Consolidada en helpers (`isValidYear()`, `_getFormValue()`, `_getBoolValue()`)
- **Sin framework**: Vanilla JS, sin React/Vue/Angular

### HTML
- Elementos semánticos (`main`, `section`, `article`, `form`)
- Atributos `data-action`, `data-event`, `data-id` para delegación de eventos
- Estructura limpia, sin divitis
- Validación con html-validate

### CSS
- Metodología BEM para clases
- Variables CSS en `:root` para colores, espaciados, breakpoints
- Mobile-first responsive design
- Breakpoints: 1100px (tableCompact), 1400px (filtersCompact)
- Accesibilidad: contraste WCAG AA mínimo, `aria-*` donde sea necesario

## Integración con GitHub Gist
- **Operaciones**: create, read, update (PATCH files), delete
- **Formato**: JSON con timestamps `_ts` para CRDT (conflict resolution)
- **Estructura de actualización**: `files: { "games.json": { "content": "..." } }`
- **Seguridad**: Token en variables de entorno, nunca en código fuente
- **Resiliencia**: Reintentos exponenciales, manejo de truncated content

## CRDT (Conflict-free Replicated Data Type)
- Cada item tiene `_ts` (timestamp) para resolver conflictos
- Merge: unión de local + remote + deleted, el más nuevo gana
- Nunca pierde datos 

## Reglas para sugerencias
- Priorizar **claridad y simplicidad** sobre features complejas
- Código con **validación robusta** y manejo de errores
- Tests unitarios para lógica crítica (CRDT, validación, sincronización)
- Refactorizar eliminando duplicación, evitar over-engineering
- Usar herramientas estándar (Vitest, TypeScript nativo, Service Workers standard)

## Documentación
- README con flujo de uso, configuración de Gist, instrucciones de offline
- Ejemplos de sync, tests
- Changelog actualizado en cada release

