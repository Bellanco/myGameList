# Arranque, view-model social y móvil — plan

Estado: **sin empezar** (escrito el 08-10-2026 sobre `9c343f1d`, la 1.6.5). Reúne los trabajos que se pidieron
juntos: el parpadeo de las carátulas al abrir (ya hecho), quitar peso del chunk de entrada (descartado al medirlo), partir `useSocialViewModel`, `share_target` y View Transitions. Publicar en Google Play queda escrito pero
aparcado. Si una cifra no cuadra con el código, manda el
código: corrígela aquí.

**Cómo se lleva:** cada fase acaba en commit. Al terminarla se **borra de este documento** (lo hecho queda en el
historial de git) y se apunta aquí cuál es la siguiente. Una fase que, al llegar a ella, resulta no tener nada que
hacer también se borra, con una línea que diga por qué.

**Siguiente:** F3, `share_target` → Próximos.

**Hecho:** F0, retirar el modo ampliado de las carátulas (`x=1`), que las hacía parpadear al abrir con la cuenta
de administración y doblaba consultas a IGDB y escrituras de KV. Hecho el 08-10-2026.

Lo que se descartó en la misma conversación, con la medición delante, y no conviene volver a levantar:

- **React Compiler.** Probado en un worktree (`react({ compiler: true })` + `oxc-transform-react`): el crítico
  sube de 184,5 a **191,6/190 kB** y `validate` falla; la latencia medida no cambia (búsqueda 24 ms y pestañas
  16 ms de mediana en los dos, 400 juegos, 390 px, CPU ×4); y se salta justo los hooks pesados de sync y social
  porque leen refs en el render a propósito. La suite pasaba entera (3534).
- **Preact.** Medido el 25-09 (−57 kB, −21 % en móvil frío), pero se mantiene React por ser lo más común.
- **Notificaciones push.** Necesitan un emisor (Blaze o una Function que firme) y gastarían escrituras de KV, que
  ya aprietan las carátulas: no caben en el plan gratuito (`docs/plan-capacidad-gratuita.md`).
- **F1 · Quitar peso del chunk de entrada** (eliminada el 08-10-2026, tras medirla). Crítico 184,4/190 kB; al pintar
  la lista se ejecuta el 51 % del chunk de entrada, pero lo que sobra son ramas dentro de módulos que sí se usan.
  Lo que se podía diferir, medido quitándolo en un worktree: el cuerpo del mosaico **1,0 kB** comprimido, el JSX
  del renglón **0,5 kB**, `crypto` **0,9 kB**. `githubHttp` y `syncRepository` no son candidatos: los usa la sync
  de forma síncrona (revisión, fase 5, punto 16). Cargar perezosa la forma no elegida ahorraría ~1 kB por persona
  a cambio de un `Suspense` al cambiar de forma y de precachear chunks diferidos (el hueco de Chromium). No
  compensa. Lo que queda de la fase es una regla: lo nuevo (F3, F5) entra por `lazy()`/`import()` y el tope de
  190 no se sube.
- **La build `production` de react-router.** El chunk del router sale de `dist/development/`, pero los dos
  ficheros miden lo mismo (1 byte de diferencia): no hay nada que ganar ahí.

---

## F2 · Partir `useSocialViewModel`

Continúa la fase 4 de `docs/revision-general-2026-09.md`, cuyas cifras se han quedado atrás.

### Dónde estamos (medido hoy)

- **2541 líneas** (2370 el 18-09, 2373 el 01-10). Ha subido +168 en 11 commits desde el 01-10, sin un dominio nuevo
  grande: canal en tres estados, descubrir, `serviceLimited`, publicaciones, resumen del año, papeleta.
- 97 hooks primitivos y 19 propios; **114 claves** devueltas. El único consumidor es `SocialHub.tsx:175`, que
  desestructura 108; **seis no las lee nadie**: `friendships`, `handleCreateSocialGist`, `handleSignInGoogle`,
  `hydrateSocialDirectory`, `loadingForeignProfile`, `refreshFriendships`.
- Los «tres abridores» que la revisión daba como pendientes ya salieron a `useSocialNavigation` (`3a94e87a`).
- Por encima de 800 líneas en `src/viewmodel/`: `useSocialViewModel` (2541), `useSyncViewModel` (1150) y
  `useGameListViewModel` (801). El criterio escrito («ningún fichero por encima de 800») cae también por los otros
  dos, que no son de esta fase.

### Los bloques, por tamaño

| Bloque | Líneas aprox. | Dónde (hoy) | Cobertura que ya tiene |
|---|---|---|---|
| Canal y pasarela (incluida la migración a secreto) | ~470 | 381-466, 630-694, 754-893, 1621-1688, 2144-2154, 2336-2386 | `SocialHub.test` 658-722, `socialHubBudget` |
| Perfil propio (hidratar, foto, guardar, completados) | ~450 | 983-1011, 1690-1870, 2085-2140, 2156-2322 | `SocialHub.test` 997 y 1685-1956, `ownProfileCacheAfterSave` |
| Vitrina de logros | ~200 | 1183-1366 + estados 209/221 + 1886-1916 | `SocialHub.test` 212-256 y 2052-2285, `achievementsPublish` |
| Ficha de un perfil ajeno | ~150 | 1091-1170, 1399, 1469, 1568-1594 | `SocialProfileDetailScreen.test` (17) |
| Detalle de una actividad | ~140 | 1046-1066, 1392-1436, 1490-1544 | **ninguna a nivel de hook** |

