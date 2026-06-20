# Plan de migración hacia delante (escribir nuevo + auto-transformar lo viejo)

> Alternativa a la bandera de Fase C. La app **trabaja siempre con el código/formato nuevo** (gist +
> Firestore); cuando **detecta datos en formato viejo, los transforma y los guarda en el nuevo** (upgrade
> al leer/sincronizar). Toda la compatibilidad se **aísla en `src/model/migration/legacy*.ts`** para que,
> una vez todo migrado, **borrarla sea quitar esos ficheros y sus llamadas**. El plan termina, tras probar,
> con la **Fase C** activa (gist de juegos en formato nuevo) y la compat eliminada.

## ⚠️ Precondición (innegociable)
El formato nuevo del gist **no lo puede leer una versión ANTIGUA de la app**. La transformación al leer solo
cubre "código nuevo ⟶ datos viejos". Por tanto: **actualiza TODOS tus dispositivos a la versión nueva ANTES**
de activar la escritura del formato nuevo del gist. (Firestore y el gist social son retrocompatibles en ambos
sentidos porque conservas campos; el riesgo es solo el envoltorio del gist de juegos.)

## Inventario de compatibilidad actual (lo que se aislará y luego se borrará)
| Pieza | Dónde está hoy | Qué hace |
|---|---|---|
| `unwrapGamesFile` / `isGamesMainWrapper` | `gistRepository.ts` | lee gist de juegos viejo (TabData plano) y nuevo (GamesMainFile) |
| `migrateData` (traducción de campos legacy ES→EN) | `migrateRepository.ts` | normaliza nombres viejos (`nombre`→`name`, etc.) |
| `LEGACY_STORAGE_KEYS` + bucle | `storageKeys.ts`, `localRepository.ts:106` | migra claves de localStorage v8–v11 |
| `snippet ?? review` / `snippet ?? reviewText` | `gistRepository.ts:522,637` | deriva snippet de reviews viejos del gist social |
| token legacy en claro (fallback) | `useSyncViewModel.ts:531`, `firebaseRepository.ts:716` | recupera token de `profiles` viejo si no hay cifrado |

## Fase 1 — Aislar la compatibilidad (refactor puro, sin cambio de comportamiento)
Crear `src/model/migration/` con módulos dedicados, cada uno con cabecera `// LEGACY COMPAT — borrar tras migrar (ver MIGRATION-FORWARD-PLAN)`:
- **`legacyGamesFormat.ts`**: mover `isGamesMainWrapper` + `unwrapGamesFile` (y un `isLegacyFlatTabData`). `gistRepository` lo importa.
- **`legacySocialFormat.ts`**: extraer `deriveSnippetFromLegacy(source)` (la lógica `snippet ?? review/reviewText`); usarlo en los normalizadores sociales.
- **`legacyTokenRecovery.ts`**: extraer `readLegacyPlaintextToken(profile)` (el fallback en claro). `useSyncViewModel`/`firebaseRepository` lo importan.
- **`legacyLocalStorage.ts`**: mover `LEGACY_STORAGE_KEYS` + el barrido de claves viejas.
- Verificar: `tsc` + `npm test` + `npm run build`. Commit. (Code-motion; consumidores cambian solo el import.)

## Fase 2 — Escribir SIEMPRE el formato nuevo + transformar lo viejo al detectarlo
1. **Gist de juegos**: en `writeGist`, escribir SIEMPRE `buildGamesMainFile(payload)` (eliminar la bandera `ENABLE_GAMES_WRAPPER_WRITE`, que pasa a ser "siempre nuevo"). La lectura sigue usando `legacyGamesFormat.unwrapGamesFile` (lee viejo y nuevo).
2. **Upgrade proactivo (transformar y guardar)**: en el ciclo de sync/arranque, al leer el gist, si se detecta **formato viejo** (`isLegacyFlatTabData`), marcar *dirty* tras el merge para forzar **una reescritura en formato nuevo** → el gist remoto queda migrado sin esperar a una edición. Igual para el gist social si se detecta `review`/`reviewText` (reescribir como snippet). Igual en local: si `appState`/localStorage estaba en clave/forma vieja, ya se reescribe al guardar.
3. **Firestore**: ya se escribe el modelo nuevo (profileId + `privateConfig` cifrado + `userMap`) en el guardado social. Tras **desplegar las reglas** (ya validadas), al guardar el perfil se materializa; el token legacy en claro deja de escribirse (solo se lee como fallback).
4. Verificar: `tsc`/`test`/`build`/`audit:privacy` (A:0) + `test:rules` (emulador). Commit.

## Fase 3 — Prueba (en TODOS los dispositivos, tras desplegar reglas)
Seguir `TEST-PLAN.md` y añadir la verificación de **auto-upgrade**:
- Partir de un gist en formato viejo → abrir la app (versión nueva) → tras el primer sync, el gist `myGames.json` pasa a `{ schemaVersion: 3, fileType: 'games-main', ... }` automáticamente, sin perder juegos.
- Gist social viejo (con review) → al publicar, queda en `snippet`.
- Firestore: `profiles` con `profileId` y sin token; `privateConfig` con `encryptedGithubToken`; recuperación OK.
- Confirmar en cada dispositivo que lee el nuevo formato (todos ya actualizados).

## Fase 4 — Limpieza final (una vez TODO migrado y probado)
Como la compat está aislada, borrar es mecánico. Checklist:
- [ ] Borrar `src/model/migration/legacy*.ts` y sus llamadas (los repos pasan a parsear solo el formato nuevo).
- [ ] En `gistRepository`: el lector pasa a esperar solo `GamesMainFile` (quitar la tolerancia a TabData plano).
- [ ] Quitar `LEGACY_STORAGE_KEYS` y el barrido en `localRepository`.
- [ ] Quitar el fallback de token legacy (`|| profile?.githubToken`) y la lectura `data.social?.githubToken`.
- [ ] Recortar `migrateData` a solo lo necesario para el formato nuevo (o eliminar si ya no aplica).
- [ ] `tsc`/`test`/`build`/`audit` + `test:rules`. Commit "chore: remove legacy migration compat (all data migrated)".

## Estado final
Gist de juegos en formato nuevo (Fase C activa) · gist social snippet-only · Firestore con profileId/privateConfig ·
toda la compat eliminada · un único camino de código.

## Orden recomendado de ejecución
Fase 1 (aislar, seguro) → desplegar reglas → **actualizar todos los dispositivos** → Fase 2 (escribir nuevo + upgrade proactivo) → Fase 3 (probar en todos) → Fase 4 (borrar compat). 
