---
mode: agent
description: "Refactorizar código existente en Mi Lista de forma segura"
---

# Refactoring: {{target}}

## Contexto
Lee `.github/copilot-instructions.md` para entender la arquitectura.

## Qué refactorizar
{{description}}

## Protocolo seguro de refactoring

### 1. Inventario de impacto
Antes de tocar nada, identificar TODOS los archivos que importan o usan
el código que vas a cambiar:
```bash
grep -rn "{{symbol}}" src/ tests/
```

### 2. Tests existentes
Verificar que hay tests que cubren el comportamiento actual:
```bash
npm run test
```
Si no hay tests, **crear tests primero** que capturen el comportamiento
actual antes de refactorizar.

### 3. Cambios incrementales
- Hacer un cambio pequeño a la vez
- Verificar typecheck después de cada cambio: `npx tsc --noEmit`
- No combinar refactoring con cambios de funcionalidad

### 4. Preservar la API pública
- Si la función/hook es usado fuera de su archivo, mantener la firma
- Si hay que cambiar la firma, actualizar TODOS los call sites
- Si es un tipo exportado, verificar que no rompe otros archivos

### 5. Verificación final
```bash
npx tsc --noEmit          # sin errores de tipo
npm run validate           # lint limpio
npm run test               # tests pasan
npm run build              # build producción OK
```

## Restricciones
- No cambiar comportamiento observable (mismos inputs → mismos outputs)
- No añadir dependencias nuevas
- No modificar la estructura de archivos sin justificación clara
