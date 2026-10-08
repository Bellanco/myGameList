# Arranque, view-model social y móvil — plan

Estado: **sin empezar** (escrito el 08-10-2026 sobre `9c343f1d`, la 1.6.5). Reúne los trabajos que se pidieron
juntos: el parpadeo de las carátulas al abrir (ya hecho), quitar peso del chunk de entrada (descartado al medirlo), partir `useSocialViewModel`, `share_target` y View Transitions. Publicar en Google Play queda escrito pero
aparcado. Si una cifra no cuadra con el código, manda el
código: corrígela aquí.

**Cómo se lleva:** cada fase acaba en commit. Al terminarla se **borra de este documento** (lo hecho queda en el
historial de git) y se apunta aquí cuál es la siguiente. Una fase que, al llegar a ella, resulta no tener nada que
hacer también se borra, con una línea que diga por qué.

**Siguiente:** F2, partir `useSocialViewModel`.

**Hecho:** F0, retirar el modo ampliado de las carátulas (`x=1`), que las hacía parpadear al abrir con la cuenta
de administración y doblaba consultas a IGDB y escrituras de KV. Hecho el 08-10-2026.
F3, `share_target` → Próximos: «Compartir» en Android abre `/compartir`, que lleva a Próximos con el alta
rellena; el intérprete va por `import()` (+0,2 kB al arranque, crítico 184,6/190). Hecho el 08-10-2026; queda
probarlo en un Android real con la PWA instalada después de desplegar.
F5, View Transitions: el cambio de pantalla funde la vieja mientras entra la nueva, y al abrir una de tus reseñas
(`/stats/resenas`) la tarjeta crece hasta el detalle. Solo desde el primer gesto (las redirecciones del arranque no
animan). INP del cambio de pestaña 32 → 48 ms en escritorio, igual en móvil; +0,3 kB (crítico 184,9/190). Hecho el
08-10-2026. Ampliado el mismo día: la tarjeta también crece desde el feed social; entre listas la pantalla se
desliza hacia el lado de la pestaña; la barra inferior y los botones flotantes tienen capa propia (la captura del
`<main>` los tapaba); las carátulas de arriba se descodifican antes de deslizar (`precargaDeCaratulas`, plazo 160 ms);
y Firefox 144–146 / Safari < 18.2, que tienen la API sin los tipos, conservan el fundido de antes. Comprobado en
Safari (escritorio e iPhone) y Chrome Android; Firefox ≥ 147 según su documentación (no arranca automatizado aquí).

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
  compensa. Lo que queda de la fase es una regla: lo nuevo entra por `lazy()`/`import()` y el tope de
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

## F4 · Publicar en Google Play (TWA) · ⏸️ APARCADO

**Aparcado el 08-10-2026 por decisión del usuario:** la Play Console no se toca por ahora. Queda escrito para
retomarlo; nada de este plan depende de ello. `share_target` (hecho) funcionará igual dentro de la TWA.

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

## Orden propuesto

| # | Trabajo | Por qué en este orden |
|---|---|---|
| 1 | **F2** view-model social | lo que queda; commit a commit |
| ⏸️ | **F4** Google Play | aparcado |

Antes de cada despliegue, la checklist del README (versión, `audit:rules`, reglas e índices, suite en verde).
