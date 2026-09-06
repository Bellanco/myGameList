# Activos de diseño de los logros

Lo que hace falta para implementar el plan sin depender de nada externo. El diseño se cerró sobre un artefacto
web que ya no es necesario: todo lo que había allí vive aquí.

| Fichero | Qué es | Destino |
|---|---|---|
| [`catalogo.json`](catalogo.json) | Las 50 escaleras y sus 251 escalones publicables, con umbrales, rarezas y su valor real medido | `core/achievements/catalog.ts` |
| [`achievement-sprite.svg`](achievement-sprite.svg) | ⚑ **Histórico.** Los 38 cuadros originales y el filtro `#imp`. Ya no es la fuente: el sprite lo hacen los trazos de Lucide | — |
| [`achievements.scss`](achievements.scss) | ⚑ **Histórico.** Forma cuadrada, aura y triángulo del grado | — |
| [`receta-medalla.md`](receta-medalla.md) | **Cómo se hace un logro nuevo**, hoy: el disco, el icono, la escalera y la lista de comprobación | — |

El plan y el porqué de cada decisión están en [`../plan-logros.md`](../plan-logros.md).

> ⚑ **Los tres están YA recogidos en `src/`** (F1 y F2, detrás de `ENABLE_ACHIEVEMENTS`). Estos ficheros dejan de
> ser el destino y pasan a ser la **fuente de diseño**: al retocar un cuadro o un umbral se retoca aquí y se
> vuelve a llevar. Lo que vive en `src/` no es una copia literal — el código se apartó del activo en varias
> cosas, y cada una está anotada abajo y en el §10bis del plan.

## ⚑ Revisión del 6-sep-2026

Los tres ficheros se revisaron contra el código y contra el plan. Lo que cambió:

- **`catalogo.json`** — `resultadoSobreEsaBiblioteca` decía 915 puntos y nivel 22; sumando los `nivelReal` del
  propio fichero salen **895** y **nivel 21**. Además: `oculto` deja de ser una *familia* y pasa a ser el flag
  que siempre debió ser (`tesis` es de familia `datos`, no «oculto»), y cada entrada estrena dos campos que el
  plan necesitaba y no tenía en ninguna parte: **`abierta`/`anual`** con su `cap` (las metas sin techo y los
  repetibles por año, que el parser defensivo del §9.3 no podía recortar sin un máximo declarado) y **`guarda`**
  en las seis métricas donde la *ausencia* de un dato se lee como dato (§7.5 del plan): sin ella, «Lo terminé por
  orgullo» cuenta todos los completados **sin nota** y «Exterminatus» salta el primer día con la biblioteca vacía.
- **`achievements.scss`** — clases genéricas en hoja global (`.medal`, `.num`, `.light`, `.canvas`, `.grain`,
  `.rar`) renombradas al prefijo `ach-`, como los símbolos del sprite; `var(--ink)`/`var(--ink-2)` no existen en
  este proyecto y ahora son `--text`/`--text-muted`; «JetBrains Mono» y «Chivo» no son fuentes de esta app y el
  numeral usa la pila mono del sistema con `tabular-nums`. Y se añade el **fallback plano tras
  `data-effects="off"`**, porque el acabado son 38 filtros con turbulencia a la vez en la rejilla y eso no está
  medido en móvil.
- **`achievement-sprite.svg`** — **sin cambios**. Los 38 símbolos casan uno a uno con los 38 `id` del catálogo,
  el prefijo `#ach-` no colisiona con el `#icon-` del sprite del arranque, y el filtro `#imp` está donde dice.

## ⚑ En qué se apartó `src/` del activo, al implementarlo

- **El chip de rareza del activo tenía razón y el código no.** `achievements.scss` ya proponía **punto de color y
  texto atenuado** (`.ach-rarity`); la primera implementación tiñó el TEXTO con los cuatro colores del aura, y
  eso falla el contraste: el morado del raro daba **3,07:1** frente al 4,5:1 que pide la 1.4.3 para 11 px. Lo
  cazó la auditoría de axe en las doce combinaciones de paleta y tema. La regla del activo es la que quedó.
  **La lección, para la próxima:** los colores del aura son para un halo (1.4.11, 3:1), no para texto.
- **La medalla mide 48 px en el listado**, no los 72 que decía el plan: a ese tamaño cada fila era casi tan alta
  como ancho su cuadro. El lado lo decide el componente, no la hoja.
- **El bloqueado se ve más de lo que decía el activo**: de `opacity(.62)` a `.8` y menos desaturación. El cuadro
  es lo único que dice de qué va un logro que aún no tienes, y a `.62` se perdía justo cuando más falta hacía.
- **El catálogo de `src/` no lleva el campo `note`.** Estuvo, con la línea «empieza a contar desde que lo
  instalaste» de los seis dormidos, y se retiró al verla en pantalla: seis párrafos de disculpa en un listado.

## ⚑ Revisión del 6-sep-2026 (segunda): cada nivel es un logro

El catálogo se repasó entero contra la biblioteca real y **cambió de modelo**: una escalera de cuatro escalones
ya no es un logro con grados, son cuatro logros. El porqué y las consecuencias están en el §6.3bis del plan; lo
que afecta a estos tres ficheros es:

