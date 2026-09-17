# Plan: que lo guardado dure, sin preguntarle nada a nadie

> Objetivo: que las carátulas y la biblioteca guardadas en el navegador sobrevivan a un
> desalojo, **sin checks, sin banners y sin diálogos de permiso**. Donde no se pueda garantizar
> que duren —que es en todos los navegadores, porque la plataforma no lo permite sin permiso—,
> que perderlas no cueste nada.

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Al implementar, confirma
> los comportamientos reales y **actualiza este `.md` en consecuencia**.

## Enfoque (TL;DR)

- **La persistencia se pide en silencio, no se ofrece.** `navigator.storage.persist()` no muestra
  UI en ningún navegador salvo Firefox. Se pide donde no hay diálogo y se acepta el resultado sin
  contarlo; quien la consiga, mejor, y quien no, igual que hoy.
- **Lo que de verdad resuelve el problema es que recuperar sea gratis.** El coste de un desalojo
  no son las imágenes (~25 kB cada una, y vuelven de la caché HTTP): es volver a recorrer 300
  juegos preguntando cuáles no tienen carátula. Ese conocimiento se saca del navegador.
- **Sin una sola pantalla nueva.** Ni interruptor, ni tarjeta, ni botón de instalar, ni mensajes
  de estado. Quien quiera instalar la app lo hará desde el icono que su navegador ya le ofrece.

> **Regla de este plan:** si un cambio obliga a enseñarle algo al usuario, no es de este plan.

> **Estado (2026-09-17):** los dos pasos están hechos y en `develop`. Firestore queda aplazado con un
> criterio escrito para reabrirlo. Ningún cambio de los hechos añade UI, toca el esquema ni mueve datos.

## El problema

El almacenamiento de un origen es desechable mientras nadie diga lo contrario. El navegador puede
tirarlo ENTERO —el cubo de carátulas, el shell, los chunks, la biblioteca guardada para verla sin
red— cuando le aprieta el disco, y Safari lo borra por política a los siete días sin visitas
(también en macOS). Ver la cabecera de `src/core/utils/coverLimits.ts`.

Hoy se pide persistencia desde `useCoverBackfill.ts:83`, con `void` y sin leer el resultado. No es
condición de nada, y está bien que así sea; lo que falta es lo que ocurre cuando dice que no.

## Decisiones tomadas (2026-09-17)

1. **Nada de opt-in.** Se valoró un interruptor en Ajustes que solo se pudiera activar con la
   persistencia concedida. Se descarta: en Chromium no hay diálogo, así que el check se quedaría
   apagado sin que el usuario haya rechazado nada — indistinguible de un interruptor roto.
2. **Instalar la app NO es una puerta.** Es la única palanca que alarga la vida sin permisos
   (saca a iOS de la purga de 7 días y en Chromium concede `persist()` sola), pero se instala
   quien quiera y cuando quiera. La app no lo ofrece ni lo sugiere.
3. **A Firefox no se le pide.** Es el único que muestra diálogo, y es el que menos lo necesita:
   no tiene purga por inactividad, así que su único riesgo es presión de disco — unos 20 MB en el
   peor caso. Excluirlo cuesta casi nada y es lo que mantiene la promesa de «sin avisos».
4. **El conocimiento va a Firestore, no al gist.** Ver Paso 1.
5. **Los topes locales no se tocan.** Siguen dependiendo solo de la holgura
   (`hayHolguraDeAlmacenamiento`, 80 %). Atarlos a la persistencia no protegería de nada: el
   desalojo se lleva el origen entero, así que guardar menos no baja la probabilidad de perderlo.

## Comprobación empírica (2026-09-17)

Chromium limpio (Playwright headless, sin instalar y sin historial de uso):

```
persisted() antes:          false
permissions.query:          "prompt"
persist() devuelve:         false      ← sin mostrar nada
persisted() después:        false
permissions.query después:  "prompt"   ← sigue en prompt, no pasa a denied
```

Dos lecturas: (a) en Chromium sin señales, `persist()` deniega en silencio, y (b) el estado se
queda en `prompt`, nunca en `denied`. Eso permite distinguir «el navegador no llegó a preguntar»
de «la persona dijo que no» (`denied`, que solo se ve en Firefox con decisión recordada).

