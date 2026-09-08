# Propuestas: escaleras nuevas

> ## ⚑ ESTADO: IMPLEMENTADO (menos una)
>
> **Entraron catorce escaleras y 98 escalones**: los bloques A, B, C, D, E2 y F de este documento, más una que se
> pidió sobre la marcha —**«Otra oportunidad»**, §7bis—. El catálogo pasa de 50 escaleras a **64** y de 314
> escalones a **412**; el techo, a **7.410 puntos y nivel 46**. Sobre la biblioteca medida son **190 logros
> conseguidos, nivel 27**. Siete escaleras estrenaron techo más alto en una segunda pasada (§12).
>
> **No entró E1 «Toda la escala»**, la única del documento que se quedó fuera. Sigue descrita en su sitio por si
> se retoma: no hay nada malo en ella, simplemente no se pidió.
>
> Lo que cambió al implementarlo está en el §11, y lo que se midió y se descartó en el §8. Los valores «reales»
> de las tablas de abajo son los de la medición previa hecha a mano; los definitivos, medidos ya con el código
> del catálogo, están en la tabla del §11 y en [`catalogo.json`](catalogo.json).

Catorce escaleras candidatas, agrupadas por **el hueco que tapan** y con el umbral medido sobre la biblioteca
real. No es una lista de la compra: la mitad de abajo está aquí para poder decir «esta no» con un dato delante.

La receta no se toca — todo lo de aquí se declara como dice [`receta-medalla.md`](receta-medalla.md) y respeta las
cuatro reglas del catálogo. Lo que esto añade es el **qué medir**, que es lo único que la receta no puede decidir.

---

## 0. De dónde salen las cifras

Todas las columnas «valor real» de abajo salen de `myGames.json` —302 juegos, 149 terminados, 87 abandonados, 2
jugando, 64 en Próximos— replicando la siembra de sellos de `normalizeGame` (`bulkStampedDates` incluido). Es el
mismo procedimiento y la misma biblioteca con la que se midieron las 50 escaleras actuales (§6.8 del plan), así
que las cifras son comparables con el `valorReal` de [`catalogo.json`](catalogo.json).

**Lo que esa biblioteca tiene y lo que no**, porque decide qué se puede medir hoy:

| Dato | Cobertura | Qué permite |
|---|---|---|
| `years` | 149 juegos con año, **21 con dos o más**, máximo 5 (Portal) | Todo lo retroactivo: rejugadas, décadas, cosechas |
| `genres` / `platforms` | 302 de 302 | Amplitud y profundidad por etiqueta |
| `strengths` / `weaknesses` | 238 con virtud, 150 con virtud **y** defecto | 21 y 30 etiquetas distintas — **nadie las mira** |
| `reasons` | 87 abandonos, 18 motivos distintos | Retrato de por qué lo dejas |
| `grade` | 283 puntuados, las **diez** decenas ocupadas | La forma de tu escala de notas |
| `hours` | 76 juegos, **3.897 h** sumadas | Agregados |
| `review` | 98 reseñas, **79.922 caracteres**, 13.683 palabras | Agregados de escritura |
| `enteredAt` | 101 de 302, y **todos de julio de 2026 en adelante** | Casi nada: la app es más nueva que la biblioteca |

Esa última fila es la que gobierna el documento: **cualquier escalera que dependa de sellos nace dormida**, y las
propuestas de abajo se apoyan en `years`, en las etiquetas y en las notas justamente por eso.

---

## 1. Los seis huecos del catálogo actual

Las 50 escaleras de hoy miden **volumen** (cuántos) y **racha** (cuántos seguidos). Repasadas una a una, dejan
seis formas de mirar la misma biblioteca sin usar:

1. **La forma, no el volumen.** Nadie cruza amplitud con profundidad. «Mundo abierto» cuenta géneros distintos y
   «Créditos finales» cuenta juegos; ninguno sabe si de un género cerraste uno o veintiséis. **Es exactamente lo
   que resuelve el 3×3**, y es el bloque A.
2. **Sumar, no contar.** Todo el catálogo cuenta *juegos que tienen X*; ni una escalera suma la X. «El contador
   de horas» premia **apuntar** horas (76 juegos) y no las **3.897 horas** apuntadas.
