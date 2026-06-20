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
- [ ] **Fase 7 — E3** (EN CURSO): el canal social deja de leer el gist de juegos en crudo de otros usuarios (`readPublicGamesGistById` en `useSocialViewModel`); usar solo el gist social index-only. Mejora privacidad + desacopla el formato del gist de juegos.
- [ ] **Fase 8 — E4**: chunking del gist de juegos (gated, por-usuario, tras E3 + actualizar tus dispositivos): implementar `distributeIntoChunks` de verdad en la escritura + `chunkIndex` + lectura de chunks (extender `unwrapGamesFile`) + poblar `gamesChunks`/`socialChunks` en `privateConfig`. Decisión: chunks como FICHEROS del mismo gist (`gistId: null`).
- [ ] **Fase 9 — Limpieza**: borrar `src/model/migration/legacy*.ts` + fallbacks (token legacy, lectura plano del gist, claves localStorage viejas) cuando no queden datos ni clientes viejos.

## D. Notas / deuda menor
- `myGames.json` en la raíz = **datos reales del usuario** (untracked). NO commitear (`.gitignore` solo cubre `/data/myGames.json`).
- `dist/index.html` se regenera en cada `build`; no commitear en fases de código.
- **M4b** (extraer `persist()` de `useGameListViewModel`): EVALUADO Y OMITIDO por criterio (MVVM correcto); no es deuda.
- Cobertura de test de componente ampliable: `GameTable`, `FormModal`, editor de perfil social, estados autenticados con datos.
- `npm update` (deps dentro de rango) quedó pendiente por red en sesiones previas; majors (ESLint 10, html-validate 11) descartados por decisión.
