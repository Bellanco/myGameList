# Plan (a futuro): amistades incrementales

> **Estado: sin empezar, aparcado a propósito (04-10-2026).** Antes de abordarlo hay que medir el consumo real
> (Fase 0 de `docs/plan-capacidad-gratuita.md`): si el techo que aprieta es Cloudflare y no Firestore, esto no lo
> sube. Las cifras de aquí son estimaciones leyendo el código.

> ⚠️ **Documento vivo.** Si una línea no coincide con el código, manda el código: corrige esto en la misma pasada.

## Qué es

Hoy `getMyFriendships` relee **todos** los documentos de amistad del usuario (`friendships where users
array-contains uid`, hasta `FRIENDSHIPS_HARD_CAP`) cada vez que su copia caduca: 15 min en general
(`MY_FRIENDSHIPS_MAX_AGE_MS`) y 60 s en la pantalla de solicitudes (`MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS`). Con 30
amigos son 30 lecturas por relectura aunque no haya cambiado nada.

La idea: conservar la copia que ya vive en IndexedDB (`__friendships__:<uid>`) y preguntar solo por **lo que ha
cambiado** desde la última lectura:

```
friendships where users array-contains uid where updatedAt > <última lectura − margen>
```

Una consulta sin resultados cuesta **1 lectura**; con cambios, una por documento cambiado. Lo devuelto se fusiona
con la copia.

## Por qué

Tras `docs/plan-directorio-amigos.md`, el directorio dejó de ser el gasto principal y lo pasaron a ser las
amistades. Del usuario intenso (N≈30, social ~4 h): ~240–480 lecturas al día releyendo amistades y ~150 en la
pantalla de solicitudes, de un total de ~600–750.

| | Hoy | Con incrementales (estimado) |
|---|---|---|
| Medio (N≈10), lecturas/día en amistades | ~30 | ~15 |
| Intenso (N≈30), lecturas/día en amistades | ~400–600 | ~50 |
| Intenso, total del día | ~600–750 | ~250–350 |
| Techo por Firestore (mezcla 70/25/5) | ~800–1.000 activos/día | ~1.500–1.800 |

Además, mirar si ha llegado una solicitud pasaría a costar 1 lectura, así que la pantalla de solicitudes (y la
campana) podrían refrescarse más a menudo sin coste.

## Lo que hay que resolver antes de escribirlo

1. **Las bajas no se ven.** Un documento BORRADO (amistad retirada, petición rechazada) no aparece en «lo que ha
   cambiado». Opciones:
   - una **relectura completa al día** (p. ej. si la última completa tiene más de 24 h), y las bajas propias siguen
     invalidando al momento, como ahora (`invalidateMyFriendshipsCache` en las acciones);
   - o pasar a **baja lógica** (`status: 'removed'` con `updatedAt`) en vez de borrar. La ve la consulta
     incremental, pero cambia reglas, modelo y el borrado de cuenta (L3, RGPD: ahí sí hay que borrar de verdad).
   La primera es la sencilla. Consecuencia visible: si un amigo te retira, puedes seguir viéndolo como amigo hasta
   un día.
2. **El reloj de cada dispositivo.** `updatedAt` lo escribe el cliente con `Date.now()`
   (`firebaseFriendshipRepository.ts`: crear ~389, aceptar ~420, saneado ~603/610). Si el reloj de un amigo va
   atrasado, su cambio queda «antes» de tu última consulta y no se ve hasta la relectura completa. Opciones:
   - escribir `serverTimestamp()` (toca las reglas de `friendships`, que hoy validan la forma, y la lectura, que
     espera un número: `firebaseFriendshipRepository.ts` ~179);
   - o consultar con un margen amplio (p. ej. 1 h hacia atrás), que reduce el ahorro pero no lo anula.
   La primera es la correcta; hay que mirar si las reglas aceptan los dos tipos durante la transición, como ya
   hace `profiles` (`updatedAt is number || is timestamp`).
3. **Índice compuesto nuevo** (`users` array-contains + `updatedAt`). Hay que **desplegarlo antes que el código**:
   sin él Firestore responde `failed-precondition` y el social se queda sin amistades. Fallback obligatorio: ante
   ese error, volver a la lectura completa (como hace `listSocialDirectory` sin su índice). Ver la Fase 2 de
   `docs/plan-escalabilidad-firestore.md`, que evitó un índice aquí precisamente por esto.
4. **La copia tiene que guardar los documentos, no las vistas.** Hoy se cachea `FriendshipView`, que descarta los
   campos propios; para fusionar cambios hace falta el documento (o al menos lo que necesitan las vistas y el
   saneado). Subir la versión de forma de la copia.
5. **El tope `FRIENDSHIPS_HARD_CAP`** solo aplica a la relectura completa; la incremental no lo necesita.

## Verificación (cuando se haga)

- Tests del repositorio: sin cambios → 1 consulta y la copia intacta; un cambio → se fusiona; una baja propia →
  desaparece al momento; una baja ajena → desaparece en la relectura diaria; sin índice → relectura completa.
- Reglas con el emulador: la consulta incremental pasa; escribir `updatedAt` como fecha de servidor pasa.
- Presupuesto en `tests/component/socialHubBudget.test.tsx`: volver al social con la copia caducada cuesta 1
  lectura de amistades, no N.
- Desplegar el índice, comprobarlo en la vista previa de Cloudflare contra el Firestore real, y solo entonces el
  código.