3. **Campos huérfanos.** `strengths` y `weaknesses` solo se leen como «existe / no existe» («Luces y sombras»),
   y `reasons` igual («Informe forense»). El **contenido** de las 51 etiquetas distintas no lo mira nadie.
   `gradedAt` no lo mira ningún logro.
4. **La distancia, no la racha.** «Toda una vida» mide años *seguidos*; nada mide el **hueco**. Volviste a Need
   for Speed: Underground **22 años** después y eso no vale un logro.
5. **La forma de la distribución.** «Nota del crítico» mira la dispersión y ahí acaba. Tienes las diez decenas de
   nota ocupadas, que es un uso de la escala que casi nadie tiene, y no se reconoce.
6. **Coherencia con lo que marcaste.** La pareja «Cuenta pendiente» → «Volver a la hoguera» existe (marcar la
   revancha / cumplirla) y funciona. La gemela **no**: 73 juegos marcados como rejugables, y nada premia haberlos
   rejugado de verdad (15).

---

## 2. Bloque A — Los índices: el 3×3

**La idea.** Un índice cuadrado —el índice h de las citas académicas— es el mayor `N` tal que hay al menos `N`
cosas de tamaño `N` o más. Un solo número que **no se puede farmear por un lado**: ni con un juego rejugado diez
veces ni con cincuenta juegos jugados una vez. Es la única familia de estas catorce que mide *forma*.

### A1 · «El día de la marmota» — N juegos rejugados N veces ⭐ el que pediste

| | |
|---|---|
| `key` | `marmota` · familia `mirror` · rareza `raro` · icono Lucide `LayoutGrid` |
| `steps` | `[2, 3, 4, 5, 6]` |
| **Valor real** | **3** — el 3×3 está hecho; el 4×4 se queda a un juego (5 juegos con 3 vueltas, 1 con 4) |
| Reparto | ≥2 vueltas: 21 juegos · ≥3: 5 · ≥4: 1 · ≥5: 1 |

```ts
{
  key: 'marmota',
  family: 'mirror',
  steps: [2, 3, 4, 5, 6],
  rarity: 'raro',
  icon: 'marmota',
  labels: { name: 'El día de la marmota', condition: 'Juegos rejugados tantas veces como juegos' },
  goal: (step) => `Ten ${step} juegos jugados en ${step} años distintos`,
  done: (step) => `Tienes ${step} juegos jugados en ${step} años distintos`,
  metric: ({ games }) => squareIndex(
    allGames(games).map(({ game }) => ({ size: playedYears(game).length, at: lastPlayedYearEnd(game) })),
  ),
}
```

Y el ayudante, que lo comparten las tres escaleras del bloque:

```ts
/**
 * ÍNDICE CUADRADO: el mayor N con al menos N elementos de tamaño ≥ N (el índice h de las citas).
 *
 * `at[n-1]` es el sello MÁS TARDÍO de los N que sostienen el cuadrado, que es el que lo completó. Es una
 * aproximación declarada: un elemento pudo llegar a tamaño N después de su propio sello, y `years` solo da el
 * año. Monótona por construcción —el máximo de un conjunto mayor no baja—, que es lo que el evaluador necesita.
 */
function squareIndex(items: Array<{ size: number; at: number }>): AchievementMeasure {
  const sorted = items.filter((item) => item.size > 0).sort((a, b) => b.size - a.size);
  const at: number[] = [];
  for (let n = 1; n <= sorted.length; n += 1) {
    if (sorted[n - 1].size < n) break;
    at.push(Math.max(...sorted.slice(0, n).map((item) => item.at)));
  }
  return { value: at.length, at };
}
```

**La medalla dice «3×3».** `medalThreshold()` rotula hoy `×3` (contador), `≤3` (descendente), `3 %` y la cifra
sola (racha). Estas escaleras piden un quinto caso de una línea, y es el que hace que la píldora diga literalmente
lo que se llama el logro:

```ts
/** Escaleras de ÍNDICE CUADRADO: la píldora dice «3×3», que es el nombre que tiene la cosa. */
const SQUARE_LADDERS = new Set(['marmota', 'todos-los-palos', 'anadas']);
// …en medalThreshold(), antes del `return` final:
if (SQUARE_LADDERS.has(ladder)) return `${step}×${step}`;
```

**Y un aviso de nombres.** El escalón hereda el nombre de la escalera con su romano (`expand()`), así que la
escalera **no puede llamarse «3×3»**: el cuarto escalón se leería «3×3 IV». El nombre es genérico y la cifra la
ponen la píldora y la condición. Es la misma razón por la que «Créditos finales» no se llama «100 juegos».

