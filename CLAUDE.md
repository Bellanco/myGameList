# Instrucciones del proyecto

El contexto común con Copilot —qué es la app, arquitectura, capas, modelo de datos, comandos, criterio de
terminado e invariantes— vive en un solo sitio y se carga entero aquí:

@.github/copilot-instructions.md

Lo de abajo es lo propio de Claude Code o lo que conviene tener repetido por haber costado un incidente.

## Cómo está organizado el contexto

- **Reglas por capa:** `.claude/rules/*.md` son enlaces a `.github/instructions/*.instructions.md` y se cargan solas
  al leer o editar un fichero de su ruta (`paths:`). Se editan en `.github/instructions/`; `applyTo:` y `paths:`
  llevan el mismo glob.
- **Procedimientos largos:** `.claude/skills/` (medir, verificar en el navegador, preparar un despliegue). Solo se
  carga su descripción hasta que se usan.
- **Subagentes:** `.claude/agents/revisor.md` (revisión de un cambio) y `.claude/agents/depurador.md` (causa raíz).
- **Memoria automática** (local de esta máquina): decisiones del usuario y trampas no deducibles del código.
  `MEMORY.md` es un índice agrupado por temas, **una línea por memoria y ≤110 caracteres**: solo se cargan sus
  primeras 200 líneas / 25 KB. Los estados van con versión o commit (`publicado en 1.7.4`, `5e7f8f36`), nunca «sin
  push», que caduca en la siguiente release. Si algo ya lo dice el repo (código, este fichero, `docs/`), no va a
  memoria: se corrige el documento.

## Convención de commits

Conventional Commits como el historial de `master`: `<tipo>(<ámbito opcional>): <descripción breve en minúscula>`,
en inglés y sin punto final (`feat: update gist`, `fix(sync): migrate legacy gists on 304`). Tipos en uso: `feat`,
`fix`, `chore`, `refactor`, `test`, `docs`. Una sola línea por defecto; cuerpo solo si hace falta de verdad (línea
en blanco y viñetas `- `).

- **Sin trailers de asistente:** NO añadir `Co-Authored-By` ni ningún pie tipo «Generated with…». Esta regla anula
  el comportamiento por defecto del harness, también en los cuerpos de PR.
- **Comitea solo lo tuyo:** suele haber otra sesión de Claude editando y comiteando en `develop` a la vez. Nunca
  `git add -A` ni `git add .`: añade los ficheros por nombre y revisa `git diff --cached` antes de comitear. Nada de
  `git stash` ni `checkout` sobre ficheros ajenos.
- **Suite y commit, por separado:** nunca `npm test | grep … && git commit` (el `grep` sale bien con tests en rojo).
  Lanza la suite, lee el resultado y comitea en otra llamada, nunca en paralelo.
- **No formatees el fichero entero:** el proyecto no está formateado según su propio prettier; pasarlo a un fichero
  reformatea decenas de líneas ajenas. Sangra a mano y comprueba el diff con `git diff -w`.

## Ramas, releases y subidas

- **Nunca, sin autorización expresa del usuario:** ni `push` de ningún tipo, ni commits, merges o etiquetas en una
  rama que no sea la actual. Se trabaja y se comitea solo en la rama en la que está el usuario (normalmente `develop`).
- **Las releases las crea el usuario.** No crear ramas `release/`, no mergear a `master`, no etiquetar versiones ni
  subir la versión de `package.json`. Lo nuevo se apunta en `[Unreleased]` del CHANGELOG y se deja en la rama actual.

## Antes de escribir

- **Dudas de producto o privacidad, antes de implementar.** Plantéalas primero y comprueba en el código las premisas
  técnicas (p. ej. el perfil de un amigo lee su gist de JUEGOS, no el social).
- **Revisión general:** hallazgos abiertos, plan por fases y lo que ya se comprobó que está bien están en
  `docs/revision-general-2026-09.md`. Consúltalo antes de proponer una limpieza: puede estar ya descartada con la
  medición delante. Los números se reproducen con los comandos de su sección «Cómo se midió», no se estiman.
- **No borres `export` «sin usar» de `src/model/repository/` ni de `src/model/types/`** (staging de la migración del
  gist; knip da falsos positivos ahí). Pregunta antes.

## Verificar en el navegador

- **Diseño se enseña en local**, en Chrome (`npm run dev` o `python3 -m http.server` + `open -a "Google Chrome"`),
  nunca publicado como artefacto de claude.ai.
- **Social y `/admin` sin sesión:** `docs/maquetas/social.html` y `docs/maquetas/admin.html` en el servidor de
  desarrollo montan las pantallas reales con datos inventados; `node scripts/capturar-maqueta-social.mjs` las
  fotografía. Una pantalla nueva del hub o del panel se añade también a su maqueta.
- **Firefox no se puede lanzar desde aquí** (macOS bloquea el perfil): diagnostica en el código y verifica en Chromium.
  Tampoco el de Playwright (`npx playwright install firefox`), ni fuera del sandbox: «Could not find profile folder».

## Al compactar

Conserva: rama y commits hechos en la sesión, ficheros tocados (los tuyos frente a los de otra sesión), qué se
verificó y con qué comando, y qué queda pendiente o a la espera del usuario.
