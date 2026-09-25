---
version: 1
name: mis-listas-design
description: |
  Biblioteca personal de videojuegos, 100 % tipográfica: no hay ni una carátula ni una imagen de juego
  en toda la aplicación, así que el color, la forma y la letra hacen el trabajo que en otras webs hace
  el arte de portada. Ocho TEMAS coexisten como mundos completos —uno neutro de casa y siete tomados de
  juegos— y cada uno redefine los mismos ~26 tokens de identidad, más su propia tipografía, sus radios y
  su ornamento. Cada tema tiene además modo claro y oscuro, y no son el mismo diseño invertido: en varios
  el claro cuenta otra historia (la Aperture antigua frente a la moderna, el códice frente al cogitador).
  El sistema se apoya en CUATRO CAPAS: medidas (CAPA 0), color base derivado (CAPA 1), identidad de cada
  tema (CAPA 2) y skin expresivo cargado bajo demanda (CAPA 3). La regla que lo sostiene: nada se escribe
  dos veces — si un valor se repite, es una ficha.
---

# DESIGN.md — Mis Listas

> Fuente de verdad del sistema visual. Lo común vive en `src/styles/_base.scss` (medidas y derivaciones) y el
> color de cada tema en `src/styles/themes/<id>/_colors.scss`; este documento explica
> **qué significa cada uno y cuándo usarlo**. Si un valor de aquí no coincide con el código, manda el código.
>
> Formato inspirado en [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md).

---

## 1 · Tema visual y atmósfera

- **Densidad alta.** Es una herramienta de gestión: bibliotecas de 200+ juegos, tabla virtualizada. El aire
  se gasta entre bloques, no dentro de las filas.
- **Tipográfica de partida, con imagen opcional.** El color del **género** hace de arte de portada —es lo que
  llena la pantalla sin pedirle nada a nadie— y sobre eso, quien encienda las carátulas (apagadas de fábrica: es
  ese interruptor el que autoriza a preguntar por títulos a IGDB) las ve en la ranura del mosaico, en la franja
  recortada del renglón y de fondo de una reseña, siempre con el velo del tema delante. Sin imagen no queda
  hueco: debajo está siempre la portada de casa. En lo ajeno —la estantería y las reseñas de otra persona— va
  además con el rango, hoy mithril, porque resolver un catálogo que no es el tuyo es el gasto que menos se puede
  acotar del servicio.
- **La identidad la pone el tema, no la aplicación.** Los componentes son neutros; el carácter entra por
  CAPA 2 (color) y CAPA 3 (letra, radios, texturas, ornamento).
- **Oscuro por defecto**, claro de primera clase. Las dieciséis combinaciones (8 temas × 2 modos) se auditan con
  axe en `tests/e2e/a11y.test.ts`: ninguna puede bajar de AA.

---

## 2 · Color y roles

Cada tema define los mismos tokens; el resto del sistema se deriva. **Nunca uses un hex en un componente.**

### Identidad (CAPA 2 — uno por tema, en `styles/themes/<id>/_colors.scss`)

| Ficha | Papel |
|---|---|
| `--bg` `--surface` `--surface-hover` `--surface-elevated` | Las cuatro superficies, de atrás a delante |
| `--border` | Borde nominal; para separar filas usa `--hair` (el mismo al 60 %) |
| `--text` `--text-muted` `--text-dim` | Texto principal, secundario y atenuado (**AA 4,5:1 sobre `--surface`**) |
| `--steam` `--steam-hover` `--steam-rgb` | Acento de identidad. `--steam-rgb` existe para componer `rgba()` |
| `--on-accent` | Texto **encima** del acento. Blanco por defecto; tinta oscura si el acento es claro |
| `--accent-fill` | Relleno **plano** que lleva `--on-accent` encima (píldoras, marcas). Es `--steam` salvo donde así no llega a 4,5:1: ahí la paleta lo oscurece lo justo |
| `--focus-ring` | Anillo de foco. 3:1 contra las **cuatro** superficies (1.4.11). No siempre es `--steam` |
| `--fg-link` | Acento **como texto**: 4,5:1. No siempre es `--steam-hover` |
| `--success` `--warn` `--danger` (+ `-rgb`) | Semánticos. `--danger-fill` es el relleno con blanco encima |
| `--star-empty` `--star-full` | Estrellas. Son **gráfico**: les aplica 3:1, no 4,5:1 |
| `--chip-plat-*` `--chip-deck-*` | Chips de plataforma |
| `--hub-text` `--hub-text-muted` | Textos del hub social |
| `--tint-rgb` | *(solo en claro)* tono cálido con el que se tiñen sombras y veladuras |

