---
agent: agent
description: "Refactorizar código existente en Mis Listas de forma segura"
---

# Refactoring: ${input:target}

## Contexto
Lee `.github/copilot-instructions.md` para entender la arquitectura.

## Qué refactorizar
${input:description}

## Protocolo seguro de refactoring

### 1. Inventario de impacto
Antes de tocar nada, identificar TODOS los archivos que importan o usan
el código que vas a cambiar:
```bash
grep -rn "${input:symbol}" src/ tests/ functions/
```

### 2. Tests existentes
Verificar que hay tests que cubren el comportamiento actual:
```bash
npm run test
```
Si no hay tests, **crear tests primero** que capturen el comportamiento
actual antes de refactorizar. Antes de proponer una limpieza, mira
`docs/revision-general-2026-09.md`: puede estar ya descartada con la medición delante.

### 3. Cambios incrementales
- Hacer un cambio pequeño a la vez
- Verificar typecheck después de cada cambio: `npm run typecheck`
- No combinar refactoring con cambios de funcionalidad

### 4. Preservar la API pública
- Si la función/hook es usado fuera de su archivo, mantener la firma
- Si hay que cambiar la firma, actualizar TODOS los call sites
- Si es un tipo exportado, verificar que no rompe otros archivos

### 5. Verificación final
```bash
npm run typecheck         # sin errores de tipo (src/tests + functions)
npm run validate           # lint limpio
npm run test               # tests pasan
npm run build              # build producción OK
```

## Restricciones
- No cambiar comportamiento observable (mismos inputs → mismos outputs)
- No añadir dependencias nuevas
- No modificar la estructura de archivos sin justificación clara
- No borrar exports «sin usar» de `src/model/repository/` ni de `src/model/types/` (zona de staging de la
  migración del gist; falsos positivos conocidos de los detectores de código muerto): preguntar antes
- No «corregir» de pasada la desviación MVVM documentada en el README (`view/` que importa repositorios)
- No formatear ficheros enteros (`prettier` reformatea lo que no tocas)
