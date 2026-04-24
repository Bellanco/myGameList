# Flujo de Sincronización - Mis Listas de Juegos

## Descripción General

El sistema de sincronización usa **GitHub Gist** como almacenamiento remoto. La lógica implementa un merge automático basado en **timestamps** para resolver conflictos entre datos locales y remotos sin perder información.

## Componentes

### 1. sync.js
Archivo separado que contiene toda la lógica de sincronización:

- **GistSync**: Cliente HTTP para comunicarse con la API de Gist
  - `getCfg()`: Carga configuración (token, gistId) del localStorage
  - `saveCfg(cfg)`: Guarda configuración en localStorage
  - `clearCfg()`: Limpia la configuración
  - `whoami(token)`: Verifica autenticación
  - `create(token)`: Crea un nuevo Gist
  - `read(token, gistId)`: Lee datos del Gist (aplica migración automática)
  - `write(token, gistId, data)`: Escribe datos en el Gist

- **DataSync**: Lógica de merge
  - `mergeData(localData, localTs, remoteData, remoteTs)`: Realiza merge inteligente
  - `isValidData(data)`: Valida estructura de datos
  - `normalize(data)`: Normaliza datos a estructura estándar
  - `normalizeGame(game)`: Normaliza un juego individual
  - `countGames(data)`: Cuenta total de juegos

### 2. app.js
Integración de sincronización en la aplicación principal:

- Reemplazó la definición de `GistSync` para usar la de sync.js
- Simplificó `_mergeData()` para usar `DataSync.mergeData()`
- Mantiene los métodos de sincronización: `_initSync()`, `_syncNow()`, `_syncConnect()`, etc.

### 3. migrate.js
Mantiene la migración de formato heredado a v12 (claves en camelCase)

## Flujo de Datos

### Primer Conectar (sin datos remotos)
```
1. Usuario entra token y gistId
2. Si gistId está vacío:
   a. Crear nuevo Gist (enviar datos locales + timestamp actual)
   b. Guardar gistId en config
3. Si gistId tiene datos:
   a. Leer datos del Gist
   b. Realizar MERGE (local + remoto)
   c. Guardar merged data localmente
   d. Sincronizar merged data al Gist
```

### Cambio Local → Push
```
1. Usuario realiza cambio (add/edit/delete)
2. Cambio se guarda localmente con timestamp actual (_ts)
3. Se programa un push (debounce 1.8s)
4. On push:
   a. Leer datos remotos
   b. Realizar MERGE
   c. Escribir merged data al Gist
   d. Guardar merged data localmente
```

### Pull (usuario cliquea "Sincronizar")
```
1. Leer datos remotos
2. Realizar MERGE (local + remoto, comparando timestamps)
3. Guardar merged data localmente
4. Si hay cambios locales no sincronizados, hacer push
```

## Estrategia de Merge

El merge se basa en **timestamps individuales** (_ts) de cada juego:

### Casos:
1. **Solo en local**: Se incluye (no se pierde)
2. **Solo en remoto**: Se incluye (no se pierde)
3. **En ambos**: Gana el timestamp (_ts) más reciente
4. **Borrado**: Si está en trash con ts > max(local, remote), se queda borrado

### Problema CRÍTICO Evitado:
❌ **ANTES**: Si en remoto faltaban datos, se perdían al hacer merge
✅ **AHORA**: Los datos que solo existen en un lado SIEMPRE se mantienen

## Campos Importantes

Cada juego debe tener:
- `id`: Identificador único (obligatorio)
- `_ts`: Timestamp de última modificación (se usa para resolver conflictos)

Cada sincronización actualiza `updatedAt` del dataset completo.

## Validaciones

- **Estructura**: Todas las 4 listas (c, v, e, p) deben existir
- **Juegos**: Solo se mantienen juegos con ID válido
- **Migración**: Se aplica automáticamente al leer del Gist

## Casos de Uso Problemáticos Resueltos

### Problema: Pierde datos al migrar a Gist
- **Causa**: El merge anterior no incluía datos que solo existían en un lado
- **Solución**: `DataSync.mergeData()` ahora verifica `allIds` y nunca descarta datos

### Problema: Sobrescribe datos remotos
- **Causa**: Write sin validar merge primero
- **Solución**: Siempre se hace merge antes de write

### Problema: Datos corruptos o en formato viejo
- **Causa**: Datos v11 en Gist no se convertían
- **Solución**: `GistSync.read()` aplica `migrateData()` automáticamente

## Testing Manual

1. **Crear un Gist**: Click en "Sincronización" > token > gistId vacío
2. **Añadir localmente**: Agregar 5 juegos
3. **Sincronizar**: Click "Sincronizar" y verificar que aparecen en Gist
4. **Editar remotamente**: Ir a GitHub Gist y cambiar un juego
5. **Sincronizar nuevamente**: Verificar que cambios remotos se traen
6. **Verificar count**: Nunca debe haber pérdida de juegos (126 → 64 no debe ocurrir)

