# Receta: crear, editar y borrar un tema

Todo lo que hay que tocar para que un tema exista, **y nada más**. El porqué del sistema de capas está en
[`../DESIGN.md`](../DESIGN.md); esto es el manual de la casa.

La regla de la que cuelga todo: **un tema es una carpeta**. Su color, su letra, su skin y su ficha viven juntos,
y los únicos sitios donde se le nombra desde fuera son cuatro índices —tres líneas y una entrada de mapa—.
Si algo se te olvida, `npm test` te lo dice por su nombre: `tests/unit/themes.test.ts` comprueba el contrato.

---

## 1. Dónde vive un tema

| Pieza | Fichero | Cuándo se carga |
|---|---|---|
| **Color** (CAPA 2 + 2b) | `src/styles/themes/<id>/_colors.scss` | Bundle base: pinta el primer fotograma |
| **Skin** (CAPA 3) | `src/styles/themes/<id>/<id>.scss` | Chunk perezoso, al activar la paleta |
| **Fuentes** | `src/styles/themes/<id>/_fonts.scss` | Con su skin (lo genera `scripts/vendor-fonts.mjs`) |
| **Ficha** | `src/core/constants/themes/<id>.ts` | Arranque (selector, `theme-color`, sincronización) |
| **Voz social** | `src/core/constants/themes/<id>.social.ts` | Chunk del hub social |

Y los cuatro sitios que lo nombran desde fuera:

| Índice | Qué pone | Qué pasa si falta |
|---|---|---|
| `src/core/constants/palettes.ts` | el id en `THEMES` | el tema no existe para el TypeScript: ni selector, ni tipo `PaletteId` |
| `src/core/constants/themes/social.ts` | el id en `SOCIAL_VOICES` | no compila (el `Record<PaletteId, …>` queda incompleto) |
| `src/styles/themes/_index.scss` | `@use './<id>/colors' as <id>;` | el tema se ve **sin colores**: hereda los de CAPA 1 |
| `index.html` (mapa `BG`) | su `--bg` en los dos modos | la barra del navegador enseña un color que la página no tiene |

Más uno condicional: si el tema **tiene skin y no es el de por defecto**, su cargador va en `SKIN_LOADERS`
(`src/view/hooks/paletteSkin.ts`). Si es el de por defecto, su skin lo trae `src/styles/index.scss`, porque es
el que pinta el primer fotograma y no puede llegar tarde.

---

## 2. Crear un tema

1. **La ficha.** Copia `src/core/constants/themes/forja.ts` a `<id>.ts` y cambia identidad, `accent`, `bg` y las
   dos frases de `voice`. Copia igual `forja.social.ts` a `<id>.social.ts` con sus dos frases.
   *El guiño va integrado en la frase, sin comillas ni atribución: es el tono de la casa.*
2. **Los índices de TypeScript.** Añade el id a `THEMES` (`constants/palettes.ts`) y a `SOCIAL_VOICES`
   (`constants/themes/social.ts`). Con esto el tipo `PaletteId`, el selector de Ajustes, la persistencia local y
   la sincronización se enteran solos: no hay nada más que tocar en TS.
3. **El color.** Crea `src/styles/themes/<id>/_colors.scss` con los dos bloques gemelos —`:root[data-palette="<id>"]`
   y su `[data-theme="light"]`— y los tokens que el test exige (los ~25 de CAPA 2, los catorce de la rampa 2b y
   `--tint-rgb` en claro). **Mide los contrastes** antes de darlo por bueno: §4.
4. **El índice de estilos.** Añade `@use './<id>/colors' as <id>;` a `src/styles/themes/_index.scss`.
5. **El anti-flash.** Añade su `--bg` al mapa `BG` de `index.html`. Como el `<script>` es inline, **recalcula el
   hash de la CSP** y ponlo en `public/_headers`:
   ```bash
   node -e "const h=require('fs').readFileSync('index.html','utf8');const s=h.match(/<script>([\s\S]*?)<\/script>/)[1];console.log(require('crypto').createHash('sha256').update(s).digest('base64'))"
   ```
6. **El skin (opcional).** Si el tema tiene dirección de arte propia, `src/styles/themes/<id>/<id>.scss` con UN
   bloque `[data-palette="<id>"]`, y su cargador en `SKIN_LOADERS`. Sin skin, el tema usa solo sus colores, que
   es una opción legítima: el tema por defecto es casi eso.
7. **Fuentes propias (opcional).** Añade una entrada `{ slug: '<id>', comment, families }` a
   `scripts/vendor-fonts.mjs` y ejecútalo: deja el `.woff2` en `public/fonts/` y escribe
   `src/styles/themes/<id>/_fonts.scss`. Tu skin lo usa con `@use './fonts';`.
8. **Audítalo.** `npm test` (contrato) y `npx playwright test tests/e2e/a11y.test.ts` (axe recorre las paletas
   del registro, así que el tema nuevo entra solo en la auditoría: cada paleta × claro y oscuro × cada pantalla).

---

## 3. Editar un tema

