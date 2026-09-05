# Plan: escalabilidad del grafo de amistad en Firestore

> Objetivo: que el coste de la capa social no crezca con el número de amigos, para un objetivo
> realista de **cientos por usuario**. La conclusión del análisis es que el problema **no está en
> el modelo de datos** —que ya es el mínimo posible— sino en tres patrones de acceso concretos.

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato. Las líneas citadas pueden moverse:
> verifica el estado real del código antes de tocar nada y actualiza este `.md` con lo que cambie.

## TL;DR

- **Una amistad = un documento.** No hay duplicación que quitar, y no hay nada que rediseñar.
- Lo que crecía linealmente eran tres cosas, ninguna del esquema:
  1. **Amplificación de escrituras** en `healOwnFriendshipIdentity` — el caro. **✅ Hecho.**
  2. **Lectura sin cota** en `getMyFriendships`. **✅ Hecho.**
  3. **Fan-out de gists del feed** (contra GitHub, no Firestore) — mitigado de sobra a esta escala; queda documentado.
- Una cuarta fase que se llegó a proponer se **descartó con la evidencia en la mano**; ver "Lo que NO se hace".

---

## Por qué el modelo ya es correcto

`friendships/{minUid__maxUid}` guarda **exactamente un documento por pareja**. El id es canónico
(`firebaseFriendshipRepository.ts`, `friendshipDocId`), así que dos personas no pueden generar dos registros
ni por carrera: el segundo `create` choca con el primero y `useSocialFriendships` lo resuelve releyendo y
aceptando. Para N amistades hay N documentos — el número de **aristas del grafo**, que es el mínimo teórico.

No hay espejo A→B + B→A, ni subcolección por usuario, ni array de amigos en el perfil. Y las dos alternativas
habituales serían peores aquí:

- **Espejo por usuario** (`users/{uid}/friends/{otherUid}`): duplica los documentos y, al cambiar el nick,
  obliga a escribir dentro de la subcolección *ajena*. Mismo fan-out, más documentos, reglas más laxas.
- **Quitar la denormalización** y leer `profiles/{otherUid}`: un amigo con `social.enabled == false` deja de
  ser legible por las reglas y su nombre desaparecería de la lista de amigos.

Los ocho campos denormalizados tampoco son grasa; los cuatro son **portadores únicos**:

| Campo | Por qué no se puede quitar |
|---|---|
| `*Name` | Único sitio donde sobrevive el nick si el amigo desactiva su espacio social o cae fuera del tope de 50 del directorio (`useSocialDirectory`, `friendOnlyEntries`). |
| `*Photo` | Igual que el nick, y es lo que pinta la bandeja de solicitudes. |
| `*SocialGistId` | Fuente fiable del canal del amigo; la copia del directorio solo se reescribe al republicar el perfil. |
| `*GamesGistId` | L1 lo retiró de `profiles` por privacidad: la amistad es su **único** canal. |

**Arquitectura, para quien implemente.** Firestore no guarda los datos pesados (juegos, reseñas, actividad);
esos viven en **GitHub Gists**. Firestore es directorio de perfiles + grafo de amistad + configuración por
usuario. Consecuencia: el fan-out caro a escala del feed es contra **la API de GitHub**, no contra Firestore.

---

## Fase 1 — Matar la amplificación de escrituras · ✅ implementada

**Problema.** `healOwnFriendshipIdentity` releía *todos* mis documentos de amistad y lanzaba un `updateDoc`
suelto por amigo (`Promise.all`, sin lotes ni límite de concurrencia). Se dispara desde **cuatro** sitios: al
abrir el hub, al guardar el perfil, al migrar el canal social (`useSocialViewModel`) y al publicar
(`socialPublishRepository`). La guarda `diverges` evitaba la **escritura** cuando nada había cambiado, pero no
evitaba la **lectura**: con 500 amigos, 500 lecturas por apertura del hub para descubrir que no había nada
que hacer.

