# Plan: App Check en el borde, Trusted Types, rendimiento, Steam y atajos de teclado

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Escrito el 25-09-2026 sobre `develop`
> en `09fc2c0`. Al abordar cada paso, verifica el estado real del código y actualiza este `.md` con lo que
> cambie. Los números se miden con los comandos de «Cómo se midió» de `docs/revision-general-2026-09.md`.

## Orden y por qué

| Fase | Qué | Riesgo | Depende de |
|---|---|---|---|
| 1 | App Check: cerrar lo que queda | Bajo, con interruptor | — |
| 2 | Trusted Types (con informes de CSP) | **Medio**: puede dejar sin sesión en producción | 1 (comparte la CSP) |
| 3 | Rendimiento | Bajo, se mide antes y después | — |
| 4 | Importar desde Steam | Medio: secreto nuevo y API ajena | — |
| 5 | Atajos de teclado | Bajo | — |

Seguridad va primero porque las dos piezas tocan `public/_headers` y conviene cerrar la CSP antes de meter
orígenes nuevos (Steam, fase 4).

---

## Fase 1 — App Check: lo que falta

**Punto de partida (verificado en el código).** App Check **ya está integrado** en el cliente
(`src/model/repository/appCheckRepository.ts`, reCAPTCHA v3, cargado solo con sesión de Google para no romper
la promesa de «sin terceros» del smoke) y documentado en `SECURITY.md`. Las Pages Functions **reenvían** el
token a Firestore (`functions/_lib/context.ts` → `quota.ts`), pero **no lo verifican ellas mismas**.

Eso deja dos huecos:

1. **La exigencia es un ajuste de la consola de Firebase**, no del repositorio. Hasta activarla, App Check
   informa pero no bloquea. No sabemos desde aquí si está activada.
2. **Los endpoints propios no exigen atestación.** `/api/share`, `/api/premios`, `/api/cover-quota` y
   `/api/cover-stats` exigen un ID token de Firebase válido, pero cualquiera con una cuenta y un script puede
   llamarlos directamente. Solo la lectura del perfil que hacen por dentro pasa por App Check (porque va a
   Firestore). Las escrituras a KV (`SHARES`, `COVERS`) no.

### Medido en la consola (25-09-2026)

| API | Verificadas | Sin verificar | Estado |
|---|---|---|---|
| Cloud Firestore | 40 % | 60 % | Supervisión (sin exigir) |
| Authentication | 3 % | 97 % | Supervisión (sin exigir) |

**No se puede exigir ninguna de las dos así: dejaría fuera a la mayoría de peticiones legítimas.** Y ese
tráfico sin verificar no viene de visitas anteriores a App Check, porque App Check salió antes de la 1.0.0.
Hay dos causas en el código, las dos consecuencia de cargar App Check solo con sesión:

- **Firestore.** En `onSocialAuthChanged` (`firebaseAuthRepository.ts`), `ensureAppCheck` va **sin `await`** y
  el `callback(user)` sale en el mismo tick: los `use*Session` y el hub empiezan a leer mientras todavía se
  descarga `firebase/app-check`. El SDK de Firestore recoge un App Check que llega tarde (`onInit` en
  `FirebaseAppCheckTokenProvider`), pero **solo desde ese momento**: lo que sale antes va sin token.
- **Authentication.** Al restaurar una sesión, Auth refresca el ID token caducado (`securetoken.googleapis.com`)
  **antes** de emitir `onAuthStateChanged`, que es donde se enciende App Check. Así que el refresco del arranque
  no puede ir atestiguado tal como está montado. Solo el inicio de sesión con popup lo va, porque ahí sí hay
  `await`.

**Desglose de los últimos 7 días (consola, 25-09-2026):**

| API | Verificadas | Cliente desactualizado | Resto sin verificar |
|---|---|---|---|
| Cloud Firestore | 40 % | **59 %** | < 1 % y < 1 % |
| Authentication | 3 % | 1 % | **96 % de origen desconocido** |

- **Firestore: confirmado.** «Cliente desactualizado» es la categoría de las peticiones que hace el SDK de Firebase
  sin token, que es justo lo que produce la carrera. Casi no hay tráfico de fuera (< 1 %). El paso 3 debería
  llevar ese 59 % a verificadas.
