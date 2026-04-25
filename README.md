# Mis Listas de Juegos - v2.0.0

Gestor moderno de colecciones de videojuegos con sincronización en la nube (GitHub Gist).

## Características

- Diseño responsivo mobile-first
- Sincronización con GitHub Gist
- CRDT merge (cero pérdida de datos)
- 4 categorías (Completados, Visitados, En curso, Próximos)
- Sistema avanzado de etiquetas
- Filtros inteligentes
- Offline-first con Service Worker
- Tests unitarios con Vitest
- Sin build step, carga directa
- Accesible WCAG AA
- TypeScript (soporte completo)

## Inicio Rápido

```bash
git clone https://github.com/tuusuario/myGameList.git
cd myGameList
npm install
npm run dev       # http://localhost:8000
npm run test      # Tests unitarios
npm run validate  # Lint + validación
```

## Uso

1. Abre la app y haz click en el engranaje (Configurar)
2. Introduce token GitHub + ID Gist
3. Click en + para añadir juegos
4. Sincroniza automáticamente cada 1.8s
5. Funciona completamente offline

## Arquitectura

**Vanilla JavaScript** (sin framework)
- `public/ts/app.ts` - SPA principal (1,500+ LOC, TypeScript)
- `public/ts/sync.ts` - API GitHub Gist + CRDT merge
- `public/ts/migrate.ts` - Migración de datos
- `public/style.css` - CSS3 con variables y BEM
- `public/service-worker.js` - Service Worker para offline
- `public/manifest.json` - PWA manifest

## Diseño de Iconos (v2.0)

### Estados Positivos (Azul Sutil)
- **Rejugar Activo**: Estrella azul - juego rejugable
- **Nueva Oportunidad Activo**: Refresh azul - hay oportunidad disponible

### Estados Negativos (Colores Cálidos)
- **Rejugar Inactivo**: Stack ambar - no rejugable
- **Nueva Oportunidad Inactivo**: Candado rojo - sin oportunidad

Todos con gradientes suaves y glow sutil para coherencia visual.

## Testing

```bash
npm run test        # Ejecutar tests una vez
npm run test:watch  # Modo watch
```

Cobertura:
- CRDT merge logic
- Sincronización GitHub Gist
- Validación de datos
- Breakpoints responsive

## Documentación

- [Guía de Sincronización](./docs/SYNC_GUIDE.md) - Estrategia CRDT
- [Instrucciones Copilot](./.github/copilot-instructions.md) - Guía de desarrollo
- [CHANGELOG](./CHANGELOG.md) - Historial de versiones

## Requisitos

- Node.js 20+ LTS
- Cuenta GitHub (para Gist sync)
- Navegador moderno (Chrome, Firefox, Safari, Edge)

## Seguridad

- Token almacenado en localStorage (solo navegador del usuario)
- Gists privados por defecto
- Input sanitizado con `UI.esc()`
- HTTPS recomendado con tokens
- CRDT previene conflictos de sincronización

## Stack Técnico

| Aspecto | Tecnología |
|--------|-----------|
| Frontend | HTML5 + Vanilla JS ES6+ + CSS3 |
| Tipado | TypeScript (opcional) |
| Persistencia | GitHub Gist REST API |
| Offline | Service Worker + localStorage |
| Testing | Vitest |
| Linting | ESLint |
| Validación | html-validate |
| Build | Vite |

## Características Destacadas

- **CRDT Merge**: Sincronización bidireccional sin conflictos
- **Offline Mode**: Funciona completamente sin conexión
- **Responsive Design**: Breakpoints 1100px y 1400px
- **Accesibilidad**: WCAG AA mínimo, aria-* atributos
- **PWA**: Instalable como app nativa
- **Rendimiento**: Carga rápida, sin dependencias pesadas

## Licencia

MIT - 2026

Desarrollado con tecnologías web vanilla.