# Acabado visual — plan

Estado: **plan aprobado, sin implementar** (25-09-2026). Sale de una revisión con capturas antes/después
de las ocho paletas en los dos modos. El «después» fue un prototipo inyectado solo en el recorrido de fotos,
nunca en `src/`. Aquí queda **solo lo que el mantenedor aprobó**; lo demás está en §4 y no entra en ningún tema.

---

## 1. Qué entra y dónde

| # | Cambio | Alcance | Ficheros |
|---|---|---|---|
| A | Cifras del panel: rejilla siempre completa, también en móvil, sin filete lateral | **Todos los temas** | `stats.scss` |
| B | Social: la puerta de entrada sin cajas anidadas | **Todos los temas** | `social.scss` |
| C | Lista vacía: icono en tinta de enlace y título en letra de titulares. **El texto no cambia** | **Todos los temas** | `_table.scss` |
| D | Ajustes: la ayuda de Sincronización con filete lateral; las guías y los enlaces legales, en filas | **Todos los temas** | `sync-card.scss`, `import.scss`, `settings.scss` |
| E | Cabecera de pantalla | **Solo Forja** | componente neutro + `forja/forja.scss` |
| F | Franja de color del género en el renglón y en la caja | **Solo Forja** | `GameTable.tsx`, `categoryTone.ts`, `forja.scss` |
| G | Mosaico: el canto de temple pasa a filete y el rescoldo toma el género | **Solo Forja** | `forja.scss` |
| H | Botones con radio de 15 px | **Solo Forja** | `forja.scss` |

Orden de PRs, de menos a más riesgo: **A** → **B + C + D** (solo CSS) → **G + H** (solo el skin de Forja) →
**F** (marcado) → **E** (componente y cifras) → documentación (§5).

---

## 2. Todos los temas

### A · Las cifras del panel, sin fichas sueltas

Hoy `.stats-tiles` es `repeat(auto-fit, minmax(9.5rem, 1fr))`: el número de columnas lo decide el ancho, y la
última fila sale con lo que sobre. A 1280 px el resumen general son 7 + 1, con «Reseñas» sola en su fila.

**La cantidad de fichas no es fija**, así que la regla tiene que valer para cualquiera. Hay cuatro rejillas y
cada ficha se monta o no según los datos:

| Rejilla | Fichas |
|---|---|
| Resumen general (`StatsPanel`) | hasta 8 |
| Año (`YearPanel`) | 1–5 |
| Vergüenza (`ShameCard`) | 1–4 |
| Próximos (`WishlistCard`) | 1–3 |

**Cómo se hace, solo con CSS:**
- La rejilla pasa a **12 pistas fijas** (`repeat(12, minmax(0, 1fr))`) y cada ficha dice cuántas ocupa.
- `.stats-tiles` pasa a ser contenedor (`container-type: inline-size`) y las fichas miden **su** rejilla, no la
  ventana. Así vale igual en el panel propio y en el perfil de un amigo, que es más estrecho.
- El resto de dividir las fichas entre las columnas se lee con `:has()` sobre el propio contenedor, y la última
  fila se reparte el ancho.
- Ningún componente cambia.

**Columnas según el ancho de la rejilla** (una ficha no baja de ~8,5–9,5 rem):
- ≥ 40 rem: 4 por fila.
- ≥ 30 rem: 3 por fila.
- ≥ 17 rem: 2 por fila. Es un teléfono normal: 360–412 px dejan ~285–335 px de rejilla.
- Por debajo: 1 por fila (teléfonos de 320 px).

**Reparto resultante** (cada cifra es una fila; nunca queda una ficha sola más estrecha que las de arriba):

| Fichas | 4 columnas | 3 columnas | 2 columnas |
|---|---|---|---|
| 1 | 1 | 1 | 1 |
| 2 | 2 | 2 | 2 |
| 3 | 3 | 3 | 1 · 2 |
| 4 | 4 | 2 · 2 | 2 · 2 |
| 5 | 3 · 2 | 3 · 2 | 1 · 2 · 2 |
| 6 | 3 · 3 | 3 · 3 | 2 · 2 · 2 |
| 7 | 4 · 3 | 3 · 2 · 2 | 1 · 2 · 2 · 2 |
| 8 | 4 · 4 | 3 · 3 · 2 | 2 · 2 · 2 · 2 |

**En dos columnas y con un número impar, la ficha que va a todo el ancho es la primera**, «Juegos», que es la
cifra que abre el panel. Si la ancha fuera la última, sería la que menos se busca (decidido, §7).

**Y fuera el filete lateral** (`.stat-tile::before`). El tono de cada ficha se queda en la cifra y en el velo del
fondo: una vez, no tres. Ningún skin toca `.stat-tile` ni `.stats-tiles` (comprobado), así que el cambio es igual
en los ocho temas.

