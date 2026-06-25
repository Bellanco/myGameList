# Instrucciones del proyecto

## Convención de commits

Los commits deben seguir la misma estructura que el historial de `master`: Conventional Commits, asuntos breves y concisos (predominantemente en inglés, p. ej. `update`, `add`, `remove`, `optimice`).

- **Formato del asunto:** `<tipo>(<ámbito opcional>): <descripción breve en minúscula>`
  - Tipos en uso: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`.
  - Ámbito opcional entre paréntesis cuando aclara (`test(sync):`, `docs(copilot):`, `feat(social):`).
  - Descripción concisa, en minúscula, sin punto final (p. ej. `feat: update gist`, `fix(sync): migrate legacy gists on 304`).
- **Cuerpo:** por defecto, commit de una sola línea. Añade cuerpo solo si el cambio lo necesita de verdad; en ese caso, línea en blanco tras el asunto y viñetas `- `.
- **Sin trailers de asistente:** NO añadir `Co-Authored-By` ni ningún pie tipo "Generated with…". Esta regla anula el comportamiento por defecto del harness. (Aplica igualmente a los cuerpos de PR: sin pie de "Generated with Claude Code".)