Pendiente de confirmar en dispositivo real: Safari macOS/iOS.

### Safari iOS (2026-09-17)

Simulador iPhone 17 Pro Max (iOS 18.7, Safari 26.4), origen nuevo en `localhost`, no instalado:

```
navigator.storage.persist:  true       ← WebKit sí implementa la API
persisted() antes:          false
permissions.query:          NO SOPORTADO
usado / cuota:              0 MB / 39.321 MB (~38 GB)
persist() devuelve:         false      ← sin mostrar nada
persisted() después:        false
```

Tres consecuencias para este plan:

- La llamada **no es inútil** en WebKit: la API existe y responde.
- **`permissions.query` no existe en WebKit**, así que va obligatoriamente en `try/catch` y en Safari
  no hay forma de distinguir «no preguntó» de «dijo que no». El Paso 3 ya lo contempla.
- La cuota es de ~38 GB: en iOS el riesgo **no es el espacio** (20 MB no desalojan nada), es la purga
  por inactividad. Lo único que la evita es añadir la app a la pantalla de inicio.

### Safari macOS (2026-09-17)

Mismo origen nuevo en `localhost`, leído a mano (la automatización de Safari exige activar «Permitir
automatización remota», y `screencapture` no tiene permiso de grabación de pantalla):

```
navigator.storage.persist:  true
persisted() antes:          false
permissions.query:          NO SOPORTADO
usado / cuota:              0 MB / 78.643 MB (~77 GB)
persist() devuelve:         false      ← sin diálogo visible
persisted() después:        false
```

**Las dos plataformas de WebKit se comportan igual que Chromium**: deniegan en silencio a un origen
sin historial, y ninguna implementa `permissions.query` para `persistent-storage`. Con esto, los tres
motores quedan medidos y el Paso 3 vale tal cual está escrito: pedir en silencio en todos menos
Firefox, y no construir nada encima de la respuesta.

Pendiente: repetir la medida con la app **añadida a la pantalla de inicio / al Dock** (requiere un
toque manual; no se puede automatizar con `simctl`), que es el caso en que se espera que WebKit sí
conceda.

---

## Paso 1 — Cachear las respuestas de `m=1` ✅

> **HECHO** — `a9518bf` *feat(caratulas): el recorrido guarda en el equipo lo que aprende*
>
> **Decisión tomada al implementarlo:** se cachea **solo en el modo `m=1`**, no el 404 del mosaico. El
> plazo depende de quién pregunta: el recorrido guarda lo que aprende (`CACHE_MAPA`), la etiqueta `<img>`
> no guarda nada (`CACHE_FALLO`). Así nada de lo cacheado llega a pintar una imagen y el incidente de los
> 56 huecos falsos sigue siendo imposible. El 204 se guarda también: al recorrido le vale tanto un «sí»
> como un «no», y un «sí la tiene» no se vuelve falso.
>
> Verificado antes de tocar nada: el service worker no interfiere — `isCacheable` solo guarda respuestas
> 200, así que el 204 y el 404 le pasan de largo hasta la caché HTTP del navegador.
> Cubierto por 3 casos nuevos en `tests/unit/coverEndpoint.test.ts`, incluido que un 429 **no** se guarda
> ni en este modo.

Es el cambio con mejor relación coste/beneficio del plan: cinco líneas en un fichero, sin tocar esquema, ni
reglas, ni cliente, ni datos, y beneficia a todo el mundo desde el primer despliegue. Hoy las dos salidas del modo `m=1` van con `no-store`: el 404 «sin carátula»
(`cover.ts:271`) y el 204 «sí la hay» (`cover.ts:277`).

El `no-store` del 404 viene de un incidente real —una ráfaga de 429 sirvió 56 «sin carátula» falsas y
el navegador las guardó una hora—, pero eso pasaba cuando un fallo de infraestructura se devolvía como
un dato. Hoy el servidor ya los separa (429 es 429, 501 es 501) y `useCoverBackfill` los distingue,
así que el 404 es un dato fiable.

