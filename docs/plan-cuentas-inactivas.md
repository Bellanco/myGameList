# Cuentas de Firebase Auth: verlas en el panel y borrar las inactivas

Estado: **implementado en `develop`, sin publicar** (15-10-2026). Falta el paso manual de «Puesta en marcha».

## El problema

Firebase Auth guarda a todo el que pulsa «Entrar con Google» (correo, nombre y foto), haya llegado o no a crear su
espacio social. Hasta ahora:

- **El panel no los veía.** El censo de `/admin/usuarios` sale de `profiles`. El 15-10-2026 había 14 usuarios en
  Auth y 12 perfiles: dos personas sin perfil que no aparecían en ningún sitio.
- **Nadie los borraba.** La baja desde la app (`deleteOwnAccount`) borraba Firestore y cerraba la sesión, pero la
  cuenta se quedaba en Auth para siempre. El cliente no puede borrarla sin pedir otro inicio de sesión, y el panel
  tampoco podía.

Se llega a Auth sin perfil desde tres sitios: la puerta del social (si te vas antes de terminar), recuperar la
sincronización con Google desde Ajustes y votar en los premios.

## Decisiones del usuario (15-10-2026)

| Pregunta | Decisión |
|---|---|
| Cómo se lanza el borrado | **Botón en el panel**, con confirmación escribiendo BORRAR. Sin tarea programada (Pages no tiene cron) |
| Aviso antes de borrar | **Lista «Caducan pronto»** (30 días antes) para avisar a mano. La app no manda correos |
| Correo en el panel | **Sí, solo en la ficha**: al desplegar la fila en Cuentas y en la ficha de Usuarios. Nunca en la tabla |
| Plazos | **Dos meses sin perfil, un año con perfil**, contados **desde el último uso**, no desde el alta |

Reglas que se añadieron sobre lo decidido (`src/core/admin/accountRetention.ts`):

- **Quien votó en los premios tiene el plazo de un año** aunque no tenga perfil. La edición es anual y su historial
  va por uid: con dos meses se le borraría entre una edición y la siguiente. Se mira en `premiosAdmin/palmares-*`,
  que lleva a todo el que votó (participar es un trofeo de rango 0) y no se borra al abrir la edición siguiente,
  como sí pasa con `voters-*`.
- **Nunca caducan**: el administrador y quien tiene una papeleta en curso.
- **Un perfil suspendido sigue contando como perfil** (un año).
- **Último uso** = la fecha más reciente entre `lastRefreshAt` / `lastLoginAt` de Auth y `profiles.updatedAt`. La
  sesión se renueva al abrir la app con la sesión iniciada (`main.tsx` inicializa Firebase si `mayRestoreAuthSession`).

## Qué hay

- **`/admin/cuentas`** (`AdminAccountsScreen`): resumen, caducadas con su botón, «Caducan pronto» y la tabla de todas
  las cuentas con filtros. Al desplegar una fila salen el correo y el uid.
- **Hoy** avisa de las caducadas (`accounts-expired`) y de las que caducan pronto (`accounts-expiring`); el menú
  lleva el número.
- **`GET /api/admin/accounts`**: el censo (Auth + `profiles` + `premiosBallots` + `premiosAdmin`). **`POST`** con
  `{ uids }`: borra solo las que el servidor da por caducadas en ese momento (se vuelve a juzgar con
  `judgeRetention`); las demás vuelven como `skipped`, y la cuenta de quien llama no se borra nunca. Como mucho **3 por
  petición** (`PURGE_BATCH_MAX`, a la par con `PURGE_CHUNK` del panel, que trocea): Workers Free admite 50
  subpeticiones por petición, el censo son 5 y cada cuenta 11 (5 + 3 × 11 = 38).
- **El censo empareja los perfiles por su campo `uid`**, no solo por el id del documento: quedan perfiles legacy con
  otro id (`foreign-doc-id`), y sin esto su dueño saldría «sin perfil» y caducaría a los dos meses.
- **Errores**: sin cupo o con Google caído, 503 «no disponible» (el panel para y deja el resto como pendiente; la baja
  se queda en «reintentar»). Un rechazo de Google (clave revocada, rol que falta) sale como 502/500 con solo el
  estado, para no confundirlo con «inténtalo luego».