**Lo implementado.**

1. **Huella de identidad** (`identityFingerprint`): hash estable de `{name, photo, socialGistId, gamesGistId}`,
   persistido en `LocalMeta.friendshipIdentityFingerprint`. Si coincide con el último saneado correcto, se sale
   **sin leer ni escribir nada**. El caso normal pasa a coste cero.
   - Es **local por dispositivo** a propósito: la foto publicable y el gist de la sesión se resuelven en cada
     dispositivo por separado, así que un sello compartido daría por propagado lo que este nunca escribió.
   - El sello **solo se pone si todo se escribió**. Un fallo parcial lo deja sin sellar para que el siguiente
     disparo lo reintente.
   - Sustituye a `friendshipHealedForGist`, que solo miraba el id del gist: un cambio de nick o de foto —el caso
     que importa para la privacidad— se le escapaba entero. La clave se conserva en `LocalMeta` porque quedan
     dispositivos con el valor escrito, pero ya no la lee nadie.
2. **Escrituras en lotes** (`commitHealBatches`): `writeBatch` en trozos de ≤450 operaciones (Firestore admite
   500). De 500 idas y vueltas simultáneas a dos. Las reglas `friendshipHealOwnFields` validan cada operación
   por separado, así que **no cambian**.
   - Con **reintento doc a doc si el lote falla**, y con la concurrencia acotada (`mapWithConcurrency`), como el
     resto del proyecto: si un lote entero ha sido rechazado ya hay algo yendo mal, y responder con una ráfaga de
     450 escrituras simultáneas es la peor forma de reaccionar. No es una precaución de más: un `writeBatch` es atómico, así
     que un único documento legacy que las reglas rechacen tumbaría el lote entero y se llevaría por delante a
     los 449 sanos. Antes, con escrituras sueltas, un doc envenenado solo se perdía a sí mismo; el reintento
     conserva esa tolerancia.
3. **Olvidar la huella al crear y al aceptar** una amistad (`forgetIdentityFingerprint`). **Sin esto, la huella
   introduce un bug que hoy no existe**: `sendFriendRequest` escribe mis campos con lo que se sepa en ese
   instante, y varios llamantes pasan `gamesGistId: mainSyncConfig?.gistId || ''` sobre una configuración que se
   hidrata de forma asíncrona. El `create` no tiene la protección `keepKnown` del saneado (no hay valor anterior
   que conservar), así que esa arista puede nacer con el id vacío; con la huella sellada, el saneado no volvería
   a correr y ese amigo se quedaría sin ver mi lista de juegos **para siempre**.
4. **`options.force`** para la migración de canal social, donde la garantía manda sobre el ahorro: lo que viene
   después **borra** el gist antiguo, así que un saneado saltado por huella dejaría a los amigos apuntando a un
   id que va a desaparecer.
5. **La ruta de publicación conserva su guarda propia** (`friendshipHealedForGist`), y no es redundancia con la
   huella: esa ruta **no sabe calcular la foto**. El hub y el guardado del perfil usan `ownPublishablePhoto`, que
   descarta el monograma genérico de Google (`ownPhotoIsGeneric`, un veredicto de red que vive en el ViewModel);
   la publicación solo tiene `publicPhotoURL`, que no puede aplicar esa regla. Sin la guarda, las dos rutas
   calcularían fotos distintas y se pelearían por la huella: cada publicación reescribiría los N documentos con el
   avatar genérico y la siguiente apertura del hub los reescribiría de vuelta, **en bucle**. Es decir, quitarla
   convertía la optimización en la amplificación que venía a matar.
6. El saneado **no** aplica el tope de la Fase 2. Recortar ahí dejaría documentos sin sanear y, como el recorte
   no es determinista, podrían ser siempre los mismos: justo el fallo que este saneado existe para evitar.

**Impacto.** De ~N lecturas y hasta N escrituras por apertura/guardado, a **0 lecturas y 0 escrituras** en
régimen normal, y 1-2 lotes cuando la identidad cambia de verdad.

