# Arranque, view-model social y móvil — plan

Estado: **sin empezar** (escrito el 08-10-2026 sobre `9c343f1d`, la 1.6.5). Reúne los trabajos que se pidieron
juntos: el parpadeo de las carátulas al abrir (ya hecho), quitar peso del chunk de entrada (descartado al medirlo), partir `useSocialViewModel`, `share_target` y View Transitions. Publicar en Google Play queda escrito pero
aparcado. Si una cifra no cuadra con el código, manda el
código: corrígela aquí.

**Cómo se lleva:** cada fase acaba en commit. Al terminarla se **borra de este documento** (lo hecho queda en el
historial de git) y se apunta aquí cuál es la siguiente. Una fase que, al llegar a ella, resulta no tener nada que
hacer también se borra, con una línea que diga por qué.

**Siguiente:** nada pendiente; solo queda F4 (Google Play), aparcada.

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
F2, partir `useSocialViewModel`: de 2.541 a **1.028 líneas**, en once hooks de `viewmodel/social/` (lectura,
logros propios, pasarela, migración a secreto, rango, foto, editor de perfil, avisos y sesión; más `gistErrors`) y
devolviendo el hub en doce PIEZAS por dominio que `SocialHub` desestructura. Repintados: 0 al escribir en el
compositor y 0 al volver a ejecutar el view-model sin datos nuevos, fijado en `socialHubRepaints.test.tsx` (que
además dice qué prop cambió si falla). El criterio de ≤ 800 líneas NO se alcanza, y no compensa forzarlo: lo que
queda es la orquestación —el cableado entre directorio, amistades, lectura y perfil, y los efectos que deciden
cuándo rehidratar y reconciliar— y el contrato de piezas (~150 líneas). Hecho el 08-10-2026.

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
| ⏸️ | **F4** Google Play | aparcado |

Antes de cada despliegue, la checklist del README (versión, `audit:rules`, reglas e índices, suite en verde).