- **Auth: la causa es otra, y casi toda la provoca la propia app.** «Origen desconocido» es una petición sin
  token que además no parece venir del SDK, porque le faltan sus cabeceras (`X-Client-Version`, que el SDK sí
  envía en el refresco). La explicación más probable está en `@firebase/auth`: `getAuth()` trae
  `browserPopupRedirectResolver`, y en **móvil, Safari e iOS** (`_shouldInitProactively`) abre al arrancar un
  iframe oculto en `mylists-f7313.firebaseapp.com/__/auth/iframe`. Esa página es de Google y consulta Identity
  Toolkit **por su cuenta**, sin SDK y sin App Check. Pasa en cada arranque con sesión. La página del popup
  (`__/auth/handler`) hace lo mismo en cada inicio de sesión.
  - Se comprueba así: en producción con sesión, DevTools → emulación de iPhone → recargar → pestaña Red
    filtrando por `identitytoolkit`. La petición debería salir iniciada por `__/auth/iframe` y sin
    `X-Firebase-AppCheck`.
  - **Consecuencia:** App Check no puede atestiguar esas peticiones, así que **exigirlo en Auth rompería el
    inicio de sesión**. No se hará. Lo que sí se puede hacer es quitar el iframe del arranque (paso 3).

### Pasos

1. ✅ **`functions/_lib/appCheck.ts`**: verificación en el borde, con el mismo patrón que `verifyIdToken`. Las
   piezas comunes (decodificar, JWKS en KV, firma RS256) se sacaron a `functions/_lib/jwt.ts`. Comprueba RS256,
   `typ: JWT`, `kid`, firma, `iss` = `https://firebaseappcheck.googleapis.com/721023375695`, que `aud` incluya
   `projects/721023375695`, la expiración y `sub` = el App ID. JWKS en `/v1/jwks` (en plural, comprobado
   contra el endpoint) y cacheado 6 h, el máximo que recomienda Google.
2. ✅ **Interruptor `APPCHECK_EDGE_MODE`** en los tres entornos de `wrangler.toml`, desplegado en `monitor`,
   junto con `FIREBASE_PROJECT_NUMBER` y `FIREBASE_APP_ID`. Se aplica dentro de `requireUser`, después de la
   sesión, así que cubre todos los endpoints autenticados. Los anónimos (`GET /api/announcement`, `/r/…`,
   `/cover`) no pasan por ahí. Cada petición deja una línea JSON en el log
   (`wrangler pages deployment tail | grep '"evt":"appcheck"'`) con el veredicto y la ruta recortada, sin el
   token ni el tramo del enlace compartido.
   - **Lo que cambia respecto al plan original:** el borde no ve las variables del build, así que no puede
     apagarse solo si se vacía `VITE_RECAPTCHA_SITE_KEY`. Hay que ponerlo en `off` a mano en el mismo
     despliegue (está escrito en `appCheck.ts` y en `wrangler.toml`).
3. ⏸️ **Encender App Check antes de la primera petición y quitar el iframe del arranque.** La marca de «hubo
   sesión» ya existe: es `hasStoredAuthSession()` (`firebaseGateway.ts`), la que usa `main.tsx` para no cargar
   Firebase a quien nunca ha iniciado sesión. Así que no cambia a quién se le carga nada de Google.
   - `buildFirebaseServices` (`firebaseClient.ts`): con sesión guardada, `await ensureAppCheck(app)` **antes**
     de crear Auth y Firestore. Cubre el refresco del arranque (el 1 % desactualizado de Auth) y las primeras
     lecturas de Firestore (el 59 %).
   - `onSocialAuthChanged`: `await ensureAppCheck` antes de `callback(user)`, para el caso de quien inicia
     sesión en esa misma visita.
   - `initializeAuth(app, { persistence: browserLocalPersistence })` **sin** `popupRedirectResolver`, que se
     pasa solo en `signInWithPopup(auth, provider, browserPopupRedirectResolver)`. Sin él, móvil y Safari dejan
     de abrir el iframe de `firebaseapp.com` (y de cargar `apis.google.com`) en cada arranque. Quedaría
     solo en el inicio de sesión. Además, la persistencia deja de fijarse con un `setPersistence` sin esperar.
   - Después, una semana y volver a medir. El objetivo es Firestore cerca del 100 % y el «origen desconocido»
     de Auth reducido a los inicios de sesión.
