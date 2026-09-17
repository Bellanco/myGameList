# Plan: el scroll al navegar, y lo que queda abierto

> Sale de una revisión del 17-09-2026 (arranque, seguridad, rendimiento) y de un síntoma que se nota usando la
> aplicación: al cambiar de pantalla, el scroll se queda donde estaba.

## 1. El scroll al navegar  ·  **lo único que se ve**

### Qué pasa hoy

**No hay ningún componente que gobierne el scroll al cambiar de ruta.** `ScrollToTop` es solo el botón flotante
de «volver arriba», y React Router no resetea la posición por su cuenta: con `pushState`, el navegador deja al
usuario donde estaba.

Por eso se nota inconsistente: hay exactamente **dos parches manuales**, y solo cubren su caso.

| Dónde | Qué hace | Es cambio de ruta |
|---|---|---|
| `SocialHub.tsx:310` | `window.scrollTo({top:0})` al abrir detalle o reseña | no, es panel interno |
| `StatsPanel.tsx:121` | `scrollIntoView` al abrir un año desde la curva | no, es cambio de periodo |

Todo lo demás —cambiar de pestaña, entrar en ajustes, abrir el perfil, y el salto a `/logros` desde el aviso de
logro (`App.tsx:242`)— te deja a media página de una pantalla que ya es otra.

### La regla que propongo

Una sola pieza, gobernada por el **tipo** de navegación:

- **PUSH** (pulsar una opción, ir a una pantalla nueva) → **arriba del todo**.
- **POP** (volver atrás, incluido el botón «volver» con `backTo` de `StatsHub`) → **restaurar la posición que
  tenías**. Es lo que hace que volver no se sienta como perder el sitio.
- **REPLACE** → no tocar nada.

### Qué NO se toca

Los dos parches de la tabla **se quedan**: no son cambios de ruta, son cambios de estado dentro de la misma
pantalla, y la pieza central no los ve. Quitarlos rompería dos comportamientos que hoy están bien.

### El detalle a cuidar

Si alguna pantalla desplaza un contenedor interno en vez de la ventana, hay que apuntar a ese contenedor. Es el
mismo problema que ya resuelven `FloatingControls` y `ScrollToTop` mirando el `event.target` del scroll; de ahí
se copia el criterio.

### A confirmar antes de implementar

Al pulsar el aviso de un logro, ¿basta con subir arriba de `/logros`, o debe llevar **al logro concreto**
(resaltándolo)? Lo segundo es más útil y bastante más trabajo: el aviso tendría que pasar el id y la pantalla
hacer `scrollIntoView` sobre esa medalla.

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

Entra todo lo de esta tanda, incluida la ruleta (`e479a50`), que ya está en las notas. Cuando el scroll esté
hecho, entra también aquí.

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

## Orden sugerido

1. **El scroll** — es lo único que el usuario nota, y entra en la 1.3.1.
2. **Desplegar la 1.3.1** y, acto seguido, la comprobación del criterio.
3. **La purga** de los perfiles, desde el panel.
4. **`IconSprite`**, cuando el margen de arranque lo pida.
