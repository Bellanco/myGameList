---
agent: agent
description: "Corregir un bug en Mis Listas"
---

# Bug: ${input:bug_description}

## Síntoma
${input:symptom}

## Pasos para reproducir
${input:steps}

## Protocolo de diagnóstico

### 1. Identificar la capa afectada
```
Vista (src/view/)  →  ViewModel (src/viewmodel/)  →  Repository (src/model/repository/)  →  Storage
```

### 2. Trazar el flujo de datos
- Leer el componente que muestra el síntoma
- Seguir hacia el ViewModel que provee los datos
- Seguir hacia el Repository que los obtiene/persiste
- Verificar el storage (localStorage/IndexedDB/Gist/Firestore)

### 3. Buscar anti-patrones comunes
- **Closure stale**: `useCallback`/`useEffect` capturando estado antiguo
- **Race condition**: Múltiples ciclos de sync simultáneos
- **Mutación directa**: Objeto modificado sin spread/clone
- **Await faltante**: Función async llamada sin `await`
- **Foto rancia**: el ciclo de sync usando datos de un render anterior en vez de los actuales (refs)
- **304 sin cuerpo**: un `304 Not Modified` no trae contenido; lo que dependa de leerlo (p. ej. migrar un gist
  legacy) no ocurre en ese camino

### 4. Fix mínimo
- Cambiar solo lo necesario para corregir el bug
- No refactorizar código que funciona
- No añadir features extras

### 5. Verificar
```bash
npm run typecheck
npm run test
npm run validate
```

## Restricciones
- Si el fix toca sync: verificar que no rompe el CRDT merge
- Si el fix toca UI: probar en mobile (360px); si depende del layout del navegador, `npm run build && npm run test:e2e`
  (jsdom no tiene layout)
- Si el fix toca tipos: verificar que no hay breaking changes
