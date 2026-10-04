# Premios: los votos de cada uno, a la vista hasta terminar la edición

Estado: **hecho; reglas de Firestore desplegadas el 04-10-2026** (van en la 1.5.1). Falta publicar la app con esa versión.
Decisiones tomadas con el usuario en la misma fecha.

## Qué se quiere

Hoy publicar una edición hace todo de una vez: archiva, concede trofeos y **borra las papeletas**. Lo que votó
cada persona no lo vuelve a ver nadie.

Se parte en dos y aparece un estado nuevo entre medias:

| Estado | Acción del admin | Qué pasa |
|---|---|---|
| Sin edición | Abrir votación | igual que hoy |
| Votación abierta | Cerrar ahora | igual que hoy |
| Cerrada, sin publicar | **Publicar resultados** | archivo + trofeos, como hoy; **las papeletas se quedan** y se escribe el resumen de votos |
| **Resultados con votos** (nuevo) | **Terminar edición** | se borran papeletas y resumen, se vacían los nominados y se vuelve a «Sin edición» |

En el estado nuevo, **quien votó en esa edición** ve una clasificación con una persona por fila; al desplegar una
fila, lo que votó en cada categoría, si acertó y el peso de la categoría cuando no es 1 (`×3`, `×0,5`).

## Decisiones (04-10-2026)

- **Solo ediciones abiertas después del despliegue.** Quien votó antes lo hizo con la promesa de que nadie más
  vería su papeleta. Al comprobarlo no había edición en marcha (`premiosConfig/voting`: sin `closesAt`,
  `lastPublishedId: '2025'`), así que la próxima ya entra; aun así el régimen queda escrito en la configuración.
- **Solo lo ven quienes votaron en esa edición.** Ni cualquiera con sesión ni el enlace público: el archivo de
  `premiosResults` sigue sin votos individuales (`plan-unificar-premios.md` §4.2).
- **Al terminar desaparece todo**, también el resumen. No queda en el histórico.
- **Terminar lo hace el admin a mano.** Sin caducidad automática.
- **Ranking denso, como hoy** (`assignDenseRanks`): empatados comparten puesto, sin huecos.

### Borrar o no: no es cuestión de presupuesto

Medido con la edición 2025 (14 papeletas, 25 categorías): una papeleta ocupa ~2 kB, ~30 kB por edición frente a
1 GiB de Spark; borrarlas son 14 borrados de 20.000 diarios. Ninguna de las dos cosas pesa.

Se borran por otros dos motivos:

1. **Funcional.** La papeleta es `premiosBallots/{uid}`, sin la edición en la clave, y las reglas de corrección
   exigen que `season` y `submittedAt` no cambien. Una papeleta vieja impide votar en la siguiente edición; por
   eso `openSeason` ya barre las que queden.
2. **Privacidad.** Lleva uid y nombre de la cuenta de Google, y el texto legal promete retirarla.

Lo único que cuesta de verdad es **mirar**, y eso lo resuelve el resumen (abajo): 2 lecturas por visita en vez
de una por votante.

## Diseño

### Datos

- **`premiosConfig/voting.revealVotes: true`** lo pone `openSeason` en las ediciones nuevas. `publishAndArchiveSeason`
  lo mira: sin él, publica y termina de una vez, como hoy.
- **Estado nuevo con marca propia: `votesRevealedAt`**, que pone publicar y borra terminar.
  `closesAtMillis` presente **y** `votesRevealedAt` → `SEASON_STAGE.REVEALED`. Se pensó deducirlo de
  `lastPublishedId === seasonId`, pero una edición abierta con el mismo nombre que la última publicada nacía ya
  «publicada». La marca también cierra el voto: `isVotingOpenNow` y la regla `premiosVotingConfigAllows` la miran,
  así que reabrir el interruptor no deja cambiar la papeleta viendo las de los demás.
- **Resumen de votos: `premiosReveal/{seasonId}`**, un solo documento escrito al publicar con la misma lectura
  de `readLiveEdition` que el archivo:

  ```ts
  interface PremiosRevealedBallot {
    rank: number;        // denso, calculado con computeLeaderboard: el mismo que el archivo
    profileId: string;   // '' si votó sin perfil: la fila no se identifica por aquí
    nickname: string;    // el elegido para la clasificación, nunca el de Google
    points: number;
    selections: Record<string, string>; // categoría → optionId
  }
  interface PremiosReveal { seasonId: string; ballots: PremiosRevealedBallot[] }
  ```

  Sin uid ni nombre de Google. Nombres de nominados, pesos y ganadores salen de `categoriesSnapshot` y `winners`
  del archivo, que la pantalla ya lee: el resumen no los duplica. Tamaño: ~1 kB por votante, lejos del MiB.
