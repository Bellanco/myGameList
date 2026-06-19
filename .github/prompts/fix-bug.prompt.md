---
mode: agent
description: "Corregir un bug en Mi Lista"
---

# Bug: {{bug_description}}

## Síntoma
{{symptom}}

## Pasos para reproducir
{{steps}}

## Protocolo de diagnóstico

### 1. Identificar la capa afectada
```
Vista (src/view/)  →  ViewModel (src/viewmodel/)  →  Repository (src/model/repository/)  →  Storage
```

### 2. Trazar el flujo de datos
- Leer el componente que muestra el síntoma
- Seguir hacia el ViewModel que provee los datos
- Seguir hacia el Repository que los obtiene/persiste
- Verificar el storage (localStorage/IndexedDB/Gist)

### 3. Buscar anti-patrones comunes
- **Closure stale**: `useCallback`/`useEffect` capturando estado antiguo
- **Race condition**: Múltiples ciclos de sync simultáneos
- **Mutación directa**: Objeto modificado sin spread/clone
- **Await faltante**: Función async llamada sin `await`
- **ETag desactualizado**: Push a Gist sin ETag fresco → 409

### 4. Fix mínimo
- Cambiar solo lo necesario para corregir el bug
- No refactorizar código que funciona
- No añadir features extras

### 5. Verificar
```bash
npx tsc --noEmit
npm run test
npm run validate
```

## Restricciones
- Si el fix toca sync: verificar que no rompe el CRDT merge
- Si el fix toca UI: probar en mobile (360px)
- Si el fix toca tipos: verificar que no hay breaking changes