---

## Fase 2 — Acotar la lectura · ✅ implementada

**Problema.** `getMyFriendships` hacía `where('users','array-contains', myUid)` **sin `limit`**.

**Lo implementado.** `FRIENDSHIPS_HARD_CAP = 1000` con `limit()`, más un evento de telemetría
(`friendships_hard_cap_reached`) si alguna vez se alcanza. Truncar en silencio sería lo peor de los dos mundos:
la pantalla se vería normal y `byOtherUid` estaría incompleto, así que a un amigo real se le pintaría "Añadir
amigo" y su petición chocaría contra un documento que ya existe.

**Va SIN `orderBy` deliberadamente.** Ordenar por `updatedAt` daría un recorte determinista, pero exige un
índice compuesto declarado y **desplegado en Firebase antes de mergear la consulta**: mientras no lo esté,
Firestore responde `requires an index` y el espacio social entero se cae. A un tope de mil el recorte no llega
a ocurrir nunca en la práctica, así que no compensa acoplar el merge a un despliegue de infraestructura.

No se pagina la UI: necesita `byOtherUid` completo para el estado O(1) en tarjetas y perfiles. La cota es un
cinturón de seguridad, no paginación.

**Consecuencia obligatoria en el borrado de cuenta.** `accountDeletionRepository` iteraba lo que devolvía una
única lectura, así que la cota habría dejado sobrevivir en silencio todo lo que quedara por encima del tope —y ahí
eso no es una ineficiencia, es el **derecho de supresión** (L3, RGPD art. 17) incumplido, con la identidad
denormalizada de quien se va guardada en documentos ajenos. Ahora borra **en pasadas** hasta que no vuelva nada.

El corte del bucle compara el **conjunto de ids**, no su número, y las dos alternativas fallan: `deleteFriendship`
trata `permission-denied` como éxito idempotente (correcto para su caso: el doc ya no está), así que un documento
que las reglas no dejen borrar se contaría como borrado y volvería en cada lectura → **bucle infinito en
producción**; y contar cuántos quedan tampoco vale, porque con más amistades que el tope dos pasadas seguidas
devuelven 1000 y 1000 aunque se esté avanzando. Hay además un tope duro de pasadas, y lo que siga existiendo al
salir se reporta como fallo: el borrado de cuenta nunca puede darse por terminado en silencio.

---

## Corrección de paso: el orden de la bandeja · ✅ implementada