| Quiero cambiar… | Se toca |
|---|---|
| un color, un fondo, la rampa de géneros | `themes/<id>/_colors.scss` (y el `bg` de la ficha + `index.html` si cambia `--bg`) |
| la letra | `themes/<id>/<id>.scss` (`--font-*`), y `vendor-fonts.mjs` si es una familia nueva |
| la forma: radios, filetes, texturas, ornamento | `themes/<id>/<id>.scss` |
| la forma de **las gráficas del panel** | la ficha `--stats-*` en `themes/<id>/<id>.scss` (ver abajo) |
| el nombre visible o la muestra del selector | `constants/themes/<id>.ts` |
| lo que dice al fallar o al quedarse sin red | `constants/themes/<id>.ts` (app) o `<id>.social.ts` (hub) |

**La ficha de gráfica.** Las veinte gráficas del panel de estadísticas NO se doblan enumerándolas: `stats.scss`
declara siete palancas con los valores de la casa y cada tema las rellena en un bloque `.stats-hub`, que alcanza
a todas a la vez —las de hoy y la que se añada mañana—:

| Palanca | Qué decide | Casa |
|---|---|---|
| `--stats-radius` | el canto de una pieza (baldosa, escalón, carril) | `8px` |
| `--stats-bar` | el canto de una barra o de su pista | `2px` |
| `--stats-pill` | lo que en la casa es una píldora (carril del top, eje) | `--radius-pill` |
| `--stats-dot` | el punto de una serie: lunar o píxel | `50%` |
| `--stats-cap` | el remate de una línea de serie | `round` |
| `--stats-join` | su vértice, y el de los polígonos del radar | `round` |
| `--stats-render` | `crispEdges` donde el tema no admite curva suavizada | `auto` |
| `--stats-num` | la familia de las **cifras** de gráfica | `inherit` |

Lo que NO entra ahí es el color: ese viaja por `--stats-c/v/e/p` y la rampa `--cat-N`. Y `--stats-num` es para el
DATO suelto: una frase con una cifra dentro (`.week-heat-stats dd`) se queda fuera, o en una mono ancha salta de
línea. El enjambre tiene además su propia ficha `--bee-*`, con marco, velo y trama, por si el tema quiere ir más
lejos en esa gráfica.

Nada de esto obliga a tocar otro tema: cada bloque está aislado en su `[data-palette]`. Lo que **sí** es común
—las medidas de CAPA 0 y las derivaciones de CAPA 1— vive en `src/styles/_base.scss` y cambiarlo los cambia todos.

---

## 4. Medir antes de dar por bueno un color

`tests/e2e/a11y.test.ts` audita **cada paleta × cada modo × cinco pantallas** con axe, y ahí no se negocia: el
texto pide 4,5:1 y lo no textual (anillo de foco, relleno de género, estrellas) 3:1, siempre contra las **cuatro**
superficies del propio tema. Conviene medir antes con una cuenta rápida en vez de esperar al recorrido:

- texto, atenuado y **pestaña inactiva** (`--text-dim`, que es texto normal sobre `--surface`): ≥ 4,5:1
- `--fg-link` ≥ 4,5:1 · `--focus-ring` ≥ 3:1 · `--cat-N` ≥ 3:1 · `--cat-N-fg` ≥ 4,5:1
- `--on-accent` sobre el relleno del acento: ≥ 4,5:1. Si sobre el acento a pelo no llega, oscurece `--accent-fill`
  en ese modo (no toques `--steam`, que es la identidad)
- entre superficies vecinas conviene ≥ 1,15:1, o una tarjeta sobre el fondo solo existe por su sombra

Y deja escrito en el fichero el peor caso de cada uno, como hacen los demás: el siguiente que lo toque no tiene
por qué volver a medirlo todo para saber cuánto margen hay.

---

## 5. Borrar un tema

Borra su carpeta `src/styles/themes/<id>/` y sus dos ficheros de `src/core/constants/themes/`, y quita su línea
de los cuatro índices (§1) y de `SKIN_LOADERS`. El test avisa de cada resto que quede: una carpeta huérfana, una
ficha suelta, un `@use` que ya no apunta a nada.

**Antes de borrarlo**, recuerda que hay gente con ese tema guardado en su dispositivo: `parsePaletteId()` valida
contra el registro y cae al tema por defecto, así que no se rompe nada — simplemente cambian de tema sin haberlo
pedido. Si el tema era popular, mejor dejarlo.

---

## 6. Cambiar cuál es el tema por defecto

Tres cosas, y el test comprueba las tres:

1. `DEFAULT_PALETTE` en `constants/palettes.ts` (y ponlo el primero de `THEMES`).
2. Mueve el skin: el nuevo sale de `SKIN_LOADERS` y entra en `styles/index.scss`; el viejo hace el camino
   contrario. Es lo que decide qué viaja en el arranque de todo el mundo.
3. En `index.html`, el respaldo `palette = '<id>'` y el `<meta name="theme-color">` del `<head>`, que es el color
   que se ve antes de ejecutar una sola línea. Recalcula el hash de la CSP (§2.5).

Vigila el presupuesto de arranque (`node scripts/ci-validate.js`): el skin del tema por defecto lo descarga todo
el mundo, así que un tema de casa con mucha textura sale caro para quien nunca lo elige.
