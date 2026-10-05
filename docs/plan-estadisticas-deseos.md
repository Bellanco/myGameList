# Plan: «Ya lo tienes en casa» — los deseos frente a Próximos

Estado: implementado en `develop` (05-10-2026). Documento vivo: si una línea no coincide con el código, manda el código.
Depende de la lista de deseos (`docs/plan-lista-deseos.md`).

## Qué es

Un apartado nuevo del panel de Estadísticas, justo después de «Lo que te espera». Por cada juego que deseas busca
algo que **ya tienes en Próximos** y se le parece, para ver si el próximo ya lo tienes listo antes de comprar otro.
Y compara los géneros de lo que deseas con los de lo que esperas.

- **Título:** «Ya lo tienes en casa».
- **Subtítulo** (Far Cry 3, Vaas: «¿Te he dicho alguna vez cuál es la definición de locura?»): *La definición de
  locura es comprar otro igual esperando que sea distinto: mira antes lo que ya tienes.*

## Qué enseña

1. **La cifra:** «**4 de tus 12 deseos** tienen ya un pariente esperando en Próximos».
2. **Las parejas** (hasta 5): el deseo, el juego de Próximos que se le parece y el motivo.
   > **Silksong** → ya tienes **Ori and the Will of the Wisps** · *Metroidvania · Plataformas*
3. **Deseos frente a Próximos por género:** dos puntos por género sobre un eje común, y debajo los géneros que
   deseas **sin nada esperando**, que es donde un deseo cubre un hueco de verdad.

Sin parejas, el apartado sale igual con la comparación y la frase «Ninguno de tus deseos tiene pariente en
Próximos».

## Reglas del parentesco

Se compara cada deseo (`d`) con cada juego de Próximos (`p`). Solo Próximos: es «lo tengo y está listo».
Completados explicaría el deseo («te gustó la 1»), no lo sustituiría.

Motivos, del más fuerte al más débil:

1. **Misma saga.** Por nombre, con `parseSeries` (el de la ruleta) sobre el nombre normalizado: misma base, o una
   base que empieza por la otra en frontera de palabra («elden ring» / «elden ring nightreign»). La base corta
   tiene que tener al menos dos palabras o seis letras, para que «the» o «doom» no emparenten medio catálogo.
2. **Géneros en común.** Comparados sin mayúsculas ni tildes. Hacen falta dos, salvo que uno de los dos juegos
   tenga un solo género: entonces basta ese (en la biblioteca real la mitad de los juegos llevan uno solo, y
   exigir dos los dejaría fuera). Se puntúa con Jaccard (comunes / unión).
3. **Misma plataforma.** Solo desempata; nunca es motivo por sí sola.

Para cada deseo se queda la MEJOR pareja: saga > Jaccard > nº de géneros comunes > plataforma compartida > el de
Próximos que lleva más tiempo esperando (`enteredAt.p`, y si no `listedAt`). Las parejas se ordenan por interés
del deseo (su nota), luego las de saga primero, luego por nombre.

Límites conocidos, que van en un comentario y no en la interfaz: la saga por nombre falla con títulos que no
siguen el patrón (Bloodborne y Dark Souls no son parientes), y un juego sin géneros solo puede emparentarse por
saga.

## Cuándo sale

- Solo en tus estadísticas: entra en `OWN_STATS_BLOCKS` y NO en la lista de bloques del perfil de un amigo.
- Solo en el alcance general, no en el de un año.
- Solo si hay juegos en Deseos y la pestaña no está oculta en Ajustes (`useShowWishlist`).

## Fases

- [x] **1. El cálculo.** Módulo puro `src/core/stats/wishKin.ts` (`computeWishKin(data)` → cifra, parejas,
  comparación y huecos), aparte de `computeStats`, que solo recorre la biblioteca (`LIBRARY_TAB_IDS`) y así se
  queda. Se memoiza en `useStatsViewModel`. Tests en `tests/unit/wishKin.test.ts`:
  - saga igual y por prefijo, y el mínimo de la base corta;
  - géneros con tildes y mayúsculas, el caso de un solo género y el umbral de dos;
  - plataforma solo como desempate;
  - orden por interés, tope de 5 y huecos;
  - Deseos vacía o Próximos vacía.
- [x] **2. La tarjeta.**
  - Bloque `'kin'` en `StatsBlock` y en `OWN_STATS_BLOCKS`; textos en `statsLabels`.
  - Componente `WishKinCard`, que reutiliza `GameRefList` y `TagChips`.
  - Para la comparación, generalizar `Dumbbell` (hoy atado a terminados/abandonados) a dos series con sus
    rótulos, sin cambiar lo que pinta en la vergüenza. Un test de componente lo fija.
  - Tests de componente: cifra, parejas, estado sin parejas, y que no sale en el panel de un amigo.
- [x] **3. Acabado y verificación.**
  - Colores de las dos series con `--stats-p` y un `--stats-d` nuevo en `stats.scss`, más las sobrescrituras de
    los temas que redefinen los `--stats-*` (Witcher, Cyberpunk…). En claro y en oscuro.
  - Sembrar deseos en `tests/e2e/seed.ts` para que el recorrido de accesibilidad (axe) pase por la tarjeta.
  - Revisar en Chrome los ocho temas a 375, 1280 y 1512 px, con la biblioteca sembrada (`myGames.json`).

  Lo que salió de la revisión (y ya está arreglado):
  - con los dos valores iguales los puntos de la mancuerna se tapaban: ahora es un punto partido en dos colores;
  - a 320 px con el texto del sistema grande el carril se quedaba en 40 px: en estrecho el nombre sube encima;
  - en Grimdark el tono de Deseos (pizarra) se confundía con el verde de Próximos en claro: usa el óxido.