### Temas

| id | Nombre | Acento oscuro | Fondo oscuro | Mundo |
|---|---|---|---|---|
| `forja` | **Forja y temple** (por defecto) | `#ff7a3c` metal al rojo | `#0f1315` | La fragua. El único sin mundo detrás: es el que ve quien no ha elegido nada. Naranja que **rellena** y turquesa de temple (`#2fd6c0`) que **escribe y señala** |
| `arcade` | Inserte moneda | `#b23cff` | `#150a24` | Sala de recreativos de los ochenta: violeta de neón, cian de tubo y rosa de pegatina |
| `witcher` | Plata y acero | `#c6ced8` plata | `#141922` | The Witcher: acero templado; la plata **rellena** y el fuego de Igni (`#ff8f4a`) **escribe y señala**. Las cinco señales van en la rampa. Hasta la 1.4.4 su id era `steam` (ver `LEGACY_PALETTE_IDS`) |
| `persona` | Ladrones de corazones | `#ff1f3d` | `#0d0d0d` | Persona 5: rojo, negro, blanco y oro de calendario |
| `portal` | Cámara de pruebas | `#29b6f6` | `#12171b` | Aperture moderna en oscuro; la antigua (pergamino) en claro |
| `cyberpunk` | Sin futuro | `#fcee0a` | `#08090d` | HUD de Night City: amarillo, cian, magenta |
| `seaofstars` | Sol y luna | `#f5c13e` | `#0e0c24` | Oro de Zale (sol) y azul de Valere (luna) |
| `grimdark` | Solo hay guerra | `#43f558` | `#060b08` | Cogitador verde, oro latón, hueso y rojo |

### Rampa categórica (CAPA 2b)

Siete tonos por tema (`--cat-1` … `--cat-7`), sacados de su propio mundo, para lo que **no** es semántico: el
género de un juego, la serie de una gráfica, el tipo de evento del feed. Cada tono tiene dos papeles: `--cat-N`
es el **relleno** (3:1) y `--cat-N-fg` el **texto** (4,5:1); cuando el relleno ya cumple como texto, coinciden.
`categoryTone()` convierte un nombre en un número estable del 1 al 7, así que ningún componente sabe qué color
le toca a cada género. Las reglas y de dónde sale cada rampa están en la cabecera de `styles/themes/_index.scss`.

---

## 3 · Tipografía

### Papeles (CAPA 0, reasignados por cada tema)

| Ficha | Papel | Forja y temple | Inserte moneda | Plata y acero | Cámara de pruebas | Sin futuro | Solo hay guerra | Sol y luna |
|---|---|---|---|---|---|---|---|---|
| `--font-body` | Cuerpo | DM Sans | Exo 2 | Lora | Saira | Rajdhani | Chakra Petch | Pixelify Sans |
| `--font-label` | Rótulos de interfaz | **Saira** | **Orbitron** | = cuerpo | **Oswald** | Rajdhani | Chakra Petch | = cuerpo |
| `--font-display` | Titulares | Saira | Orbitron | **Cinzel** | Oswald | Rajdhani | **UnifrakturCook** | = cuerpo |
| `--font-mono` | Cifras y fechas | **IBM Plex Mono** | Share Tech Mono | IBM Plex Mono | Share Tech Mono | Share Tech Mono | **VT323** | SoS Digits |