### A2 · «A todos los palos» — N géneros con N cierres cada uno

| | |
|---|---|
| `key` | `todos-los-palos` · familia `mirror` · rareza `raro` · icono `Shapes` |
| `steps` | `[3, 4, 5, 6, 8, 10, 12]` |
| **Valor real** | **9** (sobre cerrados) · 7 si se cuentan solo terminados |
| Reparto | 34 géneros cerrados; FPS 26, ARPG 26, Plataformas 24, Aventura 21, Cartas 12 |

```ts
metric: ({ games }) => squareIndex(groupSizes(closedGames(games), (game) => game.genres)),
```

Es el complemento exacto de «Mundo abierto» (amplitud pura, 34 géneros) y de «Créditos finales» (volumen puro).
Con el 9 hecho y el 12 por delante, la escalera tiene recorrido sin regalar nada.

### A3 · «Libro de cosechas» — N años con N juegos terminados cada uno

| | |
|---|---|
| `key` | `anadas` · familia `mirror` · rareza `raro` · icono `Wine` |
| `steps` | `[2, 3, 5, 7, 9, 12]` |
| **Valor real** | **9** — 2025 (24), 2026 (22), 2018 (19), 2017 (12), 2019/2020/2022 (11) |

```ts
metric: ({ games }) => squareIndex(
  yearSizes(games.c || []).map(({ year, size }) => ({ size, at: endOfYear(year) })),
),
```

Mide lo que «Cosecha del año» (el mejor año) y «Partida guardada» (años distintos) no pueden decir juntos:
**cuántos años buenos llevas**. Un año de 24 juegos y veinte años de uno dan el mismo 1 aquí.

> **Descartado del bloque: el índice de plataformas.** Da 5 y suena bien, pero 242 de tus 302 juegos son de
> Steam: lo que mediría es en qué tienda compras, no cómo juegas. Un logro que retrata a Valve no retrata a nadie.

---

## 3. Bloque B — Agregados: sumar en vez de contar

### B1 · «El peso de las horas» — horas sumadas

| | |
|---|---|
| `key` | `horas-totales` · familia `mirror` · rareza `infrecuente` · icono `Weight` |
| `steps` | `[100, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000]` |
| **Valor real** | **3.897 h** (3.740 solo de terminados) → escalón 6 de 9 |

```ts
metric: ({ games }) => {
  const total = allGames(games).reduce((sum, { game }) => sum + (hoursOf(game) || 0), 0);
  // SIN FECHA, y es legítimo (§5.3): no hay un sello «por hora» que sembrar, y un array de 3.897 sellos para
  // fechar nueve escalones sería inventar precisión. Como «Sin cabos sueltos».
  return { value: Math.round(total) };
},
```

El 10.000 final es el guiño (las diez mil horas de la maestría) y está a más del doble de tu biblioteca: la
escalera abre camino durante años. Es el hueco más grande del catálogo: hoy «El contador de horas» premia teclear
el campo, y nadie premia lo que dice el campo.

### B2 · «Obra completa» — palabras escritas en reseñas

| | |
|---|---|
| `key` | `obra-escrita` · familia `data` · rareza `infrecuente` · icono `ScrollText` |
| `steps` | `[500, 2000, 5000, 10000, 25000, 50000, 100000]` |
| **Valor real** | **13.683 palabras** (79.922 caracteres) → escalón 4 de 7 |

```ts
metric: ({ games }) => {
  const words = allGames(games).reduce((sum, { game }) => {
    const text = String(game.review || '').trim();
    return sum + (text ? text.split(/\s+/).length : 0);
  }, 0);
  return { value: words };
},
```

**En palabras y no en caracteres**, a propósito: 25.000 palabras se entiende (es un TFG) y 100.000 caracteres no
se entiende de nada. Y no pisa a «Tesis doctoral», que mide una reseña larga; esto mide la obra entera.

### B3 · «El bibliotecario» — juegos catalogados

| | |
|---|---|
| `key` | `biblioteca` · familia `mirror` · rareza `comun` · icono `Archive` |
| `steps` | `[25, 50, 100, 200, 300, 500, 750, 1000]` |
| **Valor real** | **302** → escalón 5 de 8 |

