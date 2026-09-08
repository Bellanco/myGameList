# Receta: cómo se hace un logro nuevo

Todo lo que hay que saber para añadir logros **sin volver a decidir nada**. El porqué de cada decisión está en
[`../plan-logros.md`](../plan-logros.md); esto es el manual de la casa, escrito el día que la medalla dejó de ser
un cuadro y pasó a ser un disco.

---

## 1. Cómo se ve una medalla, hoy

**Un disco en penumbra.** Fondo pardo casi negro con un foco cálido entrando por arriba a la izquierda y el
dibujo en oro recogiendo esa luz. La referencia es el tenebrismo —Caravaggio, Ribera— y no es un capricho: un
disco oscuro con **una sola cosa iluminada dentro** es lo que aguanta los 28 px de la tira del feed sin volverse
una mancha. Se eligió tras comparar seis direcciones (renacimiento, Witcher, cyberpunk, superrealismo, Like a
Dragon y óleo generativo) sobre los mismos cuatro logros.

| Pieza | Valor |
|---|---|
| Forma | **Círculo**. El filo continuo es lo que permite que el grado se lea a 28 px |
| Lado | **48 px** en el listado y en la tira de una ficha · 28 px en la tarjeta del feed · 72 px (`lg`) sin uso hoy |
| Fondo | `radial-gradient` de tres pardos, foco al 27 % / 17 % — tokens `--ach-gnd-*` |
| Dibujo | Trazo de **Lucide** sobre `viewBox` 24, al 54 % del disco, centrado al 45 % de alto |
| Relieve | **Tres pasadas del mismo símbolo**: sombra negra (+0,5 / +0,7), oro (`#ach-lux`) y chispa clara (−0,3 / −0,4) |
| Aura | Halo exterior de color: dice la **rareza** |
| Temple | Filo interior en tres tramos: dice el **tramo de la escalera** |
| Píldora | Cifra del escalón montada en el **canto de abajo**, sin unidad. No sale en `sm` (28 px) |

**Las unidades del relieve son del `viewBox`, no píxeles de pantalla.** Es lo que hace que el desplazamiento
encoja con el disco en vez de comerse el dibujo en la tira pequeña.

### Las tres señales, y por qué van donde van

- **Aura exterior → la rareza.** Escala de loot de RPG: gris común, verde infrecuente, morado raro, naranja
  excepcional. Se salta el azul porque el azul es el acento de la app.
- **Temple del filo → el tramo.** Cobre hasta 1/3 de la escalera, plata hasta 0,7, oro por encima
  (`temperClass()` en `core/constants/achievementLabels.ts`).
- **Píldora del canto → la cifra del escalón.** `×100` para lo que cuenta cosas, `≤5` en las descendentes, `75%`
  en la única de porcentaje y **la cifra sola** en las de racha —«12 meses seguidos» no son doce cosas contadas,
  así que ahí el aspa mentiría—. Va **sin unidad**: dentro de una escalera la unidad es siempre la misma, y la
  escribe la condición de la fila. Montada en el borde de abajo y no dentro, que es lo que la hace caber a 48 px:
  centrada tapa el dibujo y en la esquina se sale por la curva. `medalThreshold()`.

**El orden de los anillos es la mitad del diseño.** De fuera adentro: halo difuso → anillo de rareza → **canto
negro** → filo del temple → cuerpo. Sin ese canto de por medio, a 48 px las dos señales se leen como una sola y
el temple desaparece.

**Tres tramos y no once no es una pérdida.** La cifra exacta ya la dicen el nombre del logro («Créditos finales
V») y la condición de su fila. El temple es «vas empezando / por la mitad / estás arriba», de un vistazo y sin
leer. Sustituye al numeral romano, que no sobrevivía a los 28 px.

**El bloqueado sí lleva temple, el oculto no.** De un logro bloqueado se enseña a propósito de qué va y por dónde
va su escalera —es lo que hace útil la mitad de abajo del listado—; del oculto no se enseña nada. En el bloqueado
el filo se queda en **peltre**: misma gradación, sin metal, para que no se lea como conseguido.