Haciéndolas cacheables **siete días** con `stale-while-revalidate` —alineado con `MISS_TTL`
(`igdbCover.ts:98`), que es lo que el servidor ya considera correcto para olvidar un negativo—, el
recorrido se resuelve desde la caché HTTP del equipo: sin red, sin cuenta y en todos los navegadores.
Mantener `no-store` en 429/501/403/502. El atajo de reabrir la pregunta al editar un juego se conserva
forzando `cache: 'reload'` en esa URL.

Limitación: la caché HTTP no es enumerable, así que el recorrido sigue existiendo — pasa de red a disco, no
desaparece del todo (eso solo lo da Firestore, hoy aplazado).

## Paso 2 — Pedir la persistencia en silencio (propina) ✅

> **HECHO** — `6bd8c1e` *feat(almacenamiento): pedir la persistencia en el arranque, sin avisar a nadie*
>
> **Decisiones tomadas al implementarlo:**
> - La función se mudó de `coverLimits` a **`src/core/utils/durableStorage.ts`**: protege el origen entero
>   (shell, chunks, biblioteca sin red), no el cubo de imágenes, así que no pertenecía a las carátulas.
> - A Firefox no se le llama a `persist()`, pero **sí se le consulta `persisted()`**: leer no abre ningún
>   diálogo, y así quien la haya concedido a mano desde el candado obtiene un `true` honesto.
> - El reinicio de pruebas retira el oyente de `appinstalled`; sin eso los oyentes se acumulaban entre
>   casos, que comparten `window`.
>
> Cubierto por `tests/unit/durableStorage.test.ts` (8 casos).
>
> **Nota operativa:** tras este cambio el chunk de arranque queda en **215,1 kB** comprimidos sobre un
> presupuesto de 220 (`scripts/ci-validate.js`). Queda poco margen para el siguiente añadido.

**Qué cambia:** `src/core/utils/coverLimits.ts`, `src/view/hooks/useCoverBackfill.ts`, `src/main.tsx`.

1. **Guarda para Firefox** en `pedirAlmacenamientoDuradero()`: si el UA es Firefox (`/firefox|fxios/i`),
   no se llama. Es la única fuente posible de diálogo en toda la app.
2. **Memo de sesión**: no repetir la llamada dentro de la misma carga.
3. **Mover la petición al arranque** (`main.tsx`, dentro de `runWhenIdle`) y quitarla de
   `useCoverBackfill.ts:83`. Hoy solo protege a quien tiene las carátulas encendidas; lo que está
   en juego es todo el origen —shell, chunks, biblioteca sin red—, así que corresponde al arranque.
   Actualizar el comentario del backfill, que explica por qué estaba allí.
4. **Reintento tras `appinstalled`**: quien instale por su cuenta obtiene la persistencia en el
   acto, sin que la app haya tenido que ofrecer nada.

**Tests:** `tests/unit/coverLimits.test.ts` ya cubre el «pide y sobrevive a un no» y el «no vuelve
a pedirla si ya está concedida». Añadir: no se llama en Firefox; no se repite en la misma sesión.
Revisar `tests/component/coverBackfill.test.tsx`, que monta el hook del que se retira la llamada.

**Por qué sigue mereciendo la pena pese a los tres `false`:** la población con carátulas tiene cuenta
de Google y vuelve a menudo (ver Paso 1), que es exactamente el perfil al que Chromium acaba concediendo
por *site engagement*. Es una apuesta barata: veinte líneas, cero UI, cero riesgo.

**Riesgo:** ninguno funcional. `persist()` no condiciona nada hoy y seguirá sin condicionar nada.

---

## Aplazado — El «no tiene carátula» sale del navegador (Firestore)

> **Aplazado el 2026-09-17, no descartado.** Es la pieza más cara del plan —colección, reglas, hash,
> hidratación, fusión por timestamp, tests— y las cuotas medidas (38 GB en iOS, 77 GB en macOS) dicen que
> el desalojo por presión es improbable para 20 MB. El único escenario real de pérdida es la purga de
> Safari por inactividad, o sea quien abre la app menos de una vez por semana, y lo que le cuesta es un
> recorrido en segundo plano que no se ve. El Paso 1 se lleva la mayor parte del beneficio por una
> fracción del coste.
>
> **Criterio para reabrirlo:** si tras el Paso 1 se siguen observando recorridos completos repetidos en
> el mismo dispositivo. Entonces esto se justifica y el diseño de abajo sigue siendo el bueno.

