# Instrucciones del proyecto

## Convención de commits

Los commits deben seguir la misma estructura que el historial de `master`: Conventional Commits, asuntos breves y concisos (predominantemente en inglés, p. ej. `update`, `add`, `remove`, `optimice`).

- **Formato del asunto:** `<tipo>(<ámbito opcional>): <descripción breve en minúscula>`
  - Tipos en uso: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.
  - Ámbito opcional entre paréntesis cuando aclara (`test(sync):`, `docs(copilot):`, `feat(social):`).
  - Descripción concisa, en minúscula, sin punto final (p. ej. `feat: update gist`, `fix(sync): migrate legacy gists on 304`).
- **Cuerpo:** por defecto, commit de una sola línea. Añade cuerpo solo si el cambio lo necesita de verdad; en ese caso, línea en blanco tras el asunto y viñetas `- `.
- **Sin trailers de asistente:** NO añadir `Co-Authored-By` ni ningún pie tipo "Generated with…". Esta regla anula el comportamiento por defecto del harness. (Aplica igualmente a los cuerpos de PR: sin pie de "Generated with Claude Code".)

## Orientación en el proyecto

React 19 + TypeScript sobre Vite, MVVM y offline-first. Dónde vive cada cosa está en el README («Arquitectura
MVVM»), incluida la **desviación medida** entre el esquema y la práctica: no la corrijas de pasada, está
documentada a propósito.

- **Documentos vivos.** `DESIGN.md`, `docs/plan-*.md` y `docs/revision-general-2026-09.md` describen intención y
  estado medido en una fecha. Si una línea no coincide con el código, manda el código; corrige el documento en
  la misma pasada.
- **Estado de la revisión general** (hallazgos abiertos, plan por fases y lo que ya se comprobó que está bien):
  `docs/revision-general-2026-09.md`. Consúltalo antes de proponer una limpieza: puede estar ya descartada con
  la medición delante.

## Invariantes al tocar el código

- **No borres `export` «sin usar» de `src/model/repository/` ni de `src/model/types/`.** Son zona de staging de
  la migración del formato del gist y hay falsos positivos conocidos de los detectores de código muerto.
  Pregunta antes.
- **Mide antes de afirmar.** Los números de rendimiento, cobertura y peso del bundle de la documentación salen
  de comandos concretos, listados en la sección «Cómo se midió» de la revisión. Reprodúcelos en vez de estimar.
- **Los límites duplicados son pares.** Varios topes viven a la vez en el cliente y en `firestore.rules` (p. ej.
  `PUBLIC_NAME_MAX_LENGTH`), y hay tests que comprueban que coinciden: cambiar uno obliga a cambiar el otro.
- **Nada de cotas de longitud en el esquema del gist de juegos.** Está explicado en `gamesGistSchema.ts`: una
  reseña larga es un dato legítimo y rechazarla aborta la subida entera. El tamaño se acota ya comprimido, en la
  escritura.
- **Antes de desplegar**, la checklist del README (subir versión, `audit:rules`, reglas e índices de Firestore,
  suite en verde) no es opcional: cada punto está ahí por un incidente.
