# PENDIENTES — lo que NO está hecho (para que no se olvide)

> Índice vivo de todo lo que queda. Marcar `[x]` al completar. Detalle de cada fase en `MASTER-PLAN.md`.
> Última actualización: durante la Fase 7 (E3).

## A. Acciones del USUARIO (no son código — requieren navegador/despliegue)
- [ ] **Fase 0.1** — Probar B1–B5 en navegador real (perfil social, token cifrado en `privateConfig`, "recuperar desde Google", feed/perfil index-only). Ver `TEST-PLAN.md`.
- [ ] **Fase 0.2** — `npm run test:rules` (emulador, debe dar 7/7) y luego `firebase deploy --only firestore:rules`.
- [ ] **Fase 0.3** — Tras desplegar, **re-guardar el perfil social una vez** (materializa el token cifrado y dispara el `deleteField()` que borra el token en claro legacy).
- [ ] **Fase 0.4** — **REVOCAR en GitHub el token** que pasó por el chat (seguridad).
- [ ] **Verificación M3 en navegador** — flujo social completo: gateway→login Google, crear/enlazar gist social, guardar perfil+favoritos+visibilidad, feed/directorio, detalle de actividad y de perfil, arrastre horizontal del feed, sign-out. (No hay test de componente que cubra runtime con datos reales; solo smoke.)

## B. APLAZADO — requiere verificación en navegador / 2 dispositivos
- [ ] **6.2a — Estabilizar `profileId` entre dispositivos**: hoy `getOrCreateProfileId()` es UUID aleatorio LOCAL y `establishProfileIdentity` sobrescribe `userMap` con el del dispositivo actual; NADA recupera el profileId de Firestore al login. Hay que recuperarlo de `privateConfig`/`userMap` al iniciar sesión y NO sobrescribir el existente. (Bloquea 6.2b.)
- [ ] **6.2b — uid→profileId en el gist social**: `actorUid→actorProfileId`, `fromUid→fromProfileId`; compat de lectura en `legacySocialFormat.ts` (mapear + migrar la `key` de activity y la ruta `/social/user/:actorUid/...`); extender el schema Zod (6.1) a la forma v2; `schemaVersion: 2`.
- [ ] **6.2 — `consent`** en el gist social: necesita un **flujo de consentimiento (UX)** que aún no existe; no escribir un bloque hardcodeado.
- [ ] **6.4 — Delta-sync + escritura granular** (movido de E2): reescribir el camino caliente a `upsertGame`/`deleteGame` + un **consumidor de `syncQueue`**; `appState` deja de ser la fuente del gist. ALTO RIESGO (pérdida de datos) → probar en navegador.

## C. FASES del plan aún por hacer
- [x] **Fase 7 — E3** (HECHA `f23289a`): el canal social ya NO lee el gist de juegos en crudo de otros usuarios; listas
      compartidas index-only vacías para ajenos; detalle muestra nombre/rating/snippet del evento; metadatos solo para
      juegos propios (fallback local). `readPublicGamesGistById` queda SIN USO → candidato a borrar en Fase 9.
      ⚠️ Verificar en navegador: el detalle de actividad de OTROS usuarios ya no muestra plataformas/géneros (degradación
      index-only intencionada); confirmar que la pantalla se ve bien sin ese bloque.
- [x] **Fase 8 — E4** (IMPLEMENTADA pero GATED `ab1035e`): builder multi-fichero (`buildGamesFiles`), escritura
      multi-fichero con borrado de chunks obsoletos, ensamblado en lectura (`assembleChunkedGames`), round-trip tests.
      `ENABLE_GAMES_WRAPPER_WRITE` SIGUE EN `false` → INERTE; camino plano byte-idéntico (64+2 tests verdes).
      ⏳ **Activar requiere (acción usuario)**: actualizar TODOS tus dispositivos a esta versión + probar en navegador +
      poner la bandera en `true`. Solo entonces el gist de juegos pasa a multi-fichero. Falta aún: poblar
      `privateConfig.gamesChunks` con el chunkIndex al escribir (hoy el chunkIndex vive en el ancla; los chunks se
      reconstruyen al leer el gist, así que no es bloqueante, pero conviene para recuperación tras reinstalar).
- [ ] **Fase 9 — Limpieza** ⚠️ PREMATURA AHORA: borrar `src/model/migration/legacy*.ts` + fallbacks (token legacy,
      lectura plano del gist, claves localStorage viejas) SOLO cuando no queden datos ni clientes viejos. Hoy NO se cumple:
      la bandera de chunking está OFF, 6.2/6.4 aplazados, reglas sin desplegar, sin verificación en navegador. Borrar la
      compat ahora ROMPERÍA la lectura de datos viejos. → Mantener hasta completar el corte verificado.
      - Slice SEGURO disponible ya (no depende de migración de datos): borrar `readPublicGamesGistById` (muerto tras E3).

## D. Notas / deuda menor
- `myGames.json` en la raíz = **datos reales del usuario** (untracked). NO commitear (`.gitignore` solo cubre `/data/myGames.json`).
- `dist/index.html` se regenera en cada `build`; no commitear en fases de código.
- **M4b** (extraer `persist()` de `useGameListViewModel`): EVALUADO Y OMITIDO por criterio (MVVM correcto); no es deuda.
- Cobertura de test de componente ampliable: `GameTable`, `FormModal`, editor de perfil social, estados autenticados con datos.
- `npm update` (deps dentro de rango) quedó pendiente por red en sesiones previas; majors (ESLint 10, html-validate 11) descartados por decisión.