*Ladrones de corazones* no carga webfont: su display es `'Arial Black', Impact`.

### Escala

Doce pasos, razón ≈1,08 en la zona de interfaz. Multiplicados por `--font-scale` (0,94 / 1 / 1,08).
**Nunca escribas un `font-size` literal.**

```
--fs-3xs .68   marcas de gráfica        --fs-xl  1.20  titulares de sección
--fs-2xs .73   rótulos en versales      --fs-2xl 1.45
--fs-xs  .79   pies y fechas            --fs-3xl 1.75
--fs-sm  .86   secundario (el más usado)--fs-4xl 2.10  cifras grandes del panel
--fs-md  .93   cuerpo de tarjeta        --fs-5xl 2.40
--fs-lg  1.00  lectura (reseñas)        --fs-6xl 4.00  cifra protagonista
```

### Reglas

- Titular con `--font-display` y `letter-spacing: -.02em`; en los temas de versales, `text-transform` lo
  pone el tema (hay además una preferencia global `data-uppercase`).
- **`font-variant-numeric: tabular-nums` en toda cifra que viva en columna** (horas, notas, años).
- Rótulos en versales siempre con `letter-spacing: .12em–.16em`.
- Texto de lectura a ~65–70 caracteres de ancho.

---

## 4 · Componentes

- **Botón primario**: relleno del acento con degradado corto hacia abajo, texto `--on-accent`, radio del tema.
  Nunca blanco fijo encima: hay temas de acento claro.
- **Tarjeta**: superficie + `--hair` + `--e2` + `--edge`. *(Propuesta: degradado corto y textura del tema al 2 %.)*
- **Chip**: píldora, `--fs-3xs`, `--font-label`. Neutro para plataforma; teñido con el color de su categoría
  para género y estado.
- **Fila de tabla**: sin caja. La separa `--hair`; el color entra por un **lomo de 3 px** a la izquierda.
- **Anillo de nota**: `conic-gradient` con la rampa roja→verde (`--acc-l` fija la luminosidad por tema).
- **Medalla**: disco en penumbra con dibujo de Lucide en oro; receta en `docs/logros/receta-medalla.md`.
- **Cápsula** (`.ach-toast`, `_capsule.scss`): la pieza con la que la app dice algo. Disco a la izquierda +
  rótulo / nombre / descripción, radio = media altura, anillo y halo de color, barrido bajo `data-effects`. Tres
  inquilinos: el **logro** (disco = medalla, halo = rareza), el **aviso del administrador** (disco = icono, halo =
  acento) y el **aviso de la app** (disco = icono del tono, halo = tono). Los skins de paleta cuelgan de
  `.ach-toast`, así que la forma de cada tema sale sola.
- **Aviso** (`.ach-toast.is-notice`): **uno solo** para los cuatro sitios que avisan (estado, versión nueva, sin
  conexión del hub, requisito del perfil). Los dos primeros viven en el **carril flotante** de abajo a la
  izquierda (`.ach-toast-stack`, que monta `App` una vez para las tres cápsulas); los del hub van `is-compact`
  dentro de su bloque. Cada tono lleva dos colores: el `-rgb` para el gráfico (3:1) y la ficha `--fg-*` para el
  texto (4,5:1). El `role`/`aria-live` lo pone quien lo usa, no la pieza.
- **Sello de rango** (`.tier-seal`): el rango del perfil dicho con color **y palabra**. Píldora con disco del
  metal, deliberadamente distinta de la medalla, con la que convive en el hero del perfil. El color solo (muesca
  de la tarjeta del directorio, borde del selector de admin) vale para comparar en rejilla, no para informar.