- **El borrado se lleva TODO** (decisión del usuario, 15-10-2026: «la cuenta tiene que borrar todo lo que haya»).
  `purgeAccount` (`functions/_lib/accounts.ts`) lee primero lo que necesita y lo aplica todo en un solo
  `documents:commit`, con la cuenta de Auth la última y solo si lo demás salió bien:

  | Dónde | Qué |
  |---|---|
  | `friendships`, `friendshipKeys` | sus amistades (los dos lados) y los depósitos de ids |
  | `profiles` | el suyo y los legacy con otro id (buscados por el campo `uid`) |
  | `privateConfig`, `publicConfig`, `userMap`, `premiosBallots` | su documento |
  | `premiosAdmin/voters-*`, `palmares-*` | su uid sale de la lista |
  | `premiosResults/*`, `premiosReveal/*` | su fila de la clasificación y de los votos, buscada por su `profileId` (el del perfil, `privateConfig` y `userMap`). Las filas de gente de fuera de la app llevan el `profileId` vacío y no se tocan. El resto conserva su puesto; los recuentos se quedan |
  | `adminLog` | las entradas sobre esa persona. El borrado se apunta sin nombre ni uid |
  | KV | enlaces (`share:`, `owner:`, `user:`), `relidx:`, `ban:`, `quota:override:` y el contador del día |
  | Firebase Auth | la cuenta |

  Las reescrituras llevan el `updateTime` leído: si el administrador toca el mismo documento a la vez, el `commit`
  falla entero y se reintenta. Son 11 llamadas a Google por cuenta.
- **La baja desde la app** pide primero ese mismo borrado completo al servidor (`DELETE /api/account`, que solo borra
  el uid del ID token). Va primero porque necesita el `profileId` del perfil. Si el servidor no puede (sin cuenta de
  servicio, o en `npm run dev`), el cliente borra lo que permiten las reglas, como antes, y avisa de que quedó algo.
  Si no atiende, la baja se queda en «reintentar más tarde» sin limpiar lo local.
- **Política de privacidad** (`legalContent.ts`, «Cuánto tiempo» y lo que ve la administración). `LEGAL_VERSION` no
  sube: es guardar menos (ver la nota del 15-10-2026 en `legal.ts`).

## Puesta en marcha (manual, antes de desplegar)

Sin esto, Cuentas dice «Falta conectar la cuenta de servicio» y la baja desde la app deja la cuenta de Auth (lo
informa como fallo parcial).

1. **Crear la cuenta de servicio** en Google Cloud → IAM y administración → Cuentas de servicio, proyecto
   `mylists-f7313`. Nombre sugerido: `panel-cuentas`.
2. **Darle SOLO dos roles**: *Firebase Authentication Admin* (`roles/firebaseauth.admin`) y *Cloud Datastore User*
   (`roles/datastore.user`). Ni Owner ni Editor.
3. **Crear una clave JSON** (pestaña Claves → Agregar clave) y copiar su contenido entero al portapapeles.
4. **Subirla como secreto de Pages** desde la raíz del repo:
   `! pbpaste | npx wrangler pages secret put FIREBASE_ADMIN_SA --project-name mygamelist`
   (y otra vez con `--env preview` si se quiere en las vistas previas). Después, borrar el fichero descargado.
5. Desplegar y abrir `/admin/cuentas`.

## Lo que no se hace (y por qué)

- **No hay borrado automático.** Pages no tiene cron, y un cron en GitHub Actions obligaría a guardar otra credencial
  con permiso de borrar. Con la comunidad de hoy, el aviso de Hoy basta.
- **Lo que vive fuera del servicio no se toca**: sus gists (son suyos, en GitHub), los «me gusta» que dio y que
  están en los canales sociales de sus amistades (en los gists de ellas), las cachés que sus amistades tengan en sus
  dispositivos (caducan solas) y la analítica de Google (solo con consentimiento; se borra con la retención que tenga
  configurada la propiedad).
- **En `npm run dev` no existen los endpoints** (los sirve Pages): Cuentas dice que no ha podido leer Auth. Para ver
  la pantalla, `docs/maquetas/admin.html?pantalla=cuentas`.
