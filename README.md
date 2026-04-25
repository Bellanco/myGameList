# Mis Listas de Juegos - v2.0.0

Gestor moderno de colecciones de videojuegos con sincronización en la nube (GitHub Gist).

## ? Características

- ?? Diseño responsivo mobile-first
- ?? Sincronización con GitHub Gist
- ?? CRDT merge (cero pérdida de datos)
- ?? 4 categorías (Completados, Visitados, En curso, Próximos)
- ??? Sistema avanzado de etiquetas
- ?? Filtros inteligentes
- ?? Offline-first con Service Worker
- ?? Tests unitarios con Vitest
- ? Sin build step, carga directa
- ? Accesible WCAG AA
- ?? TypeScript (opcional)

## ?? Inicio Rápido

\\\ash
git clone https://github.com/tuusuario/myGameList.git
cd myGameList
npm install
npm run dev       # http://localhost:8000
npm run test      # Tests unitarios
npm run validate  # Lint + validación
\\\

## ?? Uso

1. Abre la app ? Click en engranaje (Configurar)
2. Introduce token GitHub + ID Gist
3. Click en + para añadir juegos
4. Sincroniza automáticamente cada 1.8s
5. Funciona completamente offline

## ??? Arquitectura

**Vanilla JavaScript** (sin framework)
- \public/js/app.ts\ - SPA principal (1,382 LOC, TypeScript)
- \public/js/sync.js\ - API GitHub Gist + CRDT merge
- \public/js/migrate.js\ - Migración de datos
- Service Worker para offline
- PWA con manifest.json

## ?? Tests

\\\ash
npm run test        # Ejecutar tests una vez
npm run test:watch  # Modo watch
\\\

## ?? Documentación

- [Guía de Sincronización](./docs/SYNC_GUIDE.md) - Estrategia CRDT
- [Instrucciones Copilot](./.github/copilot-instructions.md) - Guía de desarrollo
- [English README](./README.en.md)

## ?? Requisitos

- Node.js 20+ LTS
- Cuenta GitHub (para Gist sync)

## ?? Seguridad

- Token almacenado en localStorage (solo navegador del usuario)
- Gists privados por defecto
- Input sanitizado
- HTTPS recomendado con tokens

## ?? Licencia

MIT © 2026

**Hecho con ?? usando tecnologías web vanilla**