- **Estados vacíos**: icono grande del sprite + título + una acción. Nunca un párrafo gris suelto.
- **Iconos**: sprite propio de 49 símbolos (`IconSprite`), `<Icon name="…" />`. Tamaño por ficha
  (`--ico-xs`…`--ico-2xl`), color por papel — no siempre `currentColor`.

---

## 5 · Layout y espacio

- **Rejilla de 4**: `--sp-1` 4px … `--sp-8` 64px. Huecos con `gap`, nunca márgenes que se cancelen.
- Contenedor de lectura ≤ 1140 px; la tabla puede desbordar en su propio contenedor con `overflow-x`.
- Gutter lateral mínimo de 16 px a cualquier ancho.
- La app es **headerless**: no hay barra superior fija, sino navegación inferior y un control flotante.
  *(Propuesta: cabecera de pantalla con rótulo, título y cifras — hoy las pantallas empiezan en frío.)*

### 5.1 · Navegación

Cuatro pestañas abajo —**Listados · Social · Estadísticas · Ajustes**— y arriba a la derecha, solo el cambio de
tema. Esa separación es la regla: **abajo lo que LLEVA a algún sitio, arriba lo que CAMBIA algo en el sitio**.
Importa porque los flotantes se esconden al bajar, y un destino que desaparece a mitad de página deja media
aplicación sin salida; un control que se aparta mientras lees, no.

La cuarta pestaña no navega: despliega un `popover` con los cuatro grupos de ajustes —Personalización,
Integración, Filtros y, como pie, Legal—. Cuatro rótulos con un punto de luz delante, **sin panel, sin caja y
sin velo**. El contraste no lo pone una superficie sino el apagado de todo lo demás: mientras el menú está
abierto, el contenido, los avisos y los controles flotantes bajan al **30 %** y los dos botones de acción
desaparecen (nacen en la misma esquina de la que sale el menú). Medido sobre el peor fondo posible —una carátula
blanca en tema oscuro, una negra en claro—, el rótulo queda en 6,4:1 y 6,6:1 en el peor píxel de su trazo.

La sombra de los rótulos (`--glow-text`, CAPA 1, derivada de `--bg`) **remata pero no sostiene**: medida sola
sobre blanco no pasa de 2:1 por muchas capas que se le añadan, porque en las puntas del trazo el halo se
difumina en todas direcciones. Y nada de esto lo ve axe, así que se mide a mano.

---

## 6 · Elevación y profundidad

Cuatro alturas, cada una con **dos sombras**: contacto de 1 px + difusa. Más `--edge`, el canto de luz que
separa una superficie elevada de otra simplemente más clara, y `--sunk`, que es el canto al revés.

| Ficha | Para |
|---|---|
| `--e1` | Filas, chips, tarjetas de contenido (ajustes, legal, admin) |
| `--e2` | Tarjetas que mandan, toolbar, tabla, botón primario |
| `--e3` | Lo que flota **sobre** el contenido: menús, tooltips, avisos, banner, lanzadores (alias histórico: `--shadow`) |
| `--e4` | Modales, diálogo de confirmación y ruleta |
| `--edge` | Canto de luz. Acompaña a la altura: `var(--e2), var(--edge)` |
| `--sunk` | **El hueco.** Lo que se RELLENA: campos, pistas de interruptor, carriles |
| `--glow-accent` `--glow-accent-strong` `--glow-accent-soft` `--glow-accent-halo` `--glow-accent-lift` | Halos del acento: **tiñen, no levantan** |
| `--ring-accent` `--ring-accent-soft` | Anillos de selección dibujados con sombra |

**Lo que se pulsa sube y lo que se rellena se hunde.** Es la mitad de la profundidad: un campo con `--sunk` y un
botón con `--e2` son la misma caja con la luz al revés, y eso dice de un vistazo dónde se escribe. En foco el
hueco no se sustituye —el anillo se **suma**—, o el campo se aplana justo al usarlo.