**Qué cambia:** `firestore.rules`, `src/core/utils/coverMemory.ts`, `src/core/utils/coverDone.ts`,
más un repositorio nuevo.

Hoy ese conocimiento vive en `localStorage` (`coverMemory.ts:64`, `coverDone.ts:72`), que es lo
primero que se pierde en cualquier purga — y cada dispositivo lo reaprende por su cuenta.

**Destino: Firestore, no el gist.** El gist ya tiene una cota de esquema que os bloqueó la sync una
vez (reseñas de 21 k caracteres), marcar 300 juegos obligaría a reescribirlo entero, y el merge es
LWW del objeto completo, así que un cliente antiguo pisaría los sellos (como ya pasa con
`enteredAt`). Firestore vive aparte y no compite con nada.

```
coverKnowledge/{uid} → { <hash de nombre+plataformas+modo>: <timestamp>, … }
```

**Con hashes, no con nombres.** Resuelve dos cosas de golpe:

- **Privacidad**: no se manda a Google la lista de juegos, solo huellas ilegibles. Misma línea que
  servir el aviso desde KV y no desde Firestore.
- **Invalidación por título**: hoy es gratis porque la clave es la URL (que lleva el nombre dentro);
  al corregir un título, el «no» no se hereda. Con un hash de nombre+plataformas se conserva ese
  comportamiento sin lógica extra. **Sin esto, un juego mal escrito se queda sin carátula para
  siempre y en todos los dispositivos** — peor que el problema de partida.

**Detalles:**
- Tamaño: ~300 entradas ≈ 5 kB. El límite de documento son 1 MB.
- Reglas: owner-only, calcadas de `privateConfig/{uid}` (`firestore.rules:355`).
- Hidratación al iniciar sesión, como `hydratePreferencesFromCloud`, fusionando con lo local por
  timestamp más reciente.
- Una sola escritura al terminar el recorrido, nunca juego a juego.
- Se conservan los plazos actuales: `VIDA_MS` (90 días) y `MINIMO_TRAS_EDICION` (1 día).

**No hay hueco por falta de sesión** (verificado 2026-09-17). El interruptor de carátulas vive solo
en `AppearanceSettings`, que se monta únicamente dentro de `AccountHub` (`AccountHub.tsx:73`), y esa
pantalla solo existe con sesión de Google: `App.tsx:792` no la renderiza sin uid y `App.tsx:211`
redirige `/cuenta` a la lista. Es además el único `setCovers` de la app, y la preferencia viene
apagada de fábrica.

Es decir: **quien puede tener carátulas ya tiene cuenta de Google, por construcción**. Firestore
cubre al 100 % de la población afectada y no deja a nadie fuera. Quien no tiene cuenta no llega a
pedir ni una imagen, así que no hay nada que guardarle.

*Si algún día se quisiera ofrecer carátulas sin cuenta, habría que mover `AppearanceSettings` a
`SettingsHub` — y entonces sí haría falta el complemento del Anexo C.*

---

## Aplazado — El recorrido hereda lo que ya se sabe

> Depende del anterior; se aplaza con él.

Con Firestore puesto sale casi solo: al montar, los juegos con sello válido no entran en
`pendientes` (`useCoverBackfill.ts`). Un dispositivo recién estrenado —o purgado por Safari— hace
**cero** peticiones `&m=1` donde hoy hace una por juego, con su pausa de 160 ms.

**Medición:** peticiones a `/cover?…&m=1` en la segunda visita de un dispositivo limpio con sesión.
Debe ser 0.

---

## Anexo A — Las capas que ya existen (y que no hay que tocar)

Son las que hacen que un desalojo no duela, y funcionan igual en todos los navegadores, sin cuenta
y sin permisos:

