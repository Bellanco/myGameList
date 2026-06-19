---
mode: agent
description: "Añadir una nueva funcionalidad a Mi Lista"
---

# Nueva funcionalidad: {{feature_name}}

## Contexto
Lee `.github/copilot-instructions.md` para entender la arquitectura actual.

## Qué implementar
{{description}}

## Checklist de implementación

### 1. Tipos (si necesario)
- Añadir interfaces/types en `src/model/types/game.ts` o nuevo archivo en `src/model/types/`
- Asegurar que los tipos nuevos no duplican campos existentes

### 2. Repository (si accede a datos)
- Funciones en `src/model/repository/` — nunca lógica de UI
- Si toca Gist: respetar ETags y privacy (no datos privados en Gist social)
- Si toca Firestore: solo campos públicos permitidos

### 3. ViewModel (lógica de negocio)
- Hook en `src/viewmodel/use{Feature}ViewModel.ts`
- Expone estado + acciones, consume repositories
- No efectos secundarios fuera de `useEffect`

### 4. Componente (UI)
- En `src/view/components/` o `src/view/modals/`
- Consume el ViewModel hook, no accede a datos directamente
- SCSS en `src/styles/` (no Tailwind, no inline styles complejos)
- Responsive: 360px mínimo
- Si es pesado: lazy load con `React.lazy()`

### 5. Integración
- Conectar en `App.tsx` o componente padre según corresponda
- Añadir rutas si es una nueva sección

### 6. Verificación
```bash
npx tsc --noEmit
npm run validate
npm run test
```

## Restricciones
- No modificar la lógica de sync existente sin justificación
- No añadir dependencias npm sin preguntar primero
- Seguir el estilo de código existente (JSDoc, async/await, español en comentarios OK)