```ts
metric: ({ games }) => count(allGames(games).map(({ game }) => ({ ok: true, at: firstEnteredAt(game) }))),
```

La escalera más obvia que falta: **el tamaño de la biblioteca no lo mide nadie**. Es el logro con el que arranca
todo el mundo (25 juegos llegan solos) y por eso va `comun`. Roza «Guerra de consolas» y «Nota del crítico», pero
ninguna de las dos cuenta lo que hay: cuentan plataformas y notas.

---

## 4. Bloque C — Los campos huérfanos

Aquí hay una advertencia que vale para las tres: **`strengths`, `weaknesses` y `reasons` son texto libre**, así
que estos logros se pueden farmear escribiendo etiquetas inventadas. El catálogo ya vive con eso (`replayable`,
`retry` y `steamDeck` son casillas que uno se marca solo), pero conviene que sean `comun`/`infrecuente` y no
excepcionales: lo que premian es rellenar la ficha, y eso es de la familia `data`.

### C1 · «Diccionario de a bordo» — etiquetas distintas que usas

| | |
|---|---|
| `key` | `vocabulario` · familia `data` · rareza `comun` · icono `Tags` |
| `steps` | `[5, 10, 15, 20, 30, 40, 50]` |
| **Valor real** | **51** (21 virtudes + 30 defectos) → la escalera entera |

```ts
metric: ({ games }) => firstOfEach(
  allGames(games).map((entry) => entry.game),
  (game) => [...(game.strengths || []), ...(game.weaknesses || [])],
),
```

Cuesta **una línea**: `firstOfEach` ya existe y ya hace esto mismo para géneros y plataformas, sellos incluidos.
Si el 51 real resulta demasiado generoso, la variante honesta es contar solo etiquetas usadas en **dos juegos o
más** (un vocabulario, no un cajón de sastre).

### C2 · «Ya sé cómo acaba esto» — el mismo motivo de abandono, una y otra vez

| | |
|---|---|
| `key` | `mania` · familia `mirror` · rareza `infrecuente` · **oculto** · icono `Frown` |
| `steps` | `[5, 10, 20, 35, 50]` |
| **Valor real** | **36** — Frustración; después Repetitividad 32, Dificultad 20 |

```ts
metric: ({ games }) => {
  const byReason = new Map<string, number[]>();
  for (const game of games.v || []) {
    for (const raw of game.reasons || []) {
      const key = String(raw || '').trim().toLowerCase();
      if (!key) continue;
      byReason.set(key, [...(byReason.get(key) || []), enteredAt(game, 'v')]);
    }
  }
  let best: number[] = [];
  for (const stamps of byReason.values()) if (stamps.length > best.length) best = stamps;
  return { value: best.length, stamps: best };
},
```

**Oculto, y por el motivo bueno**: es un hecho que se reconoce cuando aparece, no una campaña que se persigue.
Del catálogo actual es el que más se le parece a «No eres tú, soy yo» — el logro con carácter que te retrata en
vez de felicitarte.

### C3 · «Sé lo que me gusta» — la misma virtud en N juegos

| | |
|---|---|
| `key` | `firma` · familia `mirror` · rareza `comun` · icono `Fingerprint` |
| `steps` | `[10, 25, 50, 75, 100, 150]` |
| **Valor real** | **133** — Jugabilidad; después Historia 58, Ambientación 51 |

Gemelo del anterior sobre `strengths` y de toda la biblioteca. Los dos juntos dicen, sin una palabra de más, qué
buscas y qué no aguantas.

---

## 5. Bloque D — La distancia, no la racha

### D1 · «Cuánto tiempo sin verte» — volver años después ⭐ el mejor del documento

| | |
|---|---|
| `key` | `reencuentro` · familia `mirror` · rareza `raro` · icono `CalendarClock` |
| `steps` | `[1, 3, 5, 8, 12]` |
| **Valor real** | **10** juegos con un hueco de 5 años o más (≥3 años: 13 · ≥8: 5 · ≥10: 4) |
| El campeón | Need for Speed: Underground, con **22 años** entre dos vueltas |

```ts
/** Años que hacen de una rejugada un reencuentro. */
const REUNION_YEARS = 5;

metric: ({ games }) => count(allGames(games).map(({ game }) => {
  const years = playedYears(game).sort((a, b) => a - b);
  let reunion = 0;
  for (let index = 1; index < years.length; index += 1) {
    if (years[index] - years[index - 1] >= REUNION_YEARS) reunion = years[index];
  }
  // El sello es el fin del año de la VUELTA, que es toda la precisión que da `years` (§6.8).
  return { ok: reunion > 0, at: reunion > 0 ? endOfYear(reunion) : 0 };
})),
```

