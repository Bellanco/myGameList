---
agent: agent
description: "Añadir una nueva funcionalidad a Mis Listas"
---

# Nueva funcionalidad: ${input:feature_name}

## Contexto
Lee `.github/copilot-instructions.md` para entender la arquitectura actual.

## Qué implementar
${input:description}

## Checklist de implementación

### 1. Tipos (si necesario)
- Añadir interfaces/types en `src/model/types/game.ts` o en el fichero de su área en `src/model/types/`
  (`social.ts`, `firestore.ts`, `local.ts`…)
- Asegurar que los tipos nuevos no duplican campos existentes
- Campos nuevos del juego: **aditivos y opcionales** (un cliente antiguo debe poder leer y escribir el gist)

### 2. Repository (si accede a datos)
- Funciones en `src/model/repository/` — nunca lógica de UI
- Si toca Gist: respetar ETags y privacidad (nada de `SOCIAL_PRIVATE_FIELDS` en el gist social;
  `npm run audit:privacy`). Sin cotas de longitud en `gamesGistSchema.ts`
- Si toca Firestore: actualizar `firestore.rules` (allowlist `hasOnly`) y sus tests (`npm run test:rules`); los
  topes duplicados cliente/reglas (p. ej. `PUBLIC_NAME_MAX_LENGTH`) se cambian a la vez

### 3. ViewModel (lógica de negocio)
- Hook en `src/viewmodel/use{Feature}ViewModel.ts`
- Expone estado + acciones, consume repositories
- No efectos secundarios fuera de `useEffect`

### 4. Componente (UI)
- En `src/view/components/` (o su subcarpeta de área) o `src/view/modals/`
- Consume el ViewModel hook, no accede a datos directamente
- SCSS en `src/styles/` (no Tailwind, no inline styles complejos); textos en `src/core/constants/*Labels.ts`
- Responsive: 360px mínimo
- Si es pesado: lazy load con `React.lazy()`

### 5. Integración
- Conectar en `App.tsx` o componente padre según corresponda
- Añadir rutas si es una nueva sección: `src/core/constants/routes.ts` y `public/_redirects` son un PAR
  (lo vigila `tests/unit/redirectsRoutes.test.ts`)

### 6. Verificación
```bash
npm run typecheck
npm run validate
npm run test
```

## Restricciones
- No modificar la lógica de sync existente sin justificación
- No añadir dependencias npm sin preguntar primero
- Seguir el estilo de código existente (JSDoc, async/await, español en comentarios OK)
