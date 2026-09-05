# Activos de diseño de los logros

Lo que hace falta para implementar el plan sin depender de nada externo. El diseño se cerró sobre un artefacto
web que ya no es necesario: todo lo que había allí vive aquí.

| Fichero | Qué es | Destino |
|---|---|---|
| [`catalogo.json`](catalogo.json) | Los 38 logros con umbrales, rarezas, complejidad y su valor real medido | `core/achievements/catalog.ts` (F1) |
| [`achievement-sprite.svg`](achievement-sprite.svg) | Los 38 cuadros y el filtro `#imp` que los pinta | `view/components/AchievementSprite.tsx` (F2) |
| [`achievements.scss`](achievements.scss) | Forma de la medalla, aura de rareza y triángulo del grado | `styles/achievements.scss` (F2) |

El plan y el porqué de cada decisión están en [`../plan-logros.md`](../plan-logros.md). Estos tres ficheros son
**datos y assets**, no código vivo: nada del build los mira todavía, y por eso están en `docs/` y no en `src/`.

## Lo que hay que saber antes de tocarlos

**Los umbrales están medidos, no supuestos.** Salen de una biblioteca real de 302 juegos, replicando
`normalizeGame` con la siembra de sellos incluida. El campo `valorReal` de cada logro es lo que daba esa
biblioteca — que es un usuario del extremo alto, no la media. Ver §6.8 y §6.9 del plan.

**Seis logros dan cero y no es un error.** Son los que necesitan el par de sellos `enteredAt` de dos listas
distintas, y ese par **no existe en ninguna biblioteca preexistente** (0 de 302). Llevan un bloque `dormido` con
qué les falta, cuándo pueden despertar y cuál es el problema. Ver §6.8 del plan.

**Ninguna métrica puede compararse contra `listedAt`.** En un juego catalogado hacia atrás esa fecha es la de
catalogarlo, no la de nada que pasara: la definición ingenua de «Speedrun» daba 42 aciertos y los 42 eran falsos.

**El sprite no se monta en el arranque.** Va en las dos rutas perezosas, nunca en `App.tsx`: el sprite que ya
existe pesa 28 kB y el presupuesto son 215 kB comprimidos (`BOOT_PAYLOAD_BUDGET_KB` en `scripts/ci-validate.js`).

**La hoja de estilos es propia.** Ni colgada de `stats.scss` ni de `social.scss`: las medallas se pintan en dos
chunks perezosos distintos y colgarlas de uno deja la otra pantalla sin estilos **sin que salte ningún error**.

## La medalla, en corto

La imagen va **a sangre**, sin marco, y solo lleva dos señales encima, cada una en su canal:

- **Aura exterior → la rareza.** Escala de loot de RPG: gris el común, verde el infrecuente, morado el raro,
  naranja de legendario el excepcional. Se salta el azul de la escala clásica porque el azul es el acento de la
  app y aparece por todas partes.
- **Triángulo en el ángulo inferior derecho → el grado**, de I a IV. Se funde con la imagen por la hipotenusa
  para no leerse como una pegatina.

**Todas miden exactamente lo mismo**, tenga el logro el grado que tenga y esté conseguido, bloqueado u oculto.