- **No entra en la copia local** de `premiosLocalCopy` (degradación, fase 5): son votos ajenos y desaparecen al
  terminar.

### Reglas (`firestore.rules`)

```
match /premiosReveal/{seasonId} {
  allow read: if isAdmin() || (isSignedIn()
    && exists(/databases/$(database)/documents/premiosBallots/$(request.auth.uid)));
  allow write, delete: if isAdmin();
}
```

«Votó en esta edición» = tiene papeleta: mientras el resumen existe, las únicas papeletas son las de su edición
(`openSeason` barre las anteriores **y cualquier resumen olvidado**, y terminar borra ambas cosas). Coste: la
lectura del resumen + el `exists()`.

Tests nuevos en `tests/integration/firestore.rules.test.ts`: votante lee, no votante con sesión no, sin sesión no,
nadie salvo admin escribe.

### Repositorio (`premiosSeasonRepository.ts`)

- `publishAndArchiveSeason` se queda con los pasos 0–2bis (leer, comprobar ganadores, archivo, trofeos) y, con
  `revealVotes`, escribe `premiosReveal/{id}` y apunta `lastPublishedId` **sin** pasos 3–5.
- Los pasos 3–5 pasan a `finishSeason()`: borrar papeletas y resumen, vaciar ganadores y nominados, dejar la
  configuración sin edición. Sin `revealVotes`, `publishAndArchiveSeason` llama a las dos seguidas.
- `deleteSeasonResult` se niega con la edición en estado REVEALED: dejaría papeletas sin archivo. Primero terminar.

### Estados y ofrecimiento (`core/premios/votingSchedule.ts`)

- `SEASON_STAGE.REVEALED` y su rama en `getSeasonStage`.
- `areResultsOffered`: también en REVEALED (hoy solo en NONE, por no enseñar los del año anterior; aquí los
  resultados sí son de esta edición).
- Revisar quién pinta según el estado: `AdminPremios` (línea de estados y acción «Terminar edición» con
  confirmación), `AdminHub` (estado del menú), `PremiosPortada`, `PremiosEstado`, `PremiosHub`, `usePremiosEdition`.

### Pantalla

Panel «Clasificación final» en `PremiosResultsScreen`, solo si hay resumen legible (`usePremiosReveal`: con
sesión, con papeleta y mirando el archivo de esta edición). **Sustituye a la clasificación de siempre**; el podio
se queda. Va a lo ancho debajo de los ganadores (en el móvil, antes, donde iba la clasificación).

- Una fila por persona: puesto (con metal en los tres primeros), nombre, aciertos `12/25`, puntos, trofeo y el
  botón de desplegar. La fila entera despliega con el ratón (capa `row-hit`, como el escalón del podio); el
  teclado va por el botón. No es `<details>`: el nombre enlaza y el trofeo es un botón.
- **Todas plegadas** al entrar, también la propia.
- Al desplegar, por categoría: nominado votado, ✓/✗ (con texto oculto «Acierto»/«Fallo»), peso si no es 1
  (`×3`, `×0,5`) y, en los fallos, «Ganador: X».
- Sin frase explicativa bajo el título (decisión del usuario).
- La lógica pura, en `core/premios/revealedVotes.ts`.

### Texto legal

- Hecho: la papeleta la leen también quienes votaron en la misma edición, desde que se publica hasta que se
  termina, y un punto nuevo en «Quién más los ve».
- `LEGAL_VERSION` sube a `'2026-10-04'`: todo el mundo vuelve a aceptar. Desplegar **antes** de abrir la próxima
  edición.

## Pasos

1. ~~Tipos + `votingSchedule` (estado nuevo) con tests puros.~~ Hecho.
2. ~~Reglas + tests de reglas.~~ Hecho.
3. ~~Repositorio: partir publicar/terminar (`finishSeason`), resumen (`buildRevealSnapshot`, `fetchSeasonReveal`),
   bloqueo del borrado.~~ Hecho.
4. ~~Panel de admin: estado y acción nueva (con confirmación).~~ Hecho.
5. ~~Maqueta en Chrome → panel de la pantalla de resultados.~~ Hecho.
6. ~~Texto legal y `LEGAL_VERSION`.~~ Hecho.
7. Checklist de despliegue del README (reglas incluidas: sin ellas el resumen no se puede leer).
