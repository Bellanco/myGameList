# Política de seguridad

Este documento resume el modelo de seguridad **tal y como está implementado hoy** y cómo reportar
vulnerabilidades.

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad, **no lo publiques públicamente** (issue, PR o red social).
Repórtalo de forma responsable y en privado directamente al mantenedor del repositorio, con pasos de
reproducción y el impacto estimado. Se responderá lo antes posible.

## Datos que maneja la app

- **Local (navegador)**: listas de juegos, favoritos, configuración y preferencias en localStorage;
  token de GitHub (cifrado, ver abajo); clave de dispositivo en IndexedDB.
- **GitHub Gist**: biblioteca de juegos y canal social (índice de reseñas). Recuerda que un Gist
  "público" es legible por cualquiera con el enlace; usa Gists privados para tu biblioteca.
- **Firebase Firestore**: perfil social y configuración privada (`privateConfig/{uid}`).

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
  `privateConfig`, cubiertas por tests de emulador.
- **Sincronización CRDT** (merge por marcas de tiempo + tombstones) para minimizar pérdida de datos.
- **Service Worker** que solo cachea GET same-origin y excluye APIs externas (GitHub/Firebase).

## Recomendaciones para el usuario

1. Usa siempre **HTTPS**.
2. **Cierra sesión** en navegadores públicos o compartidos.
3. Mantén tus **Gists privados** si contienen tu biblioteca completa.
4. **No compartas tu token**; usa un PAT *fine-grained* con el mínimo scope y con expiración.

## Mejoras futuras (no implementadas)

- Cifrado end-to-end del contenido del Gist (que los datos viajen cifrados por la API de GitHub).
- Tokens en memoria de sesión en lugar de persistencia.