El detalle y la ficha comparten el ancla (`activeReviewAnchor` mezcla `activeDetailEvent`, `activeProfileReview` y
`selectedProfileDetail`), y `activeDetailEvent` alimenta `useForeignProfileGames`. Por eso van juntos.

### Pasos (uno por commit)

1. `docs`: poner al día la fase 4 de la revisión con estas cifras.
2. Quitar las seis claves muertas. Verificación: `tsc`, `SocialHub.test` y `socialHubBudget` en verde.
3. `social/useSocialReading.ts` con la ficha, que se lleva dentro `useForeignProfileGames`. Test nuevo con
   `renderHook` de `profileDetailLoading` y del efecto `socialSkipped`.
4. El detalle, en ese mismo hook: evento, las dos esperas y el ancla. **Antes de moverlo**, tests de
   `detailEventLoading`, `detailReviewLoading` y el ancla, que hoy no existen.
5. `social/useOwnAchievements.ts`.
6. `social/useSocialChannel.ts`. Es el más delicado: ver «riesgos».
7. `social/useOwnSocialProfile.ts`.
8. Piezas memoizadas (`session`, `feedback`, `profileEditor`, `feed`, `compose`, `reading`, `achievements`,
   `directory`, `friends`, `nav`, `viewer`) y `SocialHub` recibiéndolas por piezas.
   - Verificación: contador de repintados como en la fase 3 (0 por pulsación en el feed).

Con 3 a 7 el fichero queda en ~1100 líneas; con el 8, y llevándose también `status`/feedback (295-379) y la
lectura del perfil propio, en ~800.

### Riesgos (y la red)

- **Carrera del token** (el fallo del feed social que mandaba a ajustes con 401): el efecto de 381 espera a `ensureSyncConfigLoaded`
  antes de `getSyncConfig`. Al extraer el canal no puede volver un `getSyncConfig()` en un inicializador ni en
  `useMemo([])`. Lo mismo vale para el efecto `socialSkipped` (1575).
- **Gist del directorio desfasado:** la ficha sigue leyendo `entry.socialGistId` de la entrada ya saneada por
  `useSocialDirectory`, nunca el gist del perfil.
- **Orden de efectos que hay que conservar:** `setDirectorySettled(false)` (1921) antes de la hidratación (1986);
  el reinicio de `autoCreate…Ref` (2144) antes del auto-crear (2147). Hay refs escritas en el render (1985, 2010).
- **Repintados:** pasar una pieza entera a una pantalla con `memo` sin `useMemo` de dependencias exactas la
  repinta siempre. Precedente: `useSocialProfileForm` devuelve un literal nuevo en cada render (254-258).
- `socialHubBudget.test.tsx` solo cubre la apertura del feed (lecturas de gist, `getSocialProfilesByUid`, saneado,
  `ensureSecretSocialGist` una vez). El detalle y la ficha no tienen red de presupuesto: añadirla en el paso 3.

**Criterio de aceptación (reescrito):** `useSocialViewModel.ts` ≤ 800 líneas y `SocialHub` recibe piezas.
`useSyncViewModel` y `useGameListViewModel` quedan fuera de esta fase.

---

## F3 · `share_target`: compartir un juego hacia la app

**Qué da:** en Android, con la PWA instalada, aparece «Mis Listas» en el menú Compartir.
Desde Steam o el navegador abre el alta con el nombre ya puesto. **iOS no lo soporta.**

**Cómo:**

1. Manifiesto: `share_target` con `method: GET` a una ruta nueva (p. ej. `/compartir`) con `title`, `text` y
   `url`. GET para no tener que tocar el service worker con un POST.
2. La ruta, en los **tres** sitios: `core/constants/routes.ts`, `public/_redirects` (Pages ignoraba el comodín
   `/* /index.html 200`: van una a una) y el fallback de navegación del service worker. Comprobarlo en una
   vista previa, no en `localhost` (allí el SW se desregistra).
