# Rotar los canales: cómo se revoca de verdad el acceso de alguien

Plan de diseño, no de implementación: aquí está el orden de los pasos, lo que puede fallar a medias y lo que
NO resuelve. Nace de lo anotado en [`SECURITY.md`](../SECURITY.md) § «El identificador de un Gist ES la llave».

## 1. El problema, en una frase

Un Gist «secreto» no tiene lista de permitidos: quien conoce su identificador lo lee, con cualquier token o sin
ninguno. Como los identificadores de tus dos canales se copian en el documento de amistad para que la otra parte
pueda leer, **eliminar una amistad retira el permiso dentro de la aplicación pero no retira una llave que ya está
copiada**. Esa persona puede seguir leyendo en GitHub lo que publiques después.

Lo único que invalida un identificador es dejar de usarlo: crear un canal nuevo y retirar el viejo de circulación.

## 2. Lo que este plan NO arregla, y hay que decirlo antes

Rotar corta los accesos **futuros**. Lo que esa persona ya descargó —tus reseñas, tus notas— lo tiene en su
dispositivo y ahí seguirá. Ninguna medida técnica de este lado lo cambia, así que la interfaz no puede prometer
«borrar lo que vio»: promete «a partir de ahora, no ve nada nuevo». Decirlo de más sería peor que no ofrecerlo.

## 3. La asimetría que decide el orden: los dos canales no valen lo mismo

|                        | Canal **social** | Gist de **listados** |
|---|---|---|
| Qué contiene | actividad y publicaciones | la biblioteca entera, con reseñas, notas y horas |
| Si se pierde | se regenera publicando otra vez | es la fuente remota; solo queda la copia local |
| Quién apunta a él | tus amistades | tus amistades **y todos tus dispositivos** |
| Riesgo de rotarlo | bajo | alto (ver §5) |

De ahí el orden: **primero el social, y el de listados solo después y con su propio diseño**. Rotar el social ya
corta lo que más se publica —tu actividad— y es donde el riesgo es asumible.

## 4. Fase A — rotar el canal social

La mecánica **ya existe y está probada**: `ensureSecretSocialGist` (en `socialGistRepository`) hace exactamente
esto para migrar un canal público a secreto — elige el origen por contenido, clona, verifica y retira los viejos.
Rotar es esa misma secuencia sin la condición de «solo si es público». El plan es extraer ese cuerpo a una
operación reutilizable, no escribir una nueva.

Pasos, y el orden **no es intercambiable**:

1. **Leer el canal actual** y comprobar que lo leído es creíble. Las dos guardas que ya tiene `ensureSecretSocialGist`
   valen aquí sin cambios: si el fichero pesa cerca del techo en el que GitHub trunca, no se rota (leeríamos un
   JSON a medias y clonaríamos un canal vacío); si viene vacío pero el fichero no lo estaba, tampoco.
2. **Crear el canal nuevo con el contenido dentro** (`createSocialGistWithData`), secreto.
3. **Verificar que el contenido llegó** (`socialGistHasContent`, contando entradas). Este paso es el que separa
   «retirar un canal ya copiado» de «borrar el único sitio donde estaba».
4. **Repuntar las referencias**, en este orden: la configuración local (`saveSocialSyncConfig`), `privateConfig`
   del propio usuario y los documentos de amistad (`healOwnFriendshipIdentity` con `force: true`, que ya sabe
   escribir solo los campos propios de cada documento).
5. **Borrar el canal viejo** (`deleteGist`) — al final, y solo si 3 y 4 fueron bien.

**Si falla a medias**, en cada punto: entre 2 y 3 queda un gist huérfano en la cuenta (molesto, inofensivo; el
listado del paso 1 lo reconoce la próxima vez). Entre 3 y 4, el usuario apunta al canal nuevo y alguna amistad
todavía al viejo: se ve como «su actividad no aparece» hasta el siguiente saneado de identidad, que ya corre al
abrir el hub. Entre 4 y 5, el viejo sigue existiendo sin que nadie lo referencie: es el estado que el paso 5
limpia, y reintentarlo es seguro porque `deleteGist` trata el 404 como éxito. **Ninguna de esas paradas pierde
datos**, que es la propiedad que el orden está comprado para garantizar.

## 5. Fase B — el gist de listados, y por qué va aparte

Aquí el problema no es GitHub, son **tus otros dispositivos**. Cada uno guarda el identificador en su
configuración local y escribe contra él. Si rotas desde el móvil:

- el portátil sigue apuntando al gist viejo; si tenía cambios sin subir, los sube **a un gist que ya no es el
  bueno**, y si además se borró, su ciclo de sincronización empieza a fallar sin que el usuario sepa por qué;
- la vía de recuperación existe (`privateConfig.gamesGistId` → «recuperar desde Google», que ya repunta la
  configuración local), pero hoy es un gesto **manual** y nadie le dice al portátil que tiene que darlo.

Por eso la Fase B necesita antes una pieza que hoy no existe: que un dispositivo **detecte que el canal cambió**
y repunte solo. El sitio natural es el propio ciclo de sincronización — un 404 del gist configurado deja de ser
«error de red» y pasa a ser «pregunta a `privateConfig` si hay un identificador nuevo antes de dar error». Con
eso, rotar deja de ser una operación coordinada y pasa a ser una que cada dispositivo resuelve a su ritmo.

Mientras esa pieza no exista, la Fase B se puede ofrecer con una condición honesta en la interfaz: «esto obliga a
volver a conectar la sincronización en tus otros dispositivos». Es aceptable para quien lo pide a propósito.

## 6. Interfaz

En **Cuenta**, junto a la zona de peligro pero **fuera** de ella (esto no destruye datos del usuario):

- Explicar en una frase qué hace y qué no (§2).
- Un botón para el canal social —el barato— y, si se implementa la Fase B, otro aparte para los listados con su
  advertencia. Nunca un solo botón que haga las dos cosas: tienen consecuencias distintas.
- Decir cuántas amistades se van a repuntar, que es lo que convierte «rotar» en algo comprensible.

## 7. Qué habría que probar

- El orden completo con la red simulada: que el viejo **no** se borra si la verificación del paso 3 falla.
- Las dos guardas heredadas (truncado y origen vacío): no rotar es el resultado correcto, y hay que afirmarlo.
- Que tras rotar, los documentos de amistad llevan el identificador nuevo y ninguno el viejo.
- Idempotencia: rotar dos veces seguidas no deja gists huérfanos ni referencias cruzadas.
- Para la Fase B, el caso que de verdad importa: un segundo dispositivo con cambios sin subir que se encuentra el
  canal cambiado **no pierde esos cambios**.

## 8. Decisión pendiente

Este documento no decide si se implementa. Lo que sí deja claro es el reparto: **la Fase A es barata y se apoya
en código ya probado; la Fase B no es un botón, es un cambio en cómo el ciclo de sincronización trata un canal
que ha dejado de existir.** Si solo se hace una, que sea la A.
