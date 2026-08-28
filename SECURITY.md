# Política de seguridad

Este documento resume el modelo de seguridad **tal y como está implementado hoy** y cómo reportar
vulnerabilidades.

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad, **no lo publiques públicamente** (issue, PR o red social).
Repórtalo de forma responsable y en privado directamente al mantenedor del repositorio, con pasos de
reproducción y el impacto estimado. Se responderá lo antes posible.

## Datos que maneja la app

- **Local (navegador)**: listas de juegos, configuración y preferencias en localStorage;
  token de GitHub (cifrado, ver abajo); clave de dispositivo en IndexedDB.
- **GitHub Gist**: biblioteca de juegos y canal social (índice de reseñas). Recuerda que un Gist
  "público" es legible por cualquiera con el enlace; usa Gists privados para tu biblioteca.
- **Firebase Firestore**: perfil social y configuración privada (`privateConfig/{uid}`).

El documento de perfil (`profiles/{uid}`) lo puede LEER cualquier usuario autenticado —es el directorio
social—, así que contiene solo el nick, la foto (opcional) y el rango. El correo, el id del gist social y el
del gist de juegos salieron de ahí: el perfil propio se resuelve leyendo el documento por uid, y los ids
viven en `privateConfig/{uid}`, que solo lee su dueño (y, para las amistades, denormalizados en el documento
de amistad, que solo leen las dos partes).

**Restos legacy: purgados, y ahora también cerrados por regla.** Los perfiles creados antes de ese cambio
arrastraban esos campos, y algunos el PAT de GitHub **en claro** en `social.githubToken`. Se purgaron por las dos
vías previstas: el cliente del propio usuario lo pone a salvo cifrado en `privateConfig` y lo borra al iniciar
sesión (`firebaseProfileHealRepository`), que cubre a quien vuelve, y `scripts/purge-profile-pii.js` remató a los
inactivos —con respaldo local previo, porque para algunos era la única copia que quedaba—. El contador `legacy`
del panel `/admin` dice cuántos quedan; al cerrar esto estaba a cero.

Con los datos ya limpios, las reglas dejaron de admitirlos, que es lo que impide que vuelvan por una regresión:
`email` salió de la allowlist de `profiles`, y el mapa `social` pasó a tener la suya
(`enabled`, `etag`, `gistId`, `gamesGistId`). Esto último cierra dos puertas que estaban abiertas por omisión:
`social.githubToken` **pasaba** la validación —sin allowlist nadie miraba dentro del mapa— y el dueño podía colar
ahí un `tier` propio. Los dos ids de gist siguen admitidos a propósito: el cutover de identidad del panel los
deposita en el documento canónico para que el saneado del dueño los mueva a `privateConfig`, y prohibirlos
congelaría ese documento justo en el caso que el cutover viene a rescatar.

## Medidas implementadas

### Cifrado del token de GitHub (`src/core/security/crypto.ts`)

WebCrypto nativo (AES-GCM 256). Hay **dos** mecanismos con garantías **distintas**:

- **Token operativo en localStorage — cifrado en reposo real.** Se cifra con una clave AES-GCM
  aleatoria **no exportable** guardada en IndexedDB; ni el propio JS puede leer el material de la
  clave. El token nunca se guarda en claro y hay migración automática del token en claro legacy.
  Protege ante copia/volcado del localStorage; **no** protege ante un XSS ya ejecutándose en el
  origen (que podría usar la clave). Aplica a **los dos canales** (juegos y social): el token social
  es una copia del mismo PAT, así que dejarlo en claro anulaba el cifrado del otro — el mismo secreto
  quedaba legible en la clave de al lado. Se corrigió en `gistConfigRepository`, que cifra y descifra
  ambos con el mismo mecanismo. **Tampoco hay copia en claro en IndexedDB**: el runner de migración
  sembraba el PAT en `LocalMeta` —donde nadie lo leía— y eso bastaba para dejar sin efecto todo lo
  anterior; hoy no se escribe y se purga el residuo al arrancar (`dataMigrationRepository`).
- **Token en Firestore (`privateConfig`) — ofuscación, no confidencialidad.** Se "cifra" con una
  clave derivada del `uid` (PBKDF2, salt aleatorio + 600k iteraciones). Como el `uid` es público, la
  **protección real es la regla owner-only de Firestore**, no el cifrado; este es defensa en
  profundidad. Recomendación: usar un PAT *fine-grained* con scope solo-gist y expiración.

### Otras medidas

- **Sanitización y validación** centralizada (`src/core/security/`): normalización de entradas,
  validación de formato de token y Gist ID.
- **Sin inyección HTML**: renderizado React sin `dangerouslySetInnerHTML` para datos de usuario.
- **CSP y cabeceras** de seguridad en `public/_headers` (CSP por lista blanca de dominios realmente
  usados, `X-Frame-Options`, `X-Content-Type-Options`, etc.).
- **Reglas de Firestore** *owner-only* con validación de esquema (`hasOnly`) en `profiles` y
  `privateConfig`, cubiertas por tests de emulador **que corren en CI**. El dueño puede BORRAR sus
  documentos (borrado de cuenta): `create/update` van validados por esquema y `delete` se autoriza aparte,
  porque en un borrado no hay documento entrante que validar.