> **⚑ Ojo con los metales del rango.** `_tiers.scss` usa bronce/plata/oro/mithril para el rango de perfil, y en la
> ficha del hub esa muesca convive con la tira de medallas. Por eso el temple se queda en el **filo** —un hilo de
> 2-3 px— y **nunca tiñe el cuerpo del disco**. Si algún día chirría, es esto lo que hay que revisar.

---

## 2. El dibujo NO se dibuja

Sale de **[Lucide](https://lucide.dev)** (licencia ISC, © Lucide Contributors), copiado como `symbol` dentro de
`view/components/AchievementSprite.tsx`. **Sólo si no existe icono se dibuja a mano**: las 50 escaleras actuales
lo tenían, de 1.737 candidatos.

Para añadir uno:

1. Busca el icono en <https://lucide.dev/icons> y quédate con su nombre en PascalCase (`Trophy`, `Hourglass`).
2. Saca sus paths del paquete UMD y pégalos como un `symbol` más, con `id="ach-<key de la escalera>"` y
   `viewBox="0 0 24 24"`. Los atributos van en camelCase (JSX): `strokeWidth`, `strokeLinecap`.
3. **Sin `fill` y sin `stroke` propios.** El trazo lo pone la medalla; un `fill` codificado rompe las tres pasadas.

```bash
# los paths de un icono, listos para pegar
curl -s https://cdn.jsdelivr.net/npm/lucide@0.460.0/dist/umd/lucide.min.js -o /tmp/lucide.js
node -e 'const fs=require("fs"),vm=require("vm");const s={window:{},console};s.globalThis=s;s.self=s;
vm.createContext(s);vm.runInContext(fs.readFileSync("/tmp/lucide.js","utf8"),s);
console.log(JSON.stringify(s.lucide.icons[process.argv[1]][2]))' Trophy
```

**El `icon` de la escalera es su `key`.** Las 50 coinciden y conviene que siga así: un `id` que no case deja la
medalla vacía y no lo caza ningún test.

**El sprite no se monta en el arranque.** Va en las dos rutas perezosas, nunca en `App.tsx` (presupuesto de
`ci-validate`). Y la hoja `achievements.scss` se importa **desde el componente de la medalla**, no desde
`stats.scss` ni `social.scss`: colgarla de uno deja la otra pantalla sin estilos y sin error.

---

## 3. Declarar la escalera

En `core/achievements/catalog.ts`, un objeto en `LADDERS`:

```ts
{
  key: 'nombre-de-lo-que-se-mide',   // slug de LA MÉTRICA, nunca del nombre visible
  family: 'mirror',                  // mirror | data | social | annual | onboarding
  steps: [5, 10, 25, 50],            // ascendentes (o descendentes con `descending: true`)
  rarity: 'infrecuente',             // decide los puntos, el aura y el recorte al empaquetar
  icon: 'nombre-de-lo-que-se-mide',  // = key, y el symbol se llama `ach-<eso>`
  labels: { name: 'Un guiño', condition: 'La condición en llano' },
  goal: (step) => `${step} semanas seguidas`,   // opcional: por defecto «condición: umbral»
  metric: (input) => count(...),     // función PURA de AchievementInput
}
```

### Las reglas que no se negocian

1. **El `id` lleva el umbral, no la posición** (`completados-50`, no `completados-3`). Es lo que hace que meter un
   escalón intermedio sea aditivo en vez de retirarle a todo el mundo un logro que ya tenía publicado.
2. **Un `id` no se renombra ni se reutiliza jamás.** El nombre visible sí se puede retocar.
3. **El orden de `LADDERS` es contrato**: el espejo que viaja al gist es un mapa de bits posicional, y reordenar
   reescribe la vitrina de todo el mundo. Los logros nuevos van **al final**.
4. **Un dibujo por escalera, no por logro.** Los escalones comparten icono y los distingue el temple.
5. **La métrica es pura y se prueba con fechas fijas.** Nada de `Date.now()` dentro: `now` llega por parámetro.
6. **Nada se compara contra `listedAt`.** En un juego catalogado hacia atrás esa fecha es la de catalogarlo, no la
   de que pasara nada: la definición ingenua de «Speedrun» daba 42 aciertos y los 42 eran falsos.
7. **Guarda la ausencia de dato.** Si la métrica lee un campo que puede faltar, decide qué significa faltar: sin
   eso, «Lo terminé por orgullo» cuenta todos los completados *sin nota* y «Exterminatus» salta con la biblioteca
   vacía. En descendentes, el valor de respaldo es `UNREACHABLE`, nunca 0.
8. **Los primeros pasos (`onboarding`) no puntúan ni se publican**, y con un solo escalón no llevan temple.

### Cómo se escribe la condición

**Siempre con `goal`, nunca con el fallback.** Sin `goal`, `expand()` compone `«condición: umbral»` —«Juegos
terminados en un mismo año natural: 20»— que es como habla una máquina y no como se lee una lista. Hay un test
que lo impide (*«cada escalera escribe su condición en una frase»*), así que una escalera nueva sin `goal` no
pasa de la primera ejecución.

Las reglas de la casa, sacadas de reescribir las cincuenta:

- **Imperativo, de tú, y la cifra dentro de la frase**: «Termina 100 juegos», «Anota razón y reseña en 75
  abandonos». Ni «Juegos terminados: 100» ni el infinitivo de manual («Terminar 100 juegos»): esto le habla a
  quien lo lee, no describe una tarea. Hablan así los cincuenta, primeros pasos incluidos.
- **Resuelve el singular.** `step === 1 ? 'Termina un juego' : \`Termina ${step} juegos\`` — «Termina 1 juegos»
  se lee como un bug, porque lo es.
- **Di lo que la métrica mide de verdad, aunque cueste una palabra más.** «Cerrar juegos de tres géneros
  distintos en 3 meses **distintos**»: sin ese «distintos» se lee como un plazo de tres meses, que es otra cosa.
- **Cuidado con los verbos que no se dicen.** «Cerrar un año natural» no existe; lo que se hace es «tener
  actividad los doce meses de un año natural».
- **Las descendentes se dicen hacia abajo**: «Dejar Próximos en 5 juegos o menos», nunca «Próximos: 5».
- **La unidad va en la frase, no en la medalla.** La píldora del disco lleva la cifra sola; quien pone «semanas»,
  «meses» o «horas» es esta condición.

### Cuánto vale cada rareza

`comun` 5 · `infrecuente` 10 · `raro` 25 · `excepcional` 60. La rareza la pone la **escalera** y la heredan sus
escalones: un escalón alto no es «más raro» por estar arriba, ya suma más porque hay más escalones debajo.

---

## 3bis. En qué orden salen

En el listado y en la tira, **lo conseguido va primero, por día, de la jornada más reciente a la más antigua** —y
dentro del mismo día, **lo más raro arriba**, que es el criterio con el que el feed ordena esa misma jornada—. A
igualdad de rareza, el nombre, para que el orden no baile entre recargas.

Por día y no por instante porque el día es lo que se ve: la fila enseña «31 ago 2026», y dos logros de esa
jornada ordenados por milisegundos quedaban en un orden que no se corresponde con nada de lo que hay en pantalla.
Lo conseguido **sin fecha** cae al final de lo conseguido: son los de la primera evaluación del dispositivo, los
que ya estaban antes de que hubiera con qué fecharlos.

Lo que falta va detrás, **por lo cerca que está de caer**, que es la información útil de esa mitad. El comparador
es `compareEarned()` en `viewmodel/useAchievements.ts` y lo comparten la tira y el listado.

## 4. Antes de dar por bueno un logro nuevo

- [ ] `npm test` — el catálogo tiene pruebas de forma (ids únicos, umbrales ordenados, iconos existentes)
- [ ] `npx tsc --noEmit` y `npx eslint src tests`
- [ ] Míralo **a 28 px** en la tarjeta del feed, no sólo en el listado: es el tamaño que mata dibujos
- [ ] Míralo **bloqueado**: el dibujo tiene que seguir diciendo de qué va
- [ ] Comprueba que el umbral es alcanzable de verdad — los del catálogo están **medidos** sobre una biblioteca
      real de 302 juegos, no supuestos (§6.8 del plan)
- [ ] Si la escalera necesita un sello que no existe en bibliotecas antiguas, anótala como **dormida** y di qué le
      falta para despertar