- **Caché HTTP.** `/cover` manda `max-age=2592000, stale-while-revalidate=31536000`
  (`functions/cover.ts:44`) y el `fetch` del service worker pasa por ella. No es *script-writable*,
  así que **ITP no la purga**, no cuenta contra la cuota y no la gobierna `persist()`. Tras una
  purga del cubo del SW, las imágenes pueden volver del disco sin tocar la red.
  *No introducir nunca `cache: 'reload'` ni parámetros variables en las URLs de `/cover`, y no
  bajar el `stale-while-revalidate`.*
- **KV del servidor.** Guarda el emparejamiento y los negativos, así que reponer no cuesta ni cuota
  de IGDB ni cupo de `/cover`.

## Anexo B — Descartado

| Idea | Por qué no |
|---|---|
| Mover los bytes a IndexedDB / OPFS / Storage Buckets | Misma cuota y misma purga: el bucket es el origen, no la API. `coverMemory.ts:1` ya explica por qué la Cache Storage detrás de un `<img src>` es el sitio correcto |
| Bajar el tope a quien no tenga persistencia | El desalojo se lleva el origen entero; guardar menos no protege, solo rinde menos |
| Reintentar `persist()` en cada arranque en todos | En Firefox es volver a asomar el diálogo. Con la guarda de la Fase 1 deja de ser un problema |
| Interruptor en Ajustes condicionado al permiso | En Chromium se quedaría apagado sin que nadie haya rechazado nada |

## Anexo C — Hallazgos colaterales (fuera de este plan)

Salieron al revisar qué pasaría si se empujara a instalar la app. **Ya no son bloqueantes** —nadie
empuja a instalar—, pero siguen siendo ciertos y conviene no perderlos:

1. ✅ **HECHO (2026-09-17)** — **El `state` de OAuth de GitHub era *best-effort*.** Vive en `sessionStorage`
   (`githubOAuthRepository.ts:41`) y, si a la vuelta no está, el código **no se detiene**: solo
   exige que venga informado (`:100`). Resuelto: `localStorage` con
   caducidad de 30 minutos, se rechaza el intercambio si no hay state que validar, y se acepta el formato
   anterior de `sessionStorage` durante la ventana del despliegue. Cubierto por
   `tests/unit/githubOAuthState.test.ts`.
2. **Google usa `signInWithPopup`** (`firebaseAuthRepository.ts:113`) con `authDomain` de Firebase
   (`firebaseClient.ts:168`). En una web app de iOS el popup es frágil. Pasar a `signInWithRedirect`
   NO es directo: con el authDomain de `firebaseapp.com` depende de cookies de terceros, así que
   antes haría falta servir el handler desde el dominio propio con una Pages Function en
   `functions/__/auth/[[path]].ts` (una regla de `_redirects` no vale: `/* /index.html 200` se
   tragaría `/__/auth/*`).
3. **La apariencia cuelga del candado de la escala de nota.** `AppearanceSettings` vive dentro de
   `<div className="settings-account-body" inert={!scoreScaleUid}>` (`AccountHub.tsx:46`). Hoy es
   inocuo porque el hub no se renderiza sin uid, pero si algún día se renderizara, el tema y las
   carátulas saldrían bloqueados por un gate que es de otra cosa.
4. **`App.tsx:396`**: si hay retorno de OAuth se llama a `completeGithubLoginFromRedirect()` **en
   lugar de** `initializeSync()`. Si el retorno falla, el ciclo de sync no arranca en esa carga.
   Bastaría con llamarlo en el `finally`.

## Pendientes

- [x] Safari iOS sin instalar: deniega en silencio, sin `permissions.query` (ver arriba).
- [ ] WebKit **con la app en la pantalla de inicio / el Dock**: ¿concede?
- [x] Safari macOS sin instalar: idéntico a iOS (deniega en silencio, sin `permissions.query`).
- [ ] Observar si tras el Paso 1 se siguen viendo recorridos completos repetidos en el mismo dispositivo:
      es el criterio que reabre Firestore.
- [ ] (solo si se reabre Firestore) Decidir el algoritmo del hash: nombre + plataformas + modo.
- [ ] (solo si se reabre Firestore) Confirmar que las reglas nuevas no bloquean el documento.
- [ ] Vigilar el presupuesto del chunk de arranque: 215,1 kB de 220.