- **Validación de contenido, no solo de claves** (C7). El `hasOnly` impide inventarse campos; aparte se
  valida el TIPO y el TAMAÑO de lo que se guarda en ellos, en los dos documentos que lee alguien que no es
  su autor: el perfil público (lo lee todo el directorio) y el documento de amistad (nombre y foto
  denormalizados los pinta la otra parte). Las URLs de foto tienen que ser `https://`, que es lo que cierra
  la vía `javascript:`/`data:` en el `<img src>` de quien mira. Sin esto, un cliente autenticado hostil
  podía usar su propio documento para inflar o envenenar lo que descargan y pintan los demás.
- **Canje de OAuth restringido al propio origen**: la Pages Function que usa el `client_secret` exige que
  el `Origin` y el `redirect_uri` de la petición sean de esta app.
- **HSTS** (`Strict-Transport-Security`, 6 meses) en `public/_headers`. Sin `includeSubDomains` ni `preload` a
  propósito: ambos amplían el compromiso a cosas que no se pueden revertir rápido (ver el comentario del fichero).
- **Auditoría previa al despliegue de reglas** (`npm run audit:rules`): antes de endurecer `firestore.rules` se
  comprueba, en solo lectura, que ningún documento REAL quedaría rechazado. Los tests de emulador cubren las
  formas conocidas; esto cubre los datos que hay. Sus predicados están cubiertos por
  `tests/unit/auditProfileRules.test.ts`, que además verifica que los límites coinciden con los del fichero de
  reglas: una auditoría que aprobara lo que las reglas rechazan sería peor que no tenerla.
- **Firebase App Check** (`src/model/repository/appCheckRepository.ts`), con reCAPTCHA v3. La API key web es
  pública por diseño, así que sin esto cualquiera puede hablar con Firestore desde fuera de la app: las reglas
  dicen QUIÉN puede hacer QUÉ, pero no limitan el ritmo. Está integrado en el código y la clave de sitio va en
  el build (`VITE_RECAPTCHA_SITE_KEY`); **que la atestación sea EXIGIDA es un ajuste de la consola de
  Firebase**, no del repositorio, y hasta activarlo ahí App Check informa pero no bloquea. Se apaga por
  completo vaciando la variable, sin tocar código.
- **Analítica con consentimiento previo**: Google Analytics no se inicializa mientras el usuario no lo
  acepte, y la decisión es revocable desde Cuenta.
- **Borrado de cuenta** desde la app: elimina perfil, amistades y configuración remota, y limpia
  localStorage, **las dos** bases de IndexedDB (la de datos y `mygamelist-secure`, donde vive la clave
  que descifra el token) y la Cache Storage del service worker. Las dos últimas se añadieron al
  detectar que sobrevivían al borrado: la base de la clave está aparte a propósito, así que borrar la
  de datos no se la llevaba. Los Gists no se tocan: son de la cuenta de GitHub del usuario.
- **El service worker no cachea `/api/*`.** La Cache Storage guarda lo que se le mande, ignorando el
  `Cache-Control: no-store` de la respuesta, y casa las entradas solo por URL (no hay
  `Vary: Authorization`), así que una respuesta por usuario servía para cualquier sesión. Las
  respuestas de las Pages Functions se descartan en el handler `fetch`, con las externas.
- **Sincronización CRDT** (merge por marcas de tiempo + tombstones) para minimizar pérdida de datos.
- **Service Worker** que solo cachea GET same-origin y excluye APIs externas (GitHub/Firebase).

## Recomendaciones para el usuario

1. Usa siempre **HTTPS**.
2. **Cierra sesión** en navegadores públicos o compartidos.
3. Mantén tus **Gists privados** si contienen tu biblioteca completa.
4. **No compartas tu token**; usa un PAT *fine-grained* con el mínimo scope y con expiración.

## Mejoras futuras (no implementadas)

- **Rol de administrador por *custom claim*** en vez del correo incrustado en `firestore.rules`. Es
  igual de seguro (el claim lo firma Firebase), no publica el correo del administrador en un repositorio
  público y permite rotarlo sin desplegar reglas. Pendiente porque exige provisionar el claim con el Admin
  SDK antes del cambio: hacerlo al revés deja el panel inaccesible.
- **Cerrar `gistId` y `gamesGistId` en la allowlist del mapa `social`.** Ya es posible: el saneado del arranque
  rescata los DOS ids a `privateConfig` (owner-only) y los purga del documento público en la misma escritura, así
  que el documento que el cutover deja a medias se limpia solo la próxima vez que su dueño entra. Antes de
  cerrarlos hay que repasar la ventana entre el cutover y ese siguiente inicio de sesión, y pasar
  `npm run audit:rules` como en cualquier endurecimiento.
- Cifrado end-to-end del contenido del Gist (que los datos viajen cifrados por la API de GitHub).
- Tokens en memoria de sesión en lugar de persistencia.
