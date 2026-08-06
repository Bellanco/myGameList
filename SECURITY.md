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
social—, así que contiene solo el nick, la foto (opcional) y el id del gist social. El correo y el id del
gist de juegos salieron de ahí: el perfil propio se resuelve leyendo el documento por uid, y el gist de
juegos vive en `privateConfig/{uid}`, que solo lee su dueño. Los perfiles anteriores se purgan al volver a
guardarse, y `scripts/purge-profile-pii.js` remata los inactivos.

## Medidas implementadas

### Cifrado del token de GitHub (`src/core/security/crypto.ts`)

WebCrypto nativo (AES-GCM 256). Hay **dos** mecanismos con garantías **distintas**:

- **Token operativo en localStorage — cifrado en reposo real.** Se cifra con una clave AES-GCM
  aleatoria **no exportable** guardada en IndexedDB; ni el propio JS puede leer el material de la
  clave. El token nunca se guarda en claro y hay migración automática del token en claro legacy.
  Protege ante copia/volcado del localStorage; **no** protege ante un XSS ya ejecutándose en el
  origen (que podría usar la clave).
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
- **Analítica con consentimiento previo**: Google Analytics no se inicializa mientras el usuario no lo
  acepte, y la decisión es revocable desde Cuenta.
- **Borrado de cuenta** desde la app: elimina perfil, amistades y configuración remota, y limpia
  localStorage e IndexedDB (incluida la clave que descifra el token). Los Gists no se tocan: son de la
  cuenta de GitHub del usuario.
- **Sincronización CRDT** (merge por marcas de tiempo + tombstones) para minimizar pérdida de datos.
- **Service Worker** que solo cachea GET same-origin y excluye APIs externas (GitHub/Firebase).

## Recomendaciones para el usuario

1. Usa siempre **HTTPS**.
2. **Cierra sesión** en navegadores públicos o compartidos.
3. Mantén tus **Gists privados** si contienen tu biblioteca completa.
4. **No compartas tu token**; usa un PAT *fine-grained* con el mínimo scope y con expiración.

## Mejoras futuras (no implementadas)

- **Firebase App Check.** La API key web es pública por diseño, así que hoy cualquiera puede hablar con
  Firestore fuera de la app: las reglas dicen QUIÉN puede hacer QUÉ, pero no limitan el ritmo. Sin App
  Check, un autenticado puede recorrer el directorio entero o inundar de peticiones de amistad al coste de
  cuota del proyecto. Requiere configuración en la consola de Firebase (reCAPTCHA Enterprise) además de
  código.
- **Rol de administrador por *custom claim*** en vez del correo incrustado en `firestore.rules`. Es
  igual de seguro (el claim lo firma Firebase), no publica el correo del administrador en un repositorio
  público y permite rotarlo sin desplegar reglas. Pendiente porque exige provisionar el claim con el Admin
  SDK antes del cambio: hacerlo al revés deja el panel inaccesible.
- **Allowlist de subclaves de `social`** en el perfil (`hasOnly` dentro del mapa). Hoy se validan las
  subclaves conocidas, pero una inesperada pasa. No se ha activado porque en un merge
  `request.resource.data` es el documento resultante: un perfil antiguo con una subclave rara quedaría
  congelado para siempre y su dueño no podría arreglarlo (solo él o el admin escriben ahí). Necesita antes
  una auditoría de los datos reales y, si hace falta, una purga desde el panel.
- Cifrado end-to-end del contenido del Gist (que los datos viajen cifrados por la API de GitHub).
- Tokens en memoria de sesión en lugar de persistencia.