`getMyFriendships` ordenaba las peticiones recibidas y enviadas por `updatedAt` — y ese campo **lo pisa el
saneado de identidad**. Es decir: que alguien cambiara su nick o su foto te reordenaba la bandeja sin haber
pasado nada. Además contradecía lo que `friendshipViews.ts` lleva documentando desde siempre ("ordenadas por la
fecha de la PETICIÓN"). Ahora las peticiones van por `createdAt`; los amigos siguen ordenándose por último uso
de la aplicación en `buildFriendshipViews`, sin cambios.

---

## Fase 3 — Fan-out de gists del feed · *documentada, sin implementar*

El feed lee **un gist de GitHub por amigo** (`useSocialDirectory`, `readPublicSocialGistById`). Crece
linealmente y consume rate-limit de GitHub.

**Mitigaciones ya existentes, suficientes a esta escala:** feed solo-amigos (de un no-amigo no se lee el gist),
concurrencia limitada (`SOCIAL_DIRECTORY_FETCH_CONCURRENCY = 6`), caché persistente en IndexedDB con TTL por
rango, corte por inactividad (`FRIEND_ACTIVITY_MAX_AGE_MS`) y throttling del refresco manual
(`FORCED_REFRESH_MIN_MS = 12 s`).

**Solución "miles+" (NO implementar ahora):** materializar un documento de "última actividad" por usuario en
Firestore para el corte visible del feed, leyendo el gist solo al abrir el detalle. Implica reintroducir
escrituras al publicar. Anotado como trabajo futuro.

---

## Lo que queda sin optimizar, a sabiendas

- **Cuando la identidad SÍ cambia, el saneado relee todos los documentos** aunque `getMyFriendships` acabe de
  leerlos y los tenga en caché: la vista cacheada (`FriendshipView`) descarta MIS propios campos, que son justo
  los que el saneado necesita comparar. Cachear también los documentos crudos lo evitaría, pero esa ruta ya solo
  se recorre cuando el nick, la foto o un gist cambian de verdad — es decir, casi nunca. No compensa la
  complejidad.
- **El saneado no deduplica llamadas en vuelo.** Dos disparos simultáneos con identidades DISTINTAS deben correr
  los dos (deduplicarlos perdería el segundo), y con la misma identidad el segundo ya sale gratis por la huella.
  Con las guardas actuales el solape es raro; un mutex por uid añadiría maquinaria de concurrencia por un ahorro
  marginal.
- **La ruta de publicación puede escribir una vez por id de gist con una foto calculada por otra regla** (no sabe
  descartar el monograma de Google). El hub lo corrige en la siguiente apertura y converge. Es comportamiento
  previo, no introducido aquí, y su guarda propia lo mantiene acotado.

## Lo que NO se hace, y por qué

- **NO se quita la fusión de los dos candidatos de gist** en `useSocialDirectory`. Se propuso —parecía ahorrar
  hasta una petición a GitHub por amigo— y **la evidencia lo desmiente**: la lista de candidatos ya se
  deduplica (`all.indexOf(id) === index`), así que cuando el id del doc de amistad y el del directorio coinciden
  —el caso sano— **ya es una sola lectura y no ahorra nada**. Solo se leen dos cuando de verdad divergen, que es
  exactamente el caso en el que la fusión es la red de seguridad: el saneado del amigo corre en **su**
  dispositivo, y si falla, quedarse solo con el id de la amistad daría un gist muerto y su actividad
  desaparecería del feed. Habría sido cambiar cero ahorro por una regresión real.
- **NO se des-normaliza la identidad** (ver la tabla de arriba: los cuatro campos son portadores únicos).
- **NO se materializa el feed** (Fase 3).
- **NO se paginan** las amistades en la UI.
- **NO se borran** índices/tipos de `feed`/`recommendations`/`activity_events` (staging de migración).

## Checklist de verificación

- [ ] Abrir el hub dos veces seguidas → la segunda no lanza ninguna consulta a `friendships` por el saneado.
- [ ] Guardar el perfil sin cambiar nada → 0 escrituras en `friendships`.
- [ ] Cambiar el nick → 1-2 lotes, no N escrituras sueltas, y los amigos ven el nick nuevo.
- [ ] Enviar una petición con la app recién abierta (config a medio hidratar) → el amigo acaba viendo la lista
      de juegos tras el siguiente saneado.
- [ ] Migrar el canal social → las referencias se repuntan **antes** de borrar el gist antiguo (`force`).
- [ ] Borrar la cuenta con amistades → todas desaparecen; si alguna no se deja borrar, se informa (no se cuelga).
- [ ] `npx vitest run tests/unit tests/component`, `npm run test:rules` y `npx playwright test` en verde.

## Verificado en la implementación

Suites ejecutadas con los cambios aplicados: **1579 unitarios + componente**, **76 de reglas contra el emulador**
de Firestore (incluidas tres nuevas: que `limit` sin `orderBy` no exige índice, que el saneado en lote pasa
`friendshipHealOwnFields`, y que un lote con una sola operación ilegítima se deniega **entero**) y **77 e2e**.
`tsc --noEmit` limpio, `eslint` sin errores (los 7 warnings son previos e idénticos en `master`), build correcto y
presupuesto de arranque del service worker **por debajo** del anterior (13 assets / 193,7 kB frente a 14 / 193,9).