3. Un intérprete puro en `core/` (`sharedGameName.ts`): saca el nombre del texto compartido. Ejemplos: Steam
   («Save 50% on Hades on Steam https://…»), la ficha de la tienda, o un título suelto. Con tests de unidad.
4. **Destino: la lista de Próximos** (decidido el 08-10-2026; primero se dijo Deseados y se cambió). Se abre el
   formulario precargado en la pestaña `p` reutilizando el camino de `openImportedDraft` (`useGameListViewModel.ts`),
   que ya abre el alta con metadatos y sin id, y se navega a `/proximos` para que al guardar se vea dónde ha caído.
   Todo perezoso: el arranque está a 5,6 kB de su tope.
   - Próximos no tiene tope (el de 100 es solo de Deseados), así que no hace falta aviso de lista llena.
   - **Juego que ya está en alguna lista:** no hay que hacer nada nuevo. `FormModal` ya avisa del duplicado al
     escribir y corta el guardado (`findDuplicate`, `FormModal.tsx:152` y `:330`).
5. e2e: navegar a `/compartir?text=…` y comprobar que el formulario sale con el nombre en Próximos, y que con un
   nombre que ya existe sale el aviso de duplicado.

---

## F4 · Publicar en Google Play (TWA) · ⏸️ APARCADO

**Aparcado el 08-10-2026 por decisión del usuario:** la Play Console no se toca por ahora. Queda escrito para
retomarlo; nada de este plan depende de ello. Al retomarlo, `share_target` (F3) ya funcionará dentro de la TWA.

**Qué da:** presencia en la tienda e instalación de un toque. La app es la misma web: cada despliegue llega sola, y
solo hay que subir una versión a Play si cambian el manifiesto, los iconos o el paquete.

**Antes de empezar, comprobar en la Play Console** (el usuario ya tiene cuenta con una app publicada: hay que mirar
de qué tipo es y cuándo se creó):
- **Si la cuenta es personal y se creó a partir del 13-11-2023**, cada app nueva pasa una prueba cerrada con
  **12 testers durante 14 días seguidos** antes de pedir acceso a producción, y ese acceso no está garantizado.
  Las cuentas de organización y las personales anteriores a esa fecha están exentas.
  ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en))

**Pasos:**

1. **Iconos.** El manifiesto solo tiene iconos `purpose: "any"`; añadir uno `maskable` de 512 px, o Android lo
   recorta.
2. **Generar el proyecto con Bubblewrap** a partir de `https://<dominio>/manifest.json`, con un id de paquete
   propio y la versión alineada con `package.json`.
3. **Firma.** Activar Play App Signing: entonces la clave que genera Bubblewrap pasa a ser la de **subida**, y el
   `assetlinks.json` tiene que llevar la huella SHA-256 de la clave de **firma de Play**. Si falta, la app abre
   con la barra del navegador (Custom Tab) en vez de a pantalla completa.
   ([Chrome for Developers](https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs))
4. **`public/.well-known/assetlinks.json`.** Comprobar en la vista previa que Pages lo sirve como
   `application/json` y sin redirección: `curl -i https://<preview>/.well-known/assetlinks.json`. Si hace falta,
   añadir una regla en `_headers`. La CSP no le afecta (no es un documento que se pinte).
5. **Ficha de Play:** reutiliza `public/screenshots/`, y el formulario de «Seguridad de los datos» se rellena con
   lo que ya declara la política legal (Auth de Google, GitHub, Firestore).
6. **Prueba cerrada** si toca (ver arriba); después, producción.
7. Añadir los pasos de publicación en Play a la checklist de despliegue del README.

---

## F5 · View Transitions

**Qué da:** acabado, no velocidad. La app ya tiene un fundido de entrada por ruta (`useScreenTransition`, clase
`screen-enter` en `<main>`). Lo nuevo de verdad son las **transiciones de elemento compartido**: la carátula o el
avatar del feed que viaja a su detalle, o el indicador de la pestaña.

**Lo comprobado:**
- React 19.3 exporta `ViewTransition` y `addTransitionType` estables, y van en el chunk de `react` que ya se carga:
  no suman bytes de JS.
- `react-router` 7.18 envuelve sus actualizaciones de navegación en `React.startTransition`, que es lo que hace
  falta para que `<ViewTransition>` anime. Hay que confirmarlo con `BrowserRouter` en el paso 1.
- Soporte: Chrome, Safari 18+ y Firefox recientes. Donde no hay soporte, se queda el fundido actual.

**Pasos:**

1. Una prueba en el `<main>`: `<ViewTransition>` alrededor de las rutas, con `useScreenTransition` como reserva
   donde no hay `document.startViewTransition`. Medir con el script de latencia de este plan (Event Timing, CPU ×4):
   la captura de la vista antigua añade un instante, y no debe subir la mediana de cambio de pestaña (16 ms hoy).
2. Elementos compartidos solo en el social (feed → detalle de reseña → perfil), con `name` por id de reseña.
3. `prefers-reduced-motion`: sin animación (las 69 reglas que ya existen marcan el patrón).
4. **Raster por tema:** medir Witcher y los temas con filtros SVG (en Witcher, las animaciones sobre papel con filtro SVG ya dejaban ver el fondo al desplazar), porque animar
   capturas sobre esos fondos es justo lo que ya dio problemas.
5. Comprobar en claro y oscuro y a 390, 1280, 1512 y 3840 px.

Encaja con «evolución, no cambio»: aplicado con moderación y con la forma que pone cada tema.

---

## Orden propuesto

| # | Trabajo | Por qué en este orden |
|---|---|---|
| 1 | **F3** `share_target` → Próximos | barato y útil a diario en Android |
| 2 | **F5** View Transitions | acabado |
| — | **F2** view-model social | independiente; se puede intercalar commit a commit en cualquier momento |
| ⏸️ | **F4** Google Play | aparcado |

Antes de cada despliegue, la checklist del README (versión, `audit:rules`, reglas e índices, suite en verde).