4. **Exigir, por orden, cuando los números lo permitan:** primero el borde (`enforce`, cuando el log lleve una
   semana casi todo `ok`), y luego Firestore en la consola. Auth no se exige (ver arriba).
5. **Opcional, solo para escrituras sensibles** (crear un enlace compartido, votar en premios): usar
   `getLimitedUseToken()` y comprobar en el borde que un token no se usa dos veces (KV con TTL corto). Impide
   reutilizar tokens. No lo hagas sin medir antes el coste en escrituras de KV.

### Pruebas

- ✅ `tests/unit/appCheckEdge.test.ts` (32 casos): claves RSA generadas en la prueba y firma real. Hay un caso
  por cada comprobación del token de App Check, los tres modos del interruptor (un valor mal escrito cuenta
  como `off`; sin configuración en `enforce`, 500), lo que NO debe salir en el log, y el ID token de Auth, que
  hasta ahora no tenía pruebas y comparte con App Check las piezas de `jwt.ts`.
- En las previews de Cloudflare reCAPTCHA no emite tokens válidos (el inicio de sesión tampoco funciona allí),
  así que el extremo a extremo se comprueba en producción con el modo `monitor`, que no rechaza nada.

**Criterio de aceptación:** en `enforce`, una llamada a `/api/share` con un ID token válido y sin cabecera
`X-Firebase-AppCheck` recibe 401; desde la app funciona igual que antes; `SECURITY.md` actualizado.

---

## Fase 2 — Trusted Types

**Qué da.** Con `require-trusted-types-for 'script'`, el navegador rechaza cualquier cadena que llegue a un
sumidero de DOM peligroso (`innerHTML`, `script.src`, `serviceWorker.register`…) si no pasa por una política
declarada. Convierte «hoy no hay XSS» (comprobado en la revisión) en «mañana tampoco puede haberlo por
descuido».

**Por qué no basta con añadir una línea a la CSP.** Sumideros que hay hoy:

| Sumidero | Dónde | Qué hacer |
|---|---|---|
| `innerHTML` | `src/view/hooks/useSignatureEffects.ts:110` | Construir el `<svg><use>` con `createElementNS`. No necesita política |
| `serviceWorker.register('/service-worker.js')` | `src/core/utils/appUpdate.ts:248` | Es un sumidero `TrustedScriptURL`: pasa por la política propia |
| `script.src` de terceros | reCAPTCHA (App Check), `gtag` (Analytics), `apis.google.com` (inicio de sesión con Google) | No los controlamos: los cubre la política `default` |

**Lo que no se puede comprobar en local:** en local no hay Firebase (no hay `.env`), así que los tres
cargadores de terceros solo se ejercitan con sesión en un despliegue. Por eso hay que empezar en modo informe.

### Pasos

1. **Endpoint de informes** `functions/api/csp-report.ts`:
   - Acepta `application/reports+json` (Reporting API) y `application/csp-report` (formato antiguo, Safari/Firefox).
   - Tamaño acotado con `readJson`, que ya mide bytes reales.
   - **Privacidad:** los informes llevan la URL del documento, y la de `/r/<token>` es un enlace compartido.
     Se guarda solo el origen y la primera parte de la ruta, nunca el token ni la query.
   - Cuota por IP con `functions/_lib/quota.ts`. Se registra en el log (`console.log`), no en KV: el plan
     gratuito de KV tiene un cupo diario de escrituras y una ráfaga de informes lo gastaría.
2. **Modo informe:** cabecera **aparte** en `_headers`, sin tocar la CSP que se exige:
   `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; report-to csp` + `Reporting-Endpoints:
   csp="/api/csp-report"`. Dos semanas en producción, con alguien iniciando sesión, abriendo el social,
   aceptando la analítica y usando premios.