### B · Social: la puerta de entrada

Lo que se vio en la captura aprobada, en `social.scss`:
- **El paso que aún no toca** (`.hub-gateway-stage` sin `.is-current` ni `.is-done`) se queda sin fondo, sin borde
  y sin sombra. El paso actual no cambia.
- **El estado técnico:**
  - `.hub-gateway-details` se queda sin fondo y sin borde.
  - Cada `.hub-status-card` pierde la caja y se queda con un **filete lateral de 2 px**, que conserva el color de
    su estado: `is-pending` en acento al 25 %, `is-ok` en éxito.
- **El botón del paso actual baja de alto** (`min-height` de 3,8 rem al alto de su contenido). En la captura salía
  así y se aprobó así; el ancho no cambia.
- Estas clases solo se usan en `SocialHub.tsx` (la puerta de entrada), así que no hay otras pantallas afectadas.
- El paso **ya dado** conserva su tinte verde: es la señal de hecho (decidido, §7).

### C · La lista vacía

- `.table-empty-icon`:
  - opacidad de .4 a .85 y color `--fg-link`;
  - tamaño de 3 a 3,4 rem;
  - la flotación se queda como está.
- `.table-empty-title`: `--font-display`, `--fs-xl`, color `--text`.
- **El texto de siempre**, sin línea secundaria: «No hay juegos aquí todavía» y las dos acciones.
- Hay que mirarlo en Persona: sus titulares llevan la letra por enumeración de selectores y el título podría
  salir sin su cursiva.

### D · Ajustes

- **`.sync-help`** («¿Qué es GitHub Gist?», «Cómo configurar»): sin fondo, sin borde y sin radio; queda un filete
  lateral de 2 px en `--hair`. El `code` de dentro conserva su fondo.
- **`.import-guide-block`** (los desplegables de Integraciones): filas separadas por `--hair` arriba, más un
  filete de cierre abajo en la última, sin fondo ni radio. Hay que comprobar que el desplegado abierto y el caret
  se siguen leyendo sin la caja.
- **`.settings-legal-link`**: filas con filete inferior, sin fondo ni radio. **El hover no se pierde**: hoy cambia
  fondo y borde; pasa a `--overlay-hover` de fondo sobre la fila, sin borde. `:focus-visible` no cambia.

---

## 3. Solo Forja

Regla del skin (`forja.scss`): el carácter sale del color y de la letra, no de un decorado. Las cuatro piezas la
respetan: ninguna añade textura, solo tono, jerarquía y canto.

### E · Cabecera de pantalla

**Qué es:**
- Rótulo en versales (`--font-label`, con el punto del acento).
- Título en `--font-display` a `--fs-3xl`.
- Hasta tres cifras en la mono.

**Dónde sale:**

| Pantalla | Rótulo | Título | Cifras |
|---|---|---|---|
| Las 4 listas | Biblioteca | nombre de la lista | juegos · horas (no en Próximos) · nota media (solo Completados) |
| `/stats` | Estadísticas | «Todo lo que has jugado» / «Tu 2026» según el alcance | — (ya están en las fichas) |
| `/ajustes/*` | Ajustes | nombre del grupo | — |

No sale en Social, Logros, Premios, Admin, Legal, Bandeja ni en las sub-rutas del panel.

**Cómo, sin romper «componentes neutros»:**
- Un componente `ScreenHeader` neutro, que en la base es `display: none` y que el skin de Forja enciende. Otro tema
  podría adoptarlo mañana sin tocar TypeScript.
- Va con `aria-hidden="true"` y **no sustituye** al `<h1 class="sr-only">` de `main`. Así la lectura con lector de
  pantalla queda igual en los ocho temas y no hay dos `h1`. Todas sus cifras están ya en otra parte: el recuento
  en la pestaña, horas y nota en el panel.
- **Las cifras salen del viewmodel**, no del almacenamiento. La nota media usa la misma cuenta y la misma escala
  que la ficha del panel: estrellas `/5`, o `/100` con la escala de nota.
- **Listas:** antes de `.tabs`, en su misma banda de superficie; en Forja, `.tabs` baja su `padding-top` de
  3,4 rem.
- **Panel y Ajustes:** primer hijo de `main`.
- **Sin el carril de los flotantes** (§4), la cabecera necesita un `padding-right` que libre el botón de tema
  flotante (42 px + 14 px), o las cifras caen debajo.
- **En el teléfono** va en el flujo: se va al bajar, no es fija. Es donde más se nota, porque allí las pestañas
  son solo iconos y hasta ahora nada decía en qué lista estás. Cuesta ~70 px de alto.
- **El virtualizador** mide desde la ventana: hay que comprobar su desfase con la cabecera encima, con 150+ juegos.

