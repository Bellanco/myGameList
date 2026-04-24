# Pruebas de Sincronización

## Verificación Rápida en Consola

Abre la consola del navegador (F12) y ejecuta estos comandos para verificar que el sistema de sincronización funciona:

### 1. Verificar que sync.js está cargado
```javascript
console.log('GistSync disponible:', typeof GistSync !== 'undefined');
console.log('DataSync disponible:', typeof DataSync !== 'undefined');
```

Esperado: `true` para ambos

### 2. Probar merge sin pérdida de datos
```javascript
const localData = { c: [{id: '1', name: 'Game 1'}, {id: '2', name: 'Game 2'}], v: [], e: [], p: [], deleted: [] };
const remoteData = { c: [{id: '3', name: 'Game 3'}], v: [], e: [], p: [], deleted: [] };

const result = DataSync.mergeData(localData, Date.now(), remoteData, Date.now());
console.log('Juegos locales:', localData.c.length, '+', remoteData.c.length, '=', result.merged.c.length);
console.log('Esperado: 3 juegos');
```

Esperado: Total de 3 juegos (1, 2, 3) - NINGUNO perdido

### 3. Probar que el timestamp gana en conflictos
```javascript
const now = Date.now();
const localData = { c: [{id: '1', name: 'Local Version', _ts: now - 1000}], v: [], e: [], p: [], deleted: [] };
const remoteData = { c: [{id: '1', name: 'Remote Version', _ts: now}], v: [], e: [], p: [], deleted: [] };

const result = DataSync.mergeData(localData, now - 1000, remoteData, now);
console.log('Ganador:', result.merged.c[0].name);
console.log('Esperado: Remote Version');
```

Esperado: "Remote Version" (porque tiene timestamp más reciente)

### 4. Validar estructura de datos
```javascript
const testData = { c: [{id: 'test', name: 'Test'}], v: [], e: [], p: [] };
console.log('Estructura válida:', DataSync.isValidData(testData));
```

Esperado: `true`

## Flujo Completo Manual

1. **Abrir aplicación** en el navegador
2. **Ir a "Sincronización"**
3. **Generar token GitHub**:
   - Ir a https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Seleccionar scope: `gist`
   - Copiar token
4. **Pegar token** en el modal de sincronización
5. **Si no tienes gistId**:
   - Dejar vacío
   - Click "Conectar" (creará un Gist nuevo)
6. **Añadir 5 juegos** localmente
7. **Sincronizar** y verificar que aparecen en el Gist
8. **Editar uno** en GitHub Gist directamente
9. **Sincronizar nuevamente** y verificar que el cambio remoto se trae
10. **Verificar contador**: Nunca debe disminuir (126 → 64 NO debe ocurrir)

## Lo que se corrigió

### Problema: Pérdida de 126 → 64 juegos

**Causa raíz**: 
- Cuando se hacía merge, si un juego existía solo en el lado local, se verificaba si `exists in both` (línea de old code)
- Si no existía en remoto, se añadía un registro de "deleted" sin verificar bien
- Luego, cuando se escribía al Gist, se sobrescribía completamente

**Solución implementada**:
1. **sync.js** con `DataSync.mergeData()` que NUNCA descarta datos
2. Verifica `allIds` (unión de local + remote + deleted)
3. Si solo está en local → SE INCLUYE
4. Si solo está en remoto → SE INCLUYE
5. Si está en ambos → Gana el timestamp más reciente
6. Migración automática de datos v11 a v12 al leer del Gist

### Cambios específicos

**Archivo**: `sync.js` (nuevo)
- Lógica de merge robusta
- Cliente HTTP para Gist
- Validación de datos
- Migración automática

**Archivo**: `app.js` (modificado)
- Removida la definición de `GistSync` (ahora en sync.js)
- Simplificado `_mergeData()` para usar `DataSync.mergeData()`

**Archivo**: `index.html` (modificado)
- Cargado `sync.js` antes que `app.js`

## Valores de Debug

Si sospechas que hay un problema, ejecuta en consola:

```javascript
// Contar juegos locales
const totalLocal = app.data.c.length + app.data.v.length + app.data.e.length + app.data.p.length;
console.log('Juegos locales:', totalLocal);

// Contar borrados
console.log('Juegos borrados:', app.data.deleted.length);

// Timestamp del último update
console.log('Último update:', new Date(app.meta?.updatedAt || 0));
```

## Archivos Involucrados

- `sync.js` - Nueva lógica de sincronización (11.5 KB)
- `app.js` - Modificado para usar sync.js
- `index.html` - Añadido script para sync.js
- `migrate.js` - Sin cambios (compatibilidad v11 → v12)
- `SYNC_FLOW.md` - Documentación del flujo