3. **Arreglos en el código:** reescribir `useSignatureEffects` sin `innerHTML` y crear
   `src/core/security/trustedTypes.ts` con:
   - una política `app` que solo admite `/service-worker.js` como script URL;
   - una política `default` que solo deja pasar `TrustedScriptURL` cuyo origen esté en el `script-src` actual
     (`www.google.com`, `www.gstatic.com`, `apis.google.com`, `www.googletagmanager.com`; el beacon de
     Cloudflare, `static.cloudflareinsights.com`, salió de la CSP el 25-09-2026) y **rechaza todo `TrustedHTML` y
     `TrustedScript`**.
   - Se registra en `main.tsx` antes que nada, con comprobación de soporte (`window.trustedTypes`): Firefox y
     Safari antiguos no lo tienen, y la cabecera tampoco les afecta.
4. **Exigir** cuando el endpoint lleve una semana sin informes nuevos: mover la directiva a la CSP real y
   añadir `trusted-types app default 'allow-duplicates'`. Las librerías de Google crean sus propias políticas
   con nombre (`goog#html`…). Si los informes las muestran, se añaden a la lista con nombre en vez de abrir un
   comodín.
5. **Marcha atrás:** borrar las dos directivas de `_headers`. La política queda registrada pero no hace nada.
   Anotarlo en el comentario de `_headers`, como ya se hace con reCAPTCHA.

### Pruebas

- `tests/unit/trustedTypes.test.ts`: la política `default` acepta cada origen del `script-src` y rechaza uno
  ajeno, un `data:`, un `javascript:` y cualquier HTML. Una prueba que **lee `_headers`** comprueba que la
  lista de la política y el `script-src` coinciden: son límites duplicados, y se vigilan en pareja.
- e2e sobre el build: servir con la cabecera exigida y recorrer listados, estadísticas, ajustes y el efecto de
  firma de un tema, escuchando `securitypolicyviolation`. Debe haber cero violaciones.
- Con sesión: una pasada manual en un despliegue de vista previa (inicio de sesión, social, analítica aceptada).

**Criterio de aceptación:** la CSP exigida lleva Trusted Types, el endpoint no recibe informes con uso normal
y la marcha atrás está escrita en `_headers`.

---

## Fase 3 — Rendimiento

Todo se mide antes y después, y el resultado se anota en la revisión general.

1. **Terminar la fase 4 de la revisión** (partir `useSocialViewModel`, 2370 líneas). Los tres dominios que
   faltan, en el orden ya decidido allí: detalle de una actividad → vitrina de logros → ficha de un perfil
   ajeno. Y luego adelgazar la fachada y mover los `use*Session` de `App.tsx` a `viewmodel/`.
   *Criterio (el de la revisión):* ningún fichero de `src/viewmodel/` por encima de 800 líneas.
2. **Probar el React Compiler en una rama y decidir con números.** Antes de nada, comprobar cómo se integra
   con `@vitejs/plugin-react` 6, que ya no trae Babel. Medir con el método de la fase 3 de la revisión (renders
   del feed por pulsación) y con `npm run validate` (presupuesto de arranque). Si no mejora nada que se note o
   se come la holgura (10,9 kB), se descarta y se escribe aquí el porqué.
3. **El sprite como `.svg` externo, solo en un despliegue de vista previa.** Es la tercera vía de la revisión:
   quitaría ~20 kB del arranque, pero hay que comprobar la CSP (`default-src 'none'`), que el CSS alcance al
   contenido clonado y que el SVG entre en el precache. El e2e `iconos.test.ts` ya vigila que no queden huecos.
4. **Web Vitals reales (`web-vitals`)**, enviados por `telemetryRepository.logEvent`. Solo llegan con
   analítica aceptada, igual que el resto de la telemetría, así que no cambia la política de cookies. Cargar el
   módulo en idle y comprobar su coste con `npm run validate`.
5. **Cobertura del camino de sync** (punto 14 de la revisión): `useSyncViewModel`, `gistRepository` y
   `socialGistRepository` por encima del 80 % de ramas. No es rendimiento, pero es lo que protege todo lo demás.

---

## Fase 4 — Importar desde Steam