**El borde se gasta por papel**, igual que la sombra: marco entero (`--border`) para lo que no tiene altura;
filete (`--hair`) para delimitar una tarjeta que ya se sostiene sola y para separar filas sin dibujar una reja;
y **ningún borde** para lo que flota a `--e3`/`--e4`, donde lo que separa la pieza del fondo es su sombra.

`--shadow-rgb` es el color de la sombra: negro en oscuro, `--tint-rgb` del tema en claro.
Las sombras de los skins (`themes/<id>/<id>.scss`) **no** son elevación: son dirección de arte y se quedan como
están — y sus bordes tampoco, que ahí el marco de oro o el filete cian **son** la identidad.

---

## 7 · Formas

- Radios **por tema**, no globales: `--radius-sm/md/lg/pill`. La casa (CAPA 0) 8/12/22; Forja y temple 6/10/16;
  Inserte moneda y Plata y acero 2/3/4; Cámara de pruebas 3/6/10; Ladrones de corazones 3/4/8; Sin futuro y Sol y
  luna 0/0/2; Solo hay guerra 0/2/3.
- Un radio de 0 es una decisión, no un olvido: en esos temas la esquina viva **es** la identidad.
- Pastillas (`--radius-pill`) para chips, botones de filtro y segmentados en todos los temas.

---

## 8 · Do's and Don'ts

**Do**
- Pide siempre una ficha: `var(--fs-sm)`, `var(--e2)`, `var(--sp-4)`, `var(--steam)`.
- Mide el contraste antes de tocar `--text-dim`, `--focus-ring` o `--fg-link`: axe **no** ve el anillo de foco.
- Usa `--on-accent` encima de cualquier relleno de acento.
- Da a cada tema su gesto propio bajo `data-effects="on"`, y respeta `prefers-reduced-motion`. Si el gesto
  responde a algo que pasa en la app —cerrar un juego, guardar, filtrar, un logro—, cuélgalo de un MOMENTO
  (`core/effects/moments`) y no de un componente: el momento se emite una vez y lo escucha quien quiera.
- Apaga los efectos con `:root:not([data-effects="on"])`. El valor `off` **no existe**: al desactivarlos el
  atributo se retira, así que `[data-effects="off"]` no casa nunca y la regla no llega a aplicarse.
- Siembra +120 juegos antes de juzgar la tabla: virtualizada y con tres juegos no enseña sus fallos.

**Don't**
- No escribas un `font-size`, una sombra o una familia literales.
- No uses el acento para todo: hay `--acc-2/3/4` y semánticos, y la interfaz monócroma es el problema a resolver.
- No pongas borde de 1 px a todo. Borde, relleno, radio y sombra se gastan **por papel**: si todo destaca, nada destaca.
- No metas imágenes de juegos: la aplicación es tipográfica a propósito y presume de no depender de terceros.
- No aplanes las sombras de los skins: son la identidad de cada tema.
- No inviertas el claro a partir del oscuro; varios temas cuentan otra historia en claro.

---

## 9 · Guía para agentes

Al construir interfaz en este proyecto:

1. Lee `src/styles/_base.scss` (CAPA 0 y 1, lo común) y `src/styles/themes/_index.scss` (cómo se monta un tema):
   los dos están comentados con el porqué.
2. Escribe el componente **neutro**, con fichas. Si necesita carácter propio de un tema, va en `themes/<id>/<id>.scss`.
3. Añadir un tema es aditivo y tiene receta propia: [`docs/temas.md`](docs/temas.md). En corto, una carpeta en
   `styles/themes/`, dos ficheros en `core/constants/themes/` y cuatro índices; `tests/unit/themes.test.ts` avisa
   de lo que falte
   (recalcula el hash CSP de `public/_headers`) + opcionalmente un skin.
4. Verifica: `npm run build`, `npm test`, y `npx playwright test tests/e2e/a11y.test.ts` (96 recorridos).

**Muestrarios vivos** (previews del sistema, con selector de los seis temas):
taller de diseño, opciones de color y vida, y las cuatro pantallas rediseñadas.
