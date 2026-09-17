# Plan: el scroll al navegar, y lo que queda abierto

> Sale de una revisión del 17-09-2026 (arranque, seguridad, rendimiento) y de un síntoma que se nota usando la
> aplicación: al cambiar de pantalla, el scroll se queda donde estaba.

## 1. El scroll al navegar  ·  ✅ **HECHO** (`fcea1d2` + `26115c1`)

> **Lo que se entregó primero estaba a medias y en verde.** Subir al entrar funcionaba; **volver atrás no
> restauraba nada** y los 2.228 tests de jsdom lo daban por bueno, porque allí `window.scrollY` vale siempre 0.
> Lo destapó `tests/e2e/scroll.test.ts`, contra el build de producción.
>
> **Guardar la posición tuvo tres intentos, y los dos primeros guardaban un cero:**
>
> 1. *Limpieza de un efecto pasivo.* Corre después de los efectos de layout de la pantalla nueva: para entonces
>    nuestro propio código ya había subido la página.
> 2. *Limpieza de un efecto de layout*, que corre antes. Tampoco: React ya ha pintado la pantalla nueva, el
>    documento ha encogido y el navegador ya ha recortado el scroll por su cuenta.
> 3. *Un oyente de `scroll` que mantiene la última posición.* Casi: al hacer `pushState` **el navegador pone el
>    scroll a cero y dispara su evento antes de que corra ningún efecto de React**, machacando el valor bueno
>    justo antes de apuntarlo. El log lo enseñaba: `y=0 max=5468 ultima=600` — con la página todavía larga, así
>    que no era el recorte por altura.
>
> **La solución** es distinguir ese cero por lo que es: un salto de cientos de píxeles a cero en menos de un
> fotograma. Ninguna mano hace eso —ni la rueda, ni el dedo, ni el «volver arriba» de la casa, que va suave—.
> Lo único que se pierde es quien pulsa `Inicio` y navega en el mismo suspiro: al volver se le devuelve a donde
> estaba antes de pulsar.
>
> **Otras dos cosas que aparecieron y conviene no reaprender:**
>
> - **La carga inicial no se toca.** Ahí manda `history.scrollRestoration`, y pisarlo subiría al principio a
>   quien recarga a media lista. Aun así, recargar tampoco conserva la posición, y **no es culpa nuestra**: el
>   virtualizador del listado llama a `scrollTo({top: 0})` nada más montarse.
> - **`AchievementsScreen` recibe el ancla por PROP, no leyendo la ruta.** El primer intento la ató al enrutador
>   y rompió 44 pruebas: es una pantalla de presentación que usan también las fichas ajenas
>   (`ProfileAchievements`) y que las pruebas montan suelta. Quien sabe de rutas es `StatsHub`.
>
> El salto al logro va con `state.anclaje`, que es además la señal por la que el hook central se aparta: sin
> ella habría dos saltos, primero al principio y después a la medalla.

### Lo que quedó (para no releer el hook)

| Caso | Qué hace |
|---|---|
| Pulsar una opción (PUSH) | arriba del todo |
| Volver atrás (POP) | a donde estabas, insistiendo ~20 fotogramas por si la lista aún no tiene alto |
| `replace` | nada |
| Con `state.anclaje` | nada: decide la pantalla de destino |
| Carga y recarga | nada: manda el navegador |

### Lo que no se toca, y por qué

Los dos parches que ya existían **se quedan**: `SocialHub.tsx:310` (sube al abrir un detalle) y
`StatsPanel.tsx:121` (`scrollIntoView` al abrir un año). Ninguno de los dos es un cambio de RUTA —son cambios de
estado dentro de la misma pantalla—, así que la pieza central no los ve y quitarlos rompería dos comportamientos
que hoy funcionan bien.

---

## 2. Purgar los restos legacy de los perfiles  ·  **seguridad, operativo**

`profiles/{userId}` lo lee **cualquier usuario autenticado** cuando `social.enabled == true`
(`firestore.rules:322`). El código ya hace lo correcto: al guardar un perfil borra `email` y `social.gistId` con
`deleteField()` (`firebaseRepository.ts:163,171`), y `/admin` tiene los tres botones de purga (email, gist de
juegos, token en claro).

Pero eso solo sanea a quien **vuelve a guardar**. Los perfiles de quien no ha vuelto siguen con sus restos en
producción. **No es código: es pasar la purga desde el panel.** Es el único punto de seguridad abierto.

---

## 3. `IconSprite` a `.svg` externo  ·  **solo cuando apriete**

28,4 kB sin comprimir, el 15 % del chunk de arranque y el mayor con diferencia. Sacarlo con
`<use href="/sprite.svg#icon-x">` da ~6 kB comprimidos y subiría el margen de 5,7 a unos 11 kB.

Coste: una petición más (precacheable, así que solo la primera visita), toca el componente `Icon` que usa toda
la aplicación, y en esa primera visita los iconos pueden entrar con un instante de retraso.

El desglose completo y el método de medición están en el comentario de `scripts/ci-validate.js`.

---

## 4. La versión 1.3.1  ·  **sin desplegar**

Entra todo lo de esta tanda y ya está en las notas: las carátulas, la persistencia silenciosa, el `state` de
OAuth, la ruleta fuera del arranque, el scroll y el salto al logro. El bump (`5a590ae`) quedó ANTES de esos
últimos commits en el historial; como no se ha desplegado, no se reescribió nada: el changelog es el que manda.

Recordatorio de releases anteriores: **el tag puede no subir** —el PAT no tiene scope `workflow` y la clave SSH
es de otra cuenta—; la rama sí sube sola.

---

## 5. Lo que hereda el plan de las carátulas

De `docs/plan-persistencia-caratulas.md`, sin cambios:

- **La comprobación del criterio** la primera vez que esto esté en producción: borrar `mis-listas-covers-done-v2`
  y `mis-listas-covers-none`, recargar con Network abierto y mirar si las peticiones `m=1` salen como
  `(disk cache)`. Es lo que decide si Firestore vuelve a la mesa.
- **WebKit con la app en la pantalla de inicio**: ¿concede la persistencia? Necesita un toque manual en un
  dispositivo. No bloquea nada.

---

## Estado y orden

| | |
|---|---|
| 1. El scroll al navegar | ✅ hecho (`fcea1d2`, `26115c1`) |
| 2. Purgar los perfiles | ⬜ pendiente — operativo, desde `/admin` |
| 3. `IconSprite` externo | ⬜ aplazado — solo cuando el margen de arranque apriete |
| 4. Desplegar la 1.3.1 | ⬜ pendiente |
| 5. Comprobación del criterio de las carátulas | ⬜ pendiente — justo después de desplegar |

**Orden:** desplegar la 1.3.1 → comprobar el criterio → la purga. `IconSprite` no tiene prisa.
