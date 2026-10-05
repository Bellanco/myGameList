# Premios: los votos de cada uno, a la vista hasta la siguiente edición

Estado (05-10-2026): **hecho en `develop`**, sin publicar en la app. Reglas desplegadas el 05-10-2026. Los votos de
2025 se cargan con `scripts/premios-2025-votos-por-persona.mjs` (lo lanza el usuario con su clave).

## Qué se quiere

Hasta ahora publicar una edición archivaba, concedía trofeos y **borraba las papeletas**: lo que votó cada persona
no lo volvía a ver nadie.

Ahora, al publicar, lo que votó cada uno se copia a un resumen que **quien votó en esa edición** ve en la pantalla
de resultados como «Clasificación final»: una persona por fila y, al desplegarla, lo que votó en cada categoría, si
acertó y el peso cuando no es 1 (`×3`, `×0,5`). Dura **hasta que se abre la siguiente edición**, o hasta que el
administrador lo borra a mano desde el histórico.

El ciclo sigue siendo de tres pasos (sin edición → votación abierta → cerrada, sin publicar → publicar).

## Decisiones

**04-10-2026** (primera versión, publicada en la 1.5.1): un estado intermedio «Publicada, votos a la vista» con
las papeletas guardadas, y un botón «Terminar» que las retiraba; solo para las ediciones abiertas desde entonces.

**05-10-2026** (la que vale), a petición del usuario:

- **Hasta la siguiente edición**, no hasta «Terminar». Con eso el estado intermedio y su botón sobran: el resumen
  dura por su cuenta, y las papeletas se retiran al publicar como siempre. Se quitan.
- **Lo ven quienes tienen sesión Y votaron en esa edición.** Ni cualquiera con sesión ni el enlace público: el
  archivo de `premiosResults` sigue sin votos individuales (`plan-unificar-premios.md` §4.2).
- **2025 también**, con los votos de la hoja (`2025 Game Awards - Resultado.csv`, sin versionar: lleva nicks). De
  sus 14 participantes, 7 tienen cuenta y son los que lo pueden ver.
- **Borrado manual** desde el histórico, solo en la edición que los tenga.
- **Ranking denso, como siempre** (`assignDenseRanks`): empatados comparten puesto, sin huecos.

### Borrar las papeletas no es cuestión de presupuesto

Medido con 2025 (14 papeletas, 25 categorías): ~2 kB por papeleta, ~30 kB por edición frente a 1 GiB de Spark;
borrarlas son 14 borrados de 20.000 diarios. Se borran porque `premiosBallots/{uid}` no lleva la edición en la
clave —una papeleta vieja impide votar en la siguiente— y porque llevan uid y nombre de Google. El resumen no lleva
ninguna de las dos cosas, así que puede durar más que ellas.

## Diseño

### Datos

- **`premiosReveal/{seasonId}`**: el resumen, UN documento por edición (una lectura por visita). Sin uid ni nombre
  de Google; nombres de nominados, pesos y ganadores salen del archivo, que la pantalla ya lee.

  ```ts
  interface PremiosRevealedBallot { rank; profileId; nickname; points; selections: Record<categoría, optionId> }
  interface PremiosReveal { seasonId: string; ballots: PremiosRevealedBallot[] }
  ```

- **`premiosAdmin/voters-{seasonId}`**: `{ seasonId, uids }`, quién votó. Es el permiso: lo consultan las reglas y
  no lo lee nadie más. No puede ser «tiene papeleta», como en la primera versión: las papeletas ya no existen
  cuando se miran los votos.
- **`premiosConfig/voting.votesSeasonId`**: qué edición guarda votos (público como el resto del calendario; dice
  QUE hay, no cuáles). Con él la pantalla no pide un documento que no existe.
- Publicar escribe los tres antes de retirar las papeletas. Abrir la siguiente edición borra todos los resúmenes y
  listas (`discardAllSeasonVotes`) y vacía la marca. `deleteSeasonVotes` lo hace con una; borrar una edición del
  histórico se lleva también sus votos.
- **No entra en la copia local** de `premiosLocalCopy` (degradación, fase 5): son votos ajenos.

### Reglas

```
match /premiosReveal/{seasonId} {
  allow read: if isAdmin() || (isSignedIn()
    && request.auth.uid in get(/…/premiosAdmin/$('voters-' + seasonId)).data.get('uids', []));
  allow write, delete: if isAdmin();
}
```

Coste: la lectura del resumen más la del `get()`. Tests en `tests/integration/firestore.rules.test.ts`: votante
lee aunque no tenga papeleta, no votante y sin sesión no, la lista de una edición no abre otra, la lista no la lee
nadie salvo el admin.

### Pantalla

Panel «Clasificación final» en `PremiosResultsScreen`. Se pide (`usePremiosReveal`, desde `PremiosHub`) solo si
hay sesión, quien mira sale en la clasificación por su `profileId` y la configuración dice que esa edición guarda
votos: así no se gasta una lectura ni sale un `permission-denied` para quien no votó. **Sustituye a la
clasificación de siempre**; el podio se queda. Va a lo ancho debajo de los ganadores (en el móvil, antes).

- Una fila por persona: puesto (con metal en los tres primeros), nombre, aciertos `12/25`, puntos, trofeo y el
  botón de desplegar. La fila entera despliega con el ratón (capa `row-hit`, como el escalón del podio); el teclado
  va por el botón. No es `<details>`: el nombre enlaza y el trofeo es un botón.
- **Todas plegadas** al entrar, también la propia.
- Al desplegar, por categoría: nominado votado, ✓/✗ (con texto oculto «Acierto»/«Fallo»), peso si no es 1 y, en
  los fallos, «Ganador: X». Sin frase explicativa bajo el título.
- La lógica pura, en `core/premios/revealedVotes.ts`.

### Histórico del panel

«Borrar los votos» en la fila de la edición que los guarde (`listSeasonVotes`), con confirmación. La clasificación,
los ganadores y los trofeos se quedan.

### Texto legal

`LEGAL_VERSION '2026-10-04'` (publicada en la 1.5.1) declaró que lo ven quienes votaron «hasta que se termina». El
05-10-2026 pasa a «hasta que se abre la siguiente, o antes si quien administra lo borra» **sin subir la versión**:
los mismos ven lo mismo y ahora hay un tope que antes no había (criterio del 2026-08-26, ver `legal.ts`). La lista
de uid tampoco es un dato nuevo: el registro de trofeos ya guarda el de cada participante desde 2025.

## Pendiente

1. Cargar 2025: `node scripts/premios-2025-votos-por-persona.mjs --sdk <node_modules con firebase-admin> --key
   clave.json` (simulación) y después con `--apply`.
2. Publicar la app (checklist del README). Hasta entonces producción lleva la 1.5.1, que no sabe pintar esto.