El diseño general ya está en `docs/plan-importacion-bibliotecas.md` (Bandeja, normalización, UI). Aquí solo
lo específico de Steam. `ImportSource` ya incluye `'steam'`, y `ExternalIds` ya tiene su clave.

1. **Pages Function `functions/api/steam.ts`:**
   - Secreto `STEAM_API_KEY` en el entorno de Pages (nunca en el repositorio ni en `wrangler.toml`).
   - Recibe un SteamID64 o una URL de perfil. Las URL personalizadas (`/id/<nombre>`) se resuelven con
     `ISteamUser/ResolveVanityURL`.
   - Llama a `IPlayerService/GetOwnedGames` con `include_appinfo=1` y devuelve solo `appid`, `name` y
     `playtime_forever` (en minutos → horas).
   - Exige sesión (`requireUser`) y App Check (fase 1) para que la clave no sirva de proxy abierto, y cuota por
     usuario con `quota.ts`.
   - Si el perfil o sus «detalles de juegos» son privados, Steam devuelve una lista vacía, no un error. La
     función tiene que distinguir ese caso para que la UI pueda explicarlo.
2. **Conector** `src/model/repository/import/steamConnector.ts`, que devuelve `RawExternalGame[]` con
   `externalId = appid`. La interfaz `LibraryConnector` del plan de importación todavía no existe como tal
   (Playnite entra por `core/import/playniteShared.ts`). Este es el momento de crearla, con Playnite y Steam
   como las dos implementaciones.
3. **UI:** una tarjeta junto a la de Playnite con el campo del perfil, la explicación de cómo hacerlo público
   y el mismo flujo de Bandeja. El SteamID se guarda **solo en local** y solo si el usuario lo pide, para
   reimportar. No viaja ni al gist ni a Firestore.
4. **Carátulas:** `img-src` ya admite `*.steamstatic.com`. Comprobar si `/cover` puede usar el `appid` como
   atajo antes de buscar en IGDB.
5. **Privacidad:** la política de privacidad tiene que decir que, al pulsar «Importar de Steam», el SteamID
   pasa por nuestra función hacia Valve. El smoke de «sin terceros» no cambia: solo ocurre por acción del
   usuario.

*Pruebas:* función con `fetch` simulado (lista normal, perfil privado, URL personalizada, clave inválida,
cuota agotada); conector → Bandeja con deduplicación contra un Playnite ya importado (mismo juego por nombre
normalizado).

*Criterio:* una biblioteca pública de Steam acaba en la Bandeja con nombre y horas, y un perfil privado da un
mensaje que explica qué ajuste de Steam cambiar.

---

## Fase 5 — Atajos de teclado

Hoy el teclado solo se escucha dentro de algunos componentes (compositor, selectores, gráficas). No hay
atajos globales.

1. **`src/view/hooks/useKeyboardShortcuts.ts`**, montado una vez en `App`:
   - `/` → foco en el buscador · `n` → añadir juego · `?` → ventana de ayuda con la lista.
   - Opcional: `1`–`4` para las pestañas del listado.
   - No reacciona si el foco está en `input`, `textarea`, `select` o `contenteditable`, si hay un `<dialog>`
     abierto, si hay Ctrl, Alt o Meta pulsados (para no pisar atajos del navegador) ni con `event.isComposing`
     (teclados de composición).
2. **Accesibilidad (WCAG 2.1.4, atajos de un solo carácter):** los atajos de una sola tecla tienen que poder
   **desactivarse**. Interruptor en Ajustes → Filtros o Diseño, activo por defecto, guardado en local.
3. Textos en `core/constants/` como el resto. La ayuda (`?`) reutiliza `FormModal` o `useNativeDialog`.

*Pruebas:* componente, con cada atajo, cada caso de «no reacciona» y el interruptor apagado. Añadir `?` al
recorrido de axe.

---

## Lo que este plan NO hace

- No toca `firestore.rules`. Si alguna fase lo necesita, antes van `audit:rules` y su prueba de límites
  espejo.
- No quita App Check del arranque diferido ni lo carga sin sesión: la promesa de «sin terceros» se mantiene.
- No añade Xbox, PSN, GOG ni Epic. Siguen como «futuros» en el plan de importación.