- **`catalogo.json` se REGENERA desde el código**, ya no se edita a mano: es un volcado de `LADDERS` con el valor
  real de cada escalera medido sobre los 302 juegos. Dejó de ser el destino y es ahora el retrato de lo que hay.
- **`achievement-sprite.svg` se quedó corto**: el catálogo estrena doce escaleras y sus doce cuadros
  (`ritmo`, `degustacion`, `volvere`, `revancha`, `cadena-de-anos`, `dieta`, `tutorial`, `platino`, `escaparate`,
  `aniversario`, `paso-proximos`, `paso-abandono`) están dibujados **directamente en
  `view/components/AchievementSprite.tsx`**, que es el que se monta. Este activo lleva los 38 originales: al
  retocar un cuadro nuevo, se retoca allí y se trae aquí, no al revés.
- **Un dibujo por ESCALERA, no por logro.** 251 medallas no se dibujan; los escalones de una misma escalera
  comparten cuadro y los distingue el triángulo del grado, que es justo para lo que se diseñó.

## Lo que hay que saber antes de tocarlos

**Los umbrales están medidos, no supuestos.** Salen de una biblioteca real de 302 juegos, replicando
`normalizeGame` con la siembra de sellos incluida. El campo `valorReal` de cada logro es lo que daba esa
biblioteca — que es un usuario del extremo alto, no la media. Ver §6.8 y §6.9 del plan.

**El catálogo entero cabe en el espejo con sitio de sobra.** Un escalón solo puede estar conseguido o no, así que
el espejo es un mapa de bits: 253 bits son 44 caracteres, y sobre la biblioteca real el espejo completo —fechas
incluidas— ocupa 186 de los 1.024 que valida la regla. Lo que trae a cambio es que **el orden del catálogo es
contrato**: reordenar escaleras reescribe la vitrina de todo el mundo.

**Seis logros dan cero y no es un error.** Son los que necesitan el par de sellos `enteredAt` de dos listas
distintas, y ese par **no existe en ninguna biblioteca preexistente** (0 de 302). Llevan un bloque `dormido` con
qué les falta, cuándo pueden despertar y cuál es el problema. Ver §6.8 del plan.

**Ninguna métrica puede compararse contra `listedAt`.** En un juego catalogado hacia atrás esa fecha es la de
catalogarlo, no la de nada que pasara: la definición ingenua de «Speedrun» daba 42 aciertos y los 42 eran falsos.

**El sprite no se monta en el arranque.** Va en las dos rutas perezosas, nunca en `App.tsx`: el sprite que ya
existe (`IconSprite`, 48 símbolos) pesa 26 kB sin comprimir y el presupuesto son 215 kB comprimidos
(`BOOT_PAYLOAD_BUDGET_KB` en `scripts/ci-validate.js`, verificado).

**La hoja de estilos es propia.** Ni colgada de `stats.scss` ni de `social.scss`: las medallas se pintan en dos
chunks perezosos distintos y colgarlas de uno deja la otra pantalla sin estilos **sin que salte ningún error**.

## ⚑ Revisión: el cuadro se va, entra el disco

La medalla dejó de ser un cuadro cuadrado con un triángulo y pasó a ser **un disco en penumbra** con el dibujo en
oro. Cambian tres cosas y cada una por una razón medida:

1. **La forma**: círculo. El filo continuo es lo que permite que el grado se lea a 28 px.
2. **El dibujo**: trazos de **Lucide** pintados a tres pasadas, en vez de 50 escenas dibujadas a mano. El sprite
   baja de ~40 kB a ~16 kB y un logro nuevo cuesta pegar un icono. El filtro `#imp` desaparece.
3. **El grado**: **temple del filo** (cobre / plata / oro por tramos) en vez de numeral romano, que no sobrevivía
   a la tira pequeña.

Los dos activos de arriba marcados como *históricos* describen el diseño anterior y se dejan como registro de lo
que se probó. **La referencia viva es [`receta-medalla.md`](receta-medalla.md)**, que es también el manual para
añadir logros nuevos sin volver a decidir nada.

## La medalla, en corto

Sólo lleva dos señales encima, cada una en su canal:

- **Aura exterior → la rareza.** Escala de loot de RPG: gris el común, verde el infrecuente, morado el raro,
  naranja de legendario el excepcional. Se salta el azul de la escala clásica porque el azul es el acento de la
  app y aparece por todas partes.
- **Temple del filo → el tramo de la escalera**: cobre hasta un tercio, plata hasta 0,7, oro por encima. Entre el
  aura y el filo va un canto negro, porque sin él las dos señales se leen como una sola.

**Todas miden exactamente lo mismo**, tenga el logro el grado que tenga y esté conseguido, bloqueado u oculto.

**Y una decisión que se tomó y conviene no revisitar a ciegas:** los ajustes de visibilidad **no** filtran el
espejo. Un logro publica una magnitud —«más de sesenta abandonos anotados»— y no un dato: desde ahí no se llega a
ningún juego. Lo que sí obliga es una frase en la política de privacidad. Está razonado en el §5.3bis del plan.