Por qué este es el mejor de los catorce: sale de un campo que ya existe, no pide cambiar nada, **es retroactivo
en cualquier biblioteca vieja** y mide algo que nadie mide —ni el volumen, ni la racha, ni la forma: el tiempo que
pasó—. Y la frase se escribe sola: «Vuelve a 3 juegos más de cinco años después».

**Variante**, si prefieres una escalera sobre la distancia en vez de sobre la cuenta: `key: 'larga-espera'`,
`steps: [3, 5, 10, 15, 20]` con el **hueco máximo** en años (valor real 22, escalera entera hecha). Más elegante
—un solo dato— pero se agota de golpe con la biblioteca que ya tienes.

### D2 · «Memoria de otro siglo» — la anchura de tu historial

| | |
|---|---|
| `key` | `arqueologia` · familia `mirror` · rareza `raro` · icono `Landmark` |
| `steps` | `[5, 10, 15, 20, 25, 30]` |
| **Valor real** | **26 años** (2000 → 2026) → escalón 5 de 6 |

```ts
metric: ({ games }) => {
  const years = allGames(games).flatMap(({ game }) => playedYears(game));
  if (years.length < 2) return { value: 0 };   // GUARDA: con un año no hay anchura, hay un punto
  const first = Math.min(...years);
  const span = Math.max(...years) - first;
  // at[n-1] = fin del año en que la anchura llegó a n. Monótono y sin inventar día ni hora.
  return { value: span, at: Array.from({ length: span }, (_, index) => endOfYear(first + index + 1)) };
},
```

Se pisa un poco con «Toda una vida» (años **seguidos**, valor real 9) y con «Partida guardada» (años
**distintos**), pero dice otra cosa: aquí los huecos no rompen nada. Es el logro de quien lleva un cuarto de siglo
jugando, y no hay forma de conseguirlo con un año de uso.

---

## 6. Bloque E — La forma de tu escala de notas

### E1 · «Toda la escala» — usar la regla entera

| | |
|---|---|
| `key` | `toda-la-escala` · familia `mirror` · rareza `raro` · icono `Ruler` |
| `steps` | `[4, 6, 8, 10]` |
| **Valor real** | **9** de 10 decenas con tres juegos o más (la de 0-9 tiene uno) |
| Reparto | 60s: 83 · 70s: 37 · 80s: 36 · 50s: 35 · 30s: 29 · 40s: 24 · 90s: 23 · 20s: 11 · 10s: 4 · 0s: 1 |

```ts
/** Juegos que hacen que una decena cuente como usada: con uno, es un accidente. */
const SCALE_MIN_GAMES = 3;

metric: ({ games }) => {
  const bands = new Map<number, number>();
  for (const { game } of allGames(games)) {
    const grade = gradeIfScored(game);       // GUARDA: sin nota no es un cero (§7.5)
    if (grade === null) continue;
    const band = Math.min(9, Math.floor(grade / 10));
    bands.set(band, (bands.get(band) || 0) + 1);
  }
  return { value: [...bands.values()].filter((count) => count >= SCALE_MIN_GAMES).length };
},
```

Complementa «Nota del crítico», que solo pide dispersión: aquí lo que se premia es **no dejarte tramos sin usar**,
que es la diferencia entre puntuar y tener criterio. Va sin fecha, como «Sin cabos sueltos», y la píldora tiene
que ir **sin aspa** (`10` decenas, no `×10`): una línea más en la lista de `medalThreshold`.

### E2 · «Ni con un palo» — el suspenso de verdad

| | |
|---|---|
| `key` | `suspenso` · familia `mirror` · rareza `comun` · **oculto** · icono `ThumbsDown` |
| `steps` | `[1, 5, 10, 15, 25]` |
| **Valor real** | **16** juegos con menos de 30 → escalón 3 de 5 |

Cierra el trío que ya está a medio hacer: «Por pura cabezonería» (terminar con menos de 50), «No eres tú, soy yo»
(dejar con 70 o más) y este, el que reconoce que te atreves a poner notas bajas. Con `gradedAt` como sello cuando
exista (8 juegos hoy).

---