### F · Franja de color del género

- **El elemento:** un `<span className="row-tone" aria-hidden>` dentro del renglón (`td:first-child`) y de la caja
  (`.game-card`), con `style={{ '--row-tone': var(--cat-N) }}` del **primer género**.
- **Un helper nuevo** junto a `categoryToneStyle` en `core/constants/categoryTone.ts`: `categoryToneVar(nombre)`,
  que devuelve `var(--cat-N)`.
- **La variable es `--row-tone`, no `--cat`**: `--cat` lo heredarían los chips de plataforma, que no llevan tono
  propio y saldrían teñidos.
- **Es un elemento y no un pseudo:** el `::before`/`::after` de la celda ya los usa la base para la carátula del
  renglón (`has-cover`).
- **Cómo se pinta:** en la base, `display: none`. En Forja, absoluto a la izquierda, 3 px de ancho y retirado
  12 px de arriba y de abajo, porque a sangre choca con el radio (la misma lección que el medidor de su caja).
- Sin género no hay franja.
- Con las carátulas encendidas, comprobar que queda por encima del velo de la portada.

### G · El mosaico sin carátula

En `:root[data-palette="forja"] .game-card.is-flat`:
- El canto izquierdo de 3 px en temple pasa a filete de 1 px en `--hair`, porque ahora ese sitio es de la franja
  del género.
- El rescoldo del pie toma `var(--row-tone, var(--steam))` al 20 % (hoy `--steam` al 22 %). Es lo que convierte la
  parrilla en colección.
- Actualizar el comentario «LA CAJA SIN CARÁTULA = EL LINGOTE», que describe el canto de temple.

### H · Botones con radio de 15 px

- **La ficha:** `--forja-btn-radius: 15px` en el skin. No es uno de los radios del tema (6/10/16) y por eso se
  declara aparte, no como literal suelto.
- **Lo toman:** los botones de acción, `.btn` (primario, secundario, peligro, «Pasar a en curso», los `label.btn`
  de importar) y `.hub-gateway-btn` (hoy .8 rem).
- **Se quedan como están:**
  - `.btn-icon` y `.fab`, que son círculos;
  - `.btn-toggle` y `.hub-seg-btn`: son segmentados y filtros, y `DESIGN.md §7` los quiere en píldora en todos los
    temas (decidido, §7).

---

## 4. Lo que NO entra (en ningún tema, tampoco en Forja)

- Carril de los flotantes (el «+» sigue pudiendo tapar «Eliminar» y la insignia de la fila).
- Candado apagado para el «no».
- Campo de etiquetas sin marco doble y sin las pistas repetidas.
- Listado sin cajas (buscador y contenedor de la tabla).
- Nombre del juego un paso más grande.
- Textos nuevos para los vacíos.
- Cabecera y franja de género en los otros siete temas.
- Tinte cálido del claro de Forja (su frío es a propósito).
- Las erratas de `DESIGN.md` que no tocan esto (§8 frente a §1 sobre imágenes, «seis temas» en §9, columna de
  Persona en §3).

---

## 5. Documentación, en el mismo PR que cada cambio

- **`DESIGN.md §4`:**
  - «Fila de tabla»: el lomo de 3 px existe solo en Forja; hoy lo promete para todos.
  - «Estados vacíos»: icono en `--fg-link` y título en letra de titulares.
  - Cifras del panel: la regla de la rejilla completa.
- **`DESIGN.md §5`:** la «(Propuesta)» de la cabecera pasa a hecha, en Forja.
- **`DESIGN.md §7`:** los botones de Forja van a 15 px.
- **`docs/temas.md §3`:** la cabecera es una pieza que un tema puede encender.

---

## 6. Verificación

- `npm test` y `npx playwright test tests/e2e/a11y.test.ts`, ocho paletas × dos modos. La cabecera va
  `aria-hidden`, pero su texto se ve y tiene que cumplir el contraste igual.
- **Test nuevo para A:** con 1–8 fichas y a 4, 3, 2 y 1 columnas, ninguna fila queda incompleta. Se comparan los
  rectángulos de las fichas de cada fila contra el ancho de la rejilla.
- Capturas en claro y oscuro de las pantallas tocadas, en los ocho temas para A–D y en Forja para E–H, más el
  panel a 320, 360, 390 y 412 px.
- Listado de Forja con 150+ juegos, para que entre la virtualización con la franja y la cabecera.

---

## 7. Decisiones (cerradas el 25-09-2026)

1. **Fichas impares en dos columnas:** a todo el ancho va la **primera**, «Juegos».
2. **Botones de Forja:** los segmentados **no** cambian; siguen en píldora por `DESIGN.md §7`.
3. **Social, paso ya dado:** **conserva** su tinte verde; solo el pendiente se queda sin caja.