## 7. Bloque F — Cumplir lo que marcaste

### F1 · «Dicho y hecho» — rejugables que de verdad rejugaste

| | |
|---|---|
| `key` | `palabra` · familia `mirror` · rareza `infrecuente` · icono `BadgeCheck` |
| `steps` | `[1, 3, 5, 10, 15, 25]` |
| **Valor real** | **15** de 73 marcados (58 siguen esperando) → escalón 5 de 6 |

```ts
metric: ({ games }) => count(allGames(games).map(({ game }) => ({
  ok: Boolean(game.replayable) && playedYears(game).length >= 2,
  at: lastPlayedYearEnd(game),
}))),
```

Es la gemela que le falta a la pareja que ya funciona: «Cuenta pendiente» marca la revancha y «Volver a la
hoguera» la cumple; «Aquí volveré» marca el rejugable y **nadie** cumple nada. Y de paso arregla un desequilibrio
real: hoy marcar 100 juegos como rejugables da medalla y rejugarlos no.

---

## 7bis. La que se pidió sobre la marcha: volver al mismo juego

«Dar una oportunidad y rejugar, hasta tres veces» tenía dos lecturas y **el dato descartó una de las dos**:

| Lectura | Medido | Veredicto |
|---|---|---|
| **La profundidad en UN juego**: volver a él una segunda, tercera, cuarta vez | máximo **5** (Portal) · con 3 vueltas: 5 juegos · con 4: uno | **Implementada** |
| **Dar otra oportunidad a algo que fue mal**: rejugar un abandono, cumplir un `retry`, insistir con algo flojo | **0, 0 y 0** — ni un abandonado con dos años jugados, ni un `retry` con vuelta, y de los 21 juegos rejugados el más bajo es un 68 | Descartada: daría cero |

La segunda es más bonita como idea y no existe en tus datos: **todo lo que rejugas está por encima de 68 y todo
está en Terminados**. Una escalera que da cero no es un reto, es un error — la misma razón por la que se cae
«Contradicción» en el §8.

### «Otra oportunidad»

| | |
|---|---|
| `key` | `otra-oportunidad` · familia `mirror` · rareza `infrecuente` · icono `RefreshCcwDot` |
| `steps` | `[2, 3, 4, 5, 6]` |
| **Valor real** | **5** → cuatro escalones de cinco |

Los textos van con el ordinal, que es lo que hace que la frase diga exactamente lo que mide: «Vuelve a un mismo
juego por **tercera** vez». Y el **6 no lo alcanza nadie** en la biblioteca medida, a propósito: con la escalera
en `[2,3,4,5]` se completaba de estreno para quien ya tiene un juego muy rejugado, y una escalera terminada el
primer día no es un reconocimiento, es un regalo. El suelo está medido; el techo deja sitio.

Y no pisa a «El día de la marmota», que es su complemento exacto: allí hacen falta N juegos, aquí basta uno.

---

## 8. Medido y descartado

Lo que parecía buena idea y el dato dijo que no. Va aquí para no volver a proponerlo dentro de seis meses.

| Idea | Dato | Por qué no |
|---|---|---|
| «Atracón»: cerrar N juegos en un día | máximo **16**, el 6-jul-2026 | Ese día no terminaste 16 juegos: los **catalogaste**. Es el falso positivo de «Speedrun» otra vez, y sin forma de distinguirlo |
| «Vampiro»: cerrar de madrugada | **0** cierres antes de las 6:00 | Los sellos son de cuando tecleas la ficha, no de cuando juegas. Mediría tus horarios de administración |
| «Contradicción»: la misma etiqueta como virtud y como defecto | **0** de 302 | No existe en los datos, y una escalera que da cero no es un reto, es un error |
| «Paciencia extendida»: esperar años en Próximos | espera máxima **69 días** | `enteredAt` empieza en julio de 2026. Nace dormida y despierta en 2027 |
| Índice de plataformas | 5, pero **242 de 302 son Steam** | Mide la tienda, no el jugador |
| «Políglota»: un juego con 3 géneros | máximo **2** géneros por juego | El modelo de datos no da para más |
| Reseñas por año / racha de reseñas | **11** juegos con `reviewedAt` | Sin cobertura histórica; lo tapa «Obra completa», que no necesita fechas |

---

## 9. Qué cuesta cada escalera

Por escalera, y en este orden:

1. **`catalog.ts`** — el bloque declarativo, **al final de su familia** (el orden de `LADDERS` es contrato).
2. **`AchievementSprite.tsx`** — un `symbol` con los paths de Lucide, `id="ach-<key>"`. El comando para sacarlos
   está en la receta, §2. Los catorce iconos propuestos existen en Lucide; ninguno hay que dibujarlo.
3. **`mirrorOrder.ts`** — los `id` nuevos **al final** de `MIRROR_IDS`, nunca intercalados.
4. **`tests/unit/achievements.test.ts`** — tres cifras clavadas a mano que hay que recalcular:
   `MIRROR_ORDER.length` (hoy **306**), y el techo del catálogo (**6.110 puntos, nivel 41**).
5. **`summary.ts`** — mirar si la curva de nivel sigue teniendo sitio por encima, que es para lo que están
   escritas esas cifras en su comentario.
6. **`docs/logros/catalogo.json`** — se regenera desde el código, no se edita.

**Lo que cuesta en puntos.** Las catorce escaleras suman 78 escalones y unos **1.400 puntos** de techo (≈ +23 %),
que en la curva actual son unos cinco niveles más de recorrido. Si entra solo el bloque A, son 18 escalones y 450
puntos.

**Lo que NO cuesta: el porcentaje de nadie.** Es lo que hace baratas estas altas y conviene saberlo antes de
decidir cuántas entran. El denominador no son los 306 escalones, es la **frontera abierta** (`visibility.ts`): de
una escalera nueva solo entra en la cuenta el escalón alcanzado y el siguiente. Así que catorce escaleras nuevas
añaden ~28 escalones al denominador, no 78, y el porcentaje que ve cada persona baja unos pocos puntos en vez de
desplomarse. Los puntos ya conseguidos no se tocan nunca (marca de agua, §7.1).

---

## 10. Cómo quedó

Las catorce, con el valor **medido ya por el código del catálogo** sobre los 302 juegos (no a mano, como las
tablas de arriba). El orden es el de declaración: al final de su familia, como manda la regla 2.

| Escalera | Nombre | Umbrales | Rareza | Icono | Valor real | Escalones |
|---|---|---|---|---|---|---|
| `marmota` | El día de la marmota | 2·3·4·5·6 | raro | `LayoutGrid` | **3** | 2 de 5 |
| `todos-los-palos` | A todos los palos | 3·4·5·6·8·10·12 | raro | `Shapes` | **9** | 5 de 7 |
| `anadas` | Libro de cosechas | 2·3·5·7·9·12·**15** | raro | `Wine` | **9** | 5 de 7 |
| `otra-oportunidad` | Otra oportunidad | 2·3·4·5·6·**7·8·10** | infrecuente | `RefreshCcwDot` | **5** | 4 de 8 |
| `horas-totales` | El peso de las horas | 100 … 10.000 | infrecuente | `Weight` | **3.897 h** | 6 de 9 |
| `biblioteca` | El bibliotecario | 25 … 1.000 | común | `Archive` | **302** | 5 de 8 |
| `mania` | Ya sé cómo acaba esto | 5·10·20·35·50·**75** | infrecuente · oculto | `Frown` | **36** | 4 de 6 |
| `firma` | Sé lo que me gusta | 10·25·50·75·100·150·**200** | común | `Fingerprint` | **133** | 5 de 7 |
| `reencuentro` | Cuánto tiempo sin verte | 1·3·5·8·12·**15** | raro | `CalendarClock` | **10** | 4 de 6 |
| `arqueologia` | Memoria de otro siglo | 5·10·15·20·25·30 | raro | `Landmark` | **26 años** | 5 de 6 |
| `suspenso` | Ni con un palo | 1·5·10·15·25 | común · oculto | `ThumbsDown` | **16** | 4 de 5 |
| `palabra` | Dicho y hecho | 1·3·5·10·15·25·**30·40** | infrecuente | `BadgeCheck` | **15** | 5 de 8 |
| `obra-escrita` | Obra completa | 500 … 100.000 | infrecuente | `ScrollText` | **13.683 palabras** | 4 de 7 |
| `vocabulario` | Diccionario de a bordo | 5·10·15·20·30·40·50·**60·75** | común | `Tags` | **41** | 6 de 9 |

## 11. Lo que cambió al implementarlo

Cinco cosas se decidieron con algo delante que este documento no tenía, y son las que conviene saber:

1. **Tres dibujos se cambiaron por lo que pasa a 28 px**, que es el tamaño que mata iconos y la comprobación que
   pide la receta. `Grid3x3` era una rejilla de cinco líneas y a 28 px se volvía una mancha → `LayoutGrid`.
   `CalendarRange` en «Libro de cosechas» era **un segundo calendario** indistinguible del de «Cuánto tiempo sin
   verte» → `Wine`, que además dice añada. Y `todos-los-palos` heredó `Shapes` —triángulo, cuadrado, círculo—,
   que dice «distintos» mejor que una rejilla.
2. **El vocabulario da 41, no 51.** Las virtudes y los defectos comparten palabras («Jugabilidad» está en los
   dos lados) y `firstOfEach` normaliza a minúsculas, que es lo correcto: son la misma etiqueta.
3. **La píldora aprendió dos casos**, no uno: `3×3` para los índices cuadrados y **la cifra sola para las
   magnitudes** (`1000` horas, `25000` palabras, `26` años). El aspa dice «tantas veces» y en un total mentiría,
   igual que mentía en las rachas.
4. **El margen del espejo se ha terminado, y no se pierde ni un logro.** Con el catálogo ENTERO conseguido la
   cadena llena **1.022 de los 1.024** caracteres que valida la regla y solo **140 de los 393** logros conservan
   su fecha. El bitmap va siempre entero y lo que se recorta es la cola de fechas por rareza
   (`packAchievements`), así que la vitrina y el porcentaje están a salvo; lo que ya no cabe es dar por hecho que
   la próxima ampliación conserva las fechas. Está anotado en el README de estos activos.
5. **Y se tapó un agujero que la receta avisaba y no cazaba nadie**: un `icon` sin su `symbol` deja la medalla
   **vacía**, sin error y sin test que se enterase. Con catorce escaleras de golpe dejó de ser remoto, así que
   ahora hay un test que casa cada escalera con su dibujo contra el DOM montado.

De paso, `catalogo.json` corrigió el coste del tramo abierto de la curva de nivel: decía 500 y el código cobra
250 (`OPEN_TIER_COST`). El activo era el que estaba mal.

## 12. Segunda pasada: los techos, más arriba

Con las catorce en pantalla, siete se quedaban cortas por arriba. Se subieron **once escalones, todos por
encima** de los que ya había: un umbral declarado no se toca jamás —endurecerlo retira un logro concedido y
ablandarlo regala uno que nadie hizo—, así que subir un techo es **añadir**, nunca mover.

| Escalera | Antes | Ahora | Escalones nuevos |
|---|---|---|---|
| `vocabulario` · Diccionario de a bordo | …40·50 | …40·50·**60·75** | 2 |
| `palabra` · Dicho y hecho | …15·25 | …15·25·**30·40** | 2 |
| `otra-oportunidad` · Otra oportunidad | …5·6 | …5·6·**7·8·10** | 3 |
| `reencuentro` · Cuánto tiempo sin verte | …8·12 | …8·12·**15** | 1 |
| `firma` · Sé lo que me gusta | …100·150 | …100·150·**200** | 1 |
| `mania` · Ya sé cómo acaba esto | …35·50 | …35·50·**75** | 1 |
| `anadas` · Libro de cosechas | …9·12 | …9·12·**15** | 1 |

Dos cosas que trajo la subida:

- **Los ordinales llegan al décimo.** «Otra oportunidad» escribe su meta con el ordinal de la vuelta («Vuelve a un
  mismo juego por **décima** vez»), así que `ORDINAL_TIMES` estrena novena y décima. Con respaldo numérico y sin
  `throw`: un umbral nuevo no puede tumbar la pantalla por un rótulo que falte.
- **El techo pasa a 7.410 puntos, y el nivel máximo sigue en 46.** Quedan cuatro niveles del tramo cerrado por
  encima, así que la curva aguanta otra ampliación sin retocarse.

Y el catálogo entero se probó **contra el build de producción**, no solo en jsdom: los siete recorridos de
`tests/e2e/achievements.test.ts` comprueban que los siete techos se conceden con una biblioteca que los alcanza,
que las medallas tienen su dibujo —el sprite vive en un chunk perezoso y un `<use>` huérfano deja el disco vacío
sin un solo error en consola— y que el aviso del instante nombra un logro cuando sube uno y los cuenta cuando
suben varios.
