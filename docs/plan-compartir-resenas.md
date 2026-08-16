# Plan: compartir reseñas fuera de la app (enlace público)

> Objetivo: que un usuario pueda compartir **una reseña suya** en WhatsApp, X, Telegram, Bluesky o Discord
> mediante un **enlace público**, legible por quien no tiene cuenta, **sin escribir un solo byte en los Gists** y
> sin gastar peticiones contra la API de GitHub, que ya está repartida entre la sincronización de la biblioteca y
> el fan-out del feed social.

> ⚠️ **Documento vivo.** Es una guía de diseño, no un contrato cerrado. Al abordar cada paso, verifica el estado
> real del código (las líneas citadas pueden haberse movido), confirma en la consola lo marcado como
> *(por confirmar)* y actualiza este `.md`. Trátalo como código: se revisa con la implementación.

## Decisiones tomadas

| Decisión | Valor |
|---|---|
| Qué se comparte | **Un enlace**, no una imagen. No hay botón de "compartir imagen" ni generador de tarjetas |
| Previsualización | `og:image` **genérica de la app** (PNG fijo); el juego, la nota y el extracto van en `og:title` / `og:description`, que sí son dinámicos |
| Indexación | `Disallow: /` se mantiene para todo, incluido Google, y `X-Robots-Tag: noindex` sigue vigente. Solo se abre `/r/*` a los agentes de **previsualización** |
| Contenido publicado | Juego, nota, texto completo, nick, fecha **+ metadatos**: plataformas, géneros, puntos fuertes y débiles |
| Foto del autor | **No sale de la app.** No viaja en el artículo y no se pinta en la página pública: avatar genérico para todo el mundo |
| Carátula | **No**. Nada de arte de terceros en la página pública |
| Tema visual | El **tema por defecto**, salvo que el visitante tenga la app en ese navegador con un tema elegido |
| Almacenamiento | **Cloudflare KV**. Ni Gists, ni Firestore, ni R2 |
| Cuotas | Por rango de perfil, con **ajuste individual** por usuario desde `/admin` (ver §4) |
| Moderación | Censo, retirada y **veto de usuario** desde `/admin` |
| Consentimiento | Se suben los textos legales y **`LEGAL_VERSION`**: todos los usuarios vuelven a pasar por la puerta del hub |

**Lo que NO se hace:** no se publican reseñas completas en el feed interno (el gist social sigue con `snippet`
≤160 y su allowlist estricta; nada de aquí toca `socialGistSchema.ts` ni `socialProjection.ts`); no se leen Gists
desde el servidor; no se crean Gists nuevos; no se cuentan visitas por enlace.

---

## 1. Contexto de arquitectura (para quien implemente)

**Dónde vive hoy una reseña.** El texto completo (`review`) está SOLO en el **gist de juegos**, que la app crea
con `public: false` (`gistRepository.ts:144`). El canal social publica únicamente un `snippet` de ≤160 caracteres
(`socialProjection.ts:294-318`), con allowlist Zod estricta (`socialGistSchema.ts`) y `review` en la denylist
(`SOCIAL_PRIVATE_FIELDS`, `socialProjection.ts:456`).

**Por qué el enlace no puede apoyarse en un Gist.**

| Canal | Qué pasaría al meter artículos | Coste real |
|---|---|---|
| Gist social | Lo descargan **todos** los amigos (hasta ~50) en cada hidratación, según el TTL del rango (`tiers.ts`) | Cada KB se multiplica por amigos × refrescos, contra las 5.000 pet/hora que se **comparten con el sync** |
| Gist de juegos | Acelera el chunking (`GAMES_UNCHUNKED_BUDGET_KB`) y el reparto en gists de overflow (`MAX_OVERFLOW_CHUNKS_PER_GIST = 4`) | Más gists por usuario, más lecturas por sincronización |
| Gist nuevo "de compartidos" | Aísla del fan-out, pero sigue siendo 1 gist más y 1 PATCH por compartir | Paga el precio del gist sin ganar nada frente a KV |

**Invariante que se rompe conscientemente.** Hoy la reseña completa no sale del ámbito privado del usuario. Este
plan la publica **por acción explícita, reseña a reseña, con caducidad y de forma revocable**. De ahí el cambio
de `LEGAL_VERSION` (§7).

**Dónde encaja en la UI actual.** `view/components/stats/StatsReviews.tsx` ya reutiliza
`SocialProfileReviewScreen` para pintar el detalle de **tu propia** reseña (`profileName = L.mine`). El botón
*Compartir* va ahí, y la **página pública reutiliza ese mismo componente**: ya recibe `platforms`, `genres`,
`strengths` y `weaknesses`, que son justo los metadatos que se publican.

> ⚠️ Ese componente también acepta `hours`, que es **campo privado** (está en `SOCIAL_PRIVATE_FIELDS`). En el
> artículo público se pasa siempre `null`. El esquema Zod del paso 2 lo impide de forma positiva.

---

## 2. Modelo de datos

Todo vive en un único namespace de KV. Nada de esto toca Firestore ni los Gists.

| Clave | Contenido | TTL |
|---|---|---|
| `share:{token}` | El artículo público (JSON). **Sin identidad de ninguna clase** | `expiresAt` |
| `user:{uid}:{token}` | Índice del propietario: `{ token, gameId, gameName, createdAt, expiresAt }` | `expiresAt` |
| `owner:{token}` | `uid` del autor. **Privado**: nunca se sirve al visitante | `expiresAt` |
| `quota:{uid}:{yyyy-mm-dd}` | Contador de creaciones del día (anti-abuso) | 48 h |
| `quota:override:{uid}` | Ajuste individual de cuota: `{ maxActive?, ttlDays?, reason?, setAt, by }` | sin TTL |
| `ban:{uid}` | Veto de compartir: `{ reason?, bannedAt, by }` | sin TTL |

`owner:{token}` existe porque `share:{token}` **no puede llevar el uid** (lo lee cualquiera con el enlace) y aun
así hacen falta tres cosas que necesitan saber de quién es un enlace: retirarlo desde `/admin` conociendo solo el
token, purgar todos los de un usuario al vetarlo, y limpiar el índice del propietario al borrar.

```ts
/** Artículo público. Allowlist estricta: NO lleva uid, email, gistId, horas ni nada fuera de esta lista. */
interface SharedReview {
  v: 1;
  gameId: number;
  gameName: string;
  grade: number | null;        // 0–100, la nota fina que ya se publica en el canal social
  rating: number | null;       // espejo 0–5
  review: string;              // el texto completo — el único campo que hoy no sale del ámbito privado
  platforms: string[];
  genres: string[];
  strengths: string[];
  weaknesses: string[];
  authorNick: string;          // el nick del perfil, NUNCA el correo ni el uid
  reviewedAt: number;          // fecha de la reseña
  createdAt: number;
  expiresAt: number;
}
```

**Sin foto de perfil, y no por render sino por diseño.** La foto del autor **no viaja en el artículo**. Ocultarla
solo al pintar no serviría de nada: el JSON llega igual al navegador anónimo, así que quien mirase la respuesta la
tendría. Fuera del payload no hay nada que filtrar. La página muestra un avatar genérico (`HubAvatar` ya sabe
pintar iniciales) para todo el mundo, tenga cuenta o no.

> *Evolución posible, fuera de esta entrega:* para que quien tenga cuenta y sea amigo del autor vea su foto,
> habría que incluir `authorProfileId` —el pseudónimo público que ya usa el canal social— y resolver la imagen en
> el cliente desde el grafo de amistad. Se deja fuera a propósito: añade un identificador correlacionable al
> artículo público a cambio de un detalle estético.

**Snapshot congelado, no referencia.** El enlace nunca lee GitHub (cero peticiones, cero rate-limit) y editar la
reseña después no altera lo ya publicado, que es lo correcto para algo que se presenta como artículo publicado.
Para actualizarlo, se vuelve a compartir (§9, duda 1).

El `token` es **aleatorio de 128 bits** (`crypto.randomUUID()` sin guiones, o 22 caracteres base64url). Nunca
correlativo ni derivado del `gameId` o del `uid`: sería enumerable.

---

## 3. Endpoints

```
POST   /api/share             crea o renueva un enlace   (ID token requerido; 403 si el autor está vetado)
DELETE /api/share/:token      retira un enlace           (propietario o admin)
GET    /api/share/mine        mis enlaces activos + estado de veto
GET    /api/share/all         censo global paginado      (solo admin)
POST   /api/share/ban/:uid    veta a un usuario          (solo admin; `purge: true` retira los suyos)
DELETE /api/share/ban/:uid    levanta el veto            (solo admin)
POST   /api/share/quota/:uid  ajusta la cuota individual (solo admin)
DELETE /api/share/quota/:uid  vuelve a la cuota del rango (solo admin)
GET    /r/:token              página pública             (SSR de metadatos + shell de la SPA)
```

**Autenticación en el borde.** La Function verifica el **ID token de Firebase** contra el JWKS de Google (RS256
con WebCrypto, claves cacheadas en KV). Del token verificado salen `uid`, `email` y `email_verified`.

**Admin: el mismo criterio que las reglas** — `email_verified == true` y correo igual al del administrador
(`firestore.rules:13-18`). Se lee de una **variable de entorno del Worker** (`ADMIN_EMAIL`), no se repite el
literal: dos copias del correo del administrador en dos ficheros es una divergencia esperando a ocurrir.

**Cómo conoce la Function el rango.** El `tier` vive en `profiles/{uid}`. El cliente envía en la petición su ID
token **y su token de App Check** (`getToken()` del SDK), y la Function los reenvía a la API REST de Firestore
(`Authorization: Bearer` + `X-Firebase-AppCheck`). Así funciona **esté o no activada la exigencia de App Check**,
sin cuenta de servicio ni secretos nuevos en el Worker. El tier se cachea 5 minutos en KV: una lectura por
publicación, nunca por visita.

**Veto.** `POST /api/share` comprueba `ban:{uid}` **antes que la cuota** y responde `403` con el motivo si existe.
El veto no retira por sí solo lo ya publicado: retirar es una decisión aparte, que el admin toma con
`purge: true` o enlace a enlace. Vivir en KV y no en `profiles` es deliberado — es una regla del **servicio**,
como las cuotas, así que no tiene por qué tocar el esquema de perfiles, su allowlist de escritura ni
`profileTierNotSelfAssigned` en las reglas.

**`GET /r/:token`** lee el artículo, **escapa** el texto y lo inyecta en `og:title`, `og:description`,
`og:image` (el PNG genérico), `twitter:card=summary_large_image`, y devuelve el shell de la SPA. El escapado de
`<`, `>`, `&` y comillas **no es opcional**: es el único punto genuinamente peligroso de toda la funcionalidad
(inyección de metaetiquetas o de marcado desde el texto de un usuario).

---

## 4. Cuotas por rango

A diferencia de `PROFILE_TIER_POST_MAX_LENGTH` —una regla de producto que aplica el propio cliente sobre un
recurso del usuario (su gist)—, **aquí el recurso es del servicio**, así que la cuota es una **barrera real
aplicada en la Function**. El cliente la refleja para que no haya sorpresas, pero quien manda es el servidor.

| Rango | Duración del enlace | Enlaces activos |
|---|---|---|
| Bronce | 7 días | 5 |
| Plata | 10 días | 10 |
| Oro | 14 días | 15 |
| Mithril | 90 días | 50 |

En `core/constants/tiers.ts`:

```ts
/** Días que un enlace compartido permanece accesible, por rango. Lo aplica la Function, no el cliente. */
export const PROFILE_TIER_SHARE_TTL_DAYS: Record<ProfileTier, number> = {
  bronze: 7, silver: 10, gold: 14, mithril: 90,
};

/** Enlaces activos simultáneos por rango. Al alcanzarlo hay que retirar uno o esperar a que caduque. */
export const PROFILE_TIER_SHARE_MAX_ACTIVE: Record<ProfileTier, number> = {
  bronze: 5, silver: 10, gold: 15, mithril: 50,
};

/**
 * Techo de CREACIONES al día: el mismo número que sus enlaces activos. «Al día puedes crear tantos como puedes
 * tener a la vez». Frena el ciclo crear-y-retirar sin una segunda tabla de cifras que mantener, y va atado a la
 * cuota RESUELTA, así que un recorte individual recorta también el ritmo.
 */
export function shareDailyLimit(quota: ShareQuota): number {
  return quota.maxActive;
}
```

**Techo diario, y por qué es el mismo número.** Al día se pueden crear tantos enlaces como se pueden tener vivos
(5, 10, 15, 50). Salió de contrastar las cuotas con los límites reales de KV: publicar cuesta **4 escrituras**
(artículo, propietario, índice y contador) y el plan gratuito da **1.000 al día**, o sea ~250 publicaciones
diarias en todo el sistema. Con el techo suelto de 20 que había antes, **trece personas** en su tope agotaban el
día —siete si se dedicaban a crear y retirar—, y las publicaciones legítimas de los demás empezaban a fallar. Con
la regla actual harían falta ~50 usuarios de bronce a la vez, que es un problema de éxito y no de diseño.

Lo que NO cuesta escrituras es la duración ni el número de enlaces vivos: eso solo ocupa almacenamiento, y con
~2,5 KB por enlace caben unos 400.000 en el 1 GB del plan gratuito. Por eso los tramos de duración pueden ser
generosos sin consecuencias.

**Asimetría deliberada con los posts:** bronce **no** puede publicar en el feed
(`PROFILE_TIER_POST_MAX_LENGTH.bronze = 0`) pero **sí** puede compartir 5 enlaces. No es una incoherencia:
publicar en el feed es ocupar el espacio de los demás; compartir la reseña propia es sacarla fuera. Dejarlo
escrito en el comentario de la constante para que nadie lo "arregle" más adelante.

### Ajuste individual por perfil

El rango es un instrumento romo: cambiarlo para tocar lo que alguien comparte **también le cambia la frescura de
su feed** (`PROFILE_TIER_FEED_TTL_MS`), que es otro asunto. Y entre «normal» y «vetado» no había ningún escalón
intermedio. El ajuste individual lo pone.

`quota:override:{uid}` guarda `maxActive` y/o `ttlDays`, **cada uno opcional por separado**: se puede recortar
solo el número de enlaces sin tocar su duración, o al revés.

**Reglas de resolución** (en este orden, y así se implementa en `functions/_lib/quota.ts`):

1. ¿Hay `ban:{uid}`? → no puede publicar. Fin.
2. ¿Hay `quota:override:{uid}` con el campo? → **manda el override**, en valor absoluto, no como delta ni como
   suma sobre el rango.
3. Si no → el valor de su rango (tabla de arriba).
4. En cualquier caso, nunca por encima del techo de mithril (**90 días / 50 enlaces**) ni del techo diario de
   creaciones. Es la cota del saneador: protege de un dedazo en el panel, no del usuario.

**Consecuencias, deliberadamente iguales a las de cambiar de rango:**

- El override **manda sobre el rango mientras exista**. Si luego se le sube el rango, sigue mandando el override
  hasta que el admin lo quite. Es lo predecible: quien puso una excepción es quien la retira.
- Cambiar `ttlDays` **no reescribe** los enlaces ya creados: cada uno conserva la caducidad que tenía al nacer.
- Bajar `maxActive` por debajo de lo que ya tiene activo **no retira nada**: simplemente no puede crear más hasta
  bajar del nuevo límite.
- Quitar el override lo devuelve a la cuota de su rango, sin efectos retroactivos.

**Qué ve el usuario:** su cuota efectiva y nada más — *«3 de 8 enlaces activos»*. No se anuncia como premio ni
como castigo, ni se le muestra el motivo (ver §11, duda 9). El veto sí se le explica; esto no, porque es un
número, no una sanción.

**Transiciones de rango** (regla: simple y predecible):

- Subir de rango **no** extiende los enlaces ya creados: cada uno conserva la caducidad que tenía al nacer.
- Bajar de rango **no** retira nada. Si te quedas por encima del nuevo máximo, no puedes crear más hasta bajar
  del límite.
- Al alcanzar el máximo, el mensaje dice **qué hacer**: *«Tienes 5 de 5 enlaces activos. Retira uno o espera a
  que caduque el más antiguo (dentro de 2 días).»*

---

## 5. Página pública y navegación cerrada

**Requisito:** quien abre el enlace sin cuenta ve el artículo y **nada más**. No puede llegar al perfil del
autor, no puede volver atrás dentro de la app, no puede navegar libremente.

**Modo artículo (sin app en este navegador):**

- La ruta `/r/:token` se resuelve **antes** del router principal: se monta una pantalla independiente y **no se
  monta la app** (ni hub social, ni Firebase, ni App Check, ni analítica). Además de cerrar la navegación, deja
  la página ligerísima y sin terceros.
- **Sin cromo**: ni navegación inferior, ni encabezado de secciones, ni menú.
- **Sin botón de volver.** El visitante entró directo: no hay historial propio que deshacer. El «atrás» del
  navegador lo saca del sitio, que es lo natural y no se intercepta.
- **El nick es texto plano, nunca un enlace**, y **no hay foto de perfil**: el artículo no la lleva (§2), así que
  se pinta un avatar genérico. El perfil social no es público y no puede alcanzarse desde aquí.
- Única salida ofrecida: un CTA discreto *«Descubre My Game List»* hacia la home. Explícito y elegido, no una
  deriva accidental.
- **No se registra el service worker** en esta ruta: no tiene sentido instalar la PWA a un visitante de paso.
- **Tema por defecto.** `public/theme-init.js` ya lee `THEME_KEY` y `PALETTE_KEY` de `localStorage` antes del
  primer render: si el visitante resulta tener la app con tema elegido, se respeta; si no hay claves, tema por
  defecto. No hay que hacer nada especial, solo **no** forzar el tema del autor.

**Con la app en este navegador**, la pantalla se integra con normalidad (cromo, atrás) y el nick enlaza al perfil
del autor **solo si hay amistad**; si no la hay, sigue siendo texto plano. El avatar sigue siendo genérico
también aquí: la foto no está en el artículo y esta entrega no la resuelve por otra vía.

**Detección de "hay cuenta" sin cargar Firebase:** comprobar la presencia de `STORAGE_KEY` /
`SOCIAL_GIST_CFG_KEY` en `localStorage` (`core/constants/storageKeys.ts`). Señal barata y suficiente. **No**
cargar el SDK de Firebase para averiguarlo: sería justo lo que se quiere evitar.

**Ojo con el enrutado:** hay que declarar `/r/:token` en `APP_ROUTES` (`core/constants/routes.ts`) o
`FALLBACK_ROUTE` la rebotará a `/completados` — es exactamente la clase de fallo que ese fichero documenta que ya
ocurrió con `/social/requests`.

**Estados terminales** (misma pantalla, sin salida salvo el CTA): *enlace caducado*, *retirado por su autor*,
*no encontrado*. Los tres con el mismo aspecto, sin distinguir más de lo necesario.

---

## 6. Moderación desde `/admin`

Sección nueva en `AdminHub` (`view/components/AdminHub.tsx`), coherente con lo que ya hace el panel:

- **Censo de enlaces** (`GET /api/share/all`, paginado por cursor con `list()` sobre el prefijo `user:`, que ya
  lleva el uid en la clave): token, juego, autor, fecha de creación, caducidad y un extracto del texto.
- **Retirar un enlace** (`DELETE /api/share/:token`) con el mismo `ConfirmModal` que usan las acciones
  destructivas actuales. Retirar borra las tres claves: artículo, índice del propietario y `owner:{token}`.
- **Vetar a un usuario** (`POST /api/share/ban/:uid`), con motivo opcional y casilla *«retirar también sus
  enlaces activos»*. El veto le impide crear nuevos; lo ya publicado solo desaparece si se marca la casilla.
  Se levanta desde la misma fila.
- **Ajustar la cuota** de un usuario (`POST /api/share/quota/:uid`): dos campos opcionales —enlaces activos y
  días— con su motivo, y un botón para volver a la cuota del rango. La ficha muestra siempre la cuota efectiva y,
  si hay ajuste, de qué valor de rango viene: *«8 enlaces (rango: 5)»*.
- El veto y el ajuste son accesibles desde **las dos vistas**: la fila del censo de enlaces y la ficha del
  usuario en el censo de perfiles que ya existe, que es donde el admin suele estar cuando llega un aviso.
- Filtro por autor y orden por fecha, para atender un aviso concreto sin recorrer el censo entero.

**Qué ve el usuario vetado:** el botón *Compartir* aparece desactivado con el motivo, y la pantalla de gestión lo
explica. No se le oculta la funcionalidad ni se le da un error genérico: sabe que está vetado y por qué.

**Por qué hace falta:** con esta funcionalidad, el dominio pasa a alojar texto escrito por usuarios. Es una
superficie de abuso nueva (spam o phishing con la credibilidad del dominio propio) y tiene que existir un botón
para tumbar un enlace sin desplegar código.

---

## 7. Legal y borrado de cuenta

1. Actualizar `core/constants/legal.ts`: destinatarios, plazos de conservación **por rango**, derecho a retirar.
2. Subir `LEGAL_VERSION` (hoy `'2026-08-12'`) → todos los usuarios repiten el consentimiento en la puerta del hub.
3. Decir con todas las letras lo que ya se dice bien de los Gists: retirar un enlace lo deja inaccesible, **pero
   no recoge las copias** — un enlace ya reenviado no vuelve. El botón se llama *«Dejar de compartir»*, nunca
   *«Borrar»*.
4. **`accountDeletionRepository.ts`** limpia hoy `profiles`, `privateConfig`, `publicConfig` y `userMap`
   (`OWNED_COLLECTIONS`). Debe **retirar además todos los enlaces del usuario** (prefijo `user:{uid}:`, con sus
   `share:` y `owner:` correspondientes), antes de borrar el perfil.

   **CAMBIO respecto a lo planeado:** el veto (`ban:{uid}`) y el ajuste de cuota **NO** se borran ahí. Se planeó
   así, pero al implementarlo se vio el agujero: la purga la pide el propio usuario con su token, de modo que
   borrar el veto desde ese camino permitiría quitárselo llamando al endpoint sin borrar nada. Quedan como
   residuo de un uid que ya no existirá —dos claves diminutas, sin datos personales más allá del identificador—
   y los limpia el administrador. Sin
   lo primero, el derecho de supresión queda incompleto: sus reseñas seguirían públicas. Lo segundo no abre
   ninguna puerta —quien se borra la cuenta y vuelve estrena `uid` de todos modos— y evita conservar un dato
   asociado a una persona que ya no existe en el sistema.

---

## 8. Plan de implementación

Siete pasos, en este orden. Cada uno deja el árbol desplegable y con `npm run validate` + `npm test` en verde.

### Paso 1 — Previsualización · **HECHO**

- `scripts/build-share-card.mjs` (+ `npm run build:share-card`): rasteriza `public/share-card.svg` con el
  Chromium de Playwright y la DM Sans autohospedada. El SVG sigue siendo la fuente editable; la imagen es su
  salida y se versiona con él. No entra en `npm run build` para no exigir un navegador en cualquier entorno.
- **Salida en JPEG, no PNG.** La tarjeta es un degradado a pantalla completa, lo que peor comprime un PNG: el
  mismo render pesa 315 kB en PNG y **57 kB en JPEG de calidad 90**, sin diferencia visible en el texto.
- `index.html`: `og:image` / `twitter:image` → `/share-card.jpg`, `og:image:type: image/jpeg` y textos
  alternativos. **Motivo:** X, WhatsApp, Facebook y LinkedIn no renderizan SVG, así que la tarjeta salía vacía.
- **Corregido de paso:** el subtítulo del SVG se salía del lienzo por la derecha con DM Sans a 42 px. No se
  notaba porque nadie rasterizaba el SVG. Ahora va en dos líneas. También se le pusieron las tildes que le
  faltaban.
- `public/robots.txt`: `Disallow: /` general intacto y bloque `Allow: /r/` + `Disallow: /` para
  `facebookexternalhit`, `WhatsApp`, `Twitterbot`, `LinkedInBot`, `Slackbot`, `Slackbot-LinkExpanding` y
  `Discordbot`. Telegram y Signal no consultan robots.txt. De paso se unificaron los dos grupos `User-agent: *`
  duplicados que había.
- `public/_headers`: `/r/*` con `Cache-Control: public, max-age=60` (corto, para que retirar un enlace se note) y
  `/share-card.jpg` con un día. El `X-Robots-Tag: noindex, nofollow` global sigue cubriéndolo todo.

**Pendiente de una decisión que no bloquea:** `og:image` es una ruta relativa. La especificación de Open Graph
pide URL absoluta, aunque en la práctica los agentes actuales la resuelven. Se deja así hasta que esté confirmado
el dominio definitivo (§12.1), y entonces se pone absoluta.

**Verificación hecha:** `npm run validate` en verde (ci-validate, html-validate y eslint sin errores nuevos; los
14 avisos de `react-hooks/exhaustive-deps` son preexistentes) y revisión visual del render.

**Verificación que requiere despliegue:** el validador de tarjetas de X y el depurador de OG de Facebook sobre una
URL real, y comprobar que `site:` en Google sigue sin devolver nada del dominio.

### Paso 2 — Modelo, esquema y constantes · **HECHO**

- `core/constants/tiers.ts`: `PROFILE_TIER_SHARE_TTL_DAYS`, `PROFILE_TIER_SHARE_MAX_ACTIVE`,
  `SHARE_MAX_CREATIONS_PER_DAY`, los dos techos, y `resolveShareQuota` / `shareExpiresAt`. La resolución vive
  aquí, junto a los números, para que cliente y Worker usen la misma y no haya dos verdades.
- `model/types/share.ts`: `SharedReview`, `SharedReviewIndexEntry`, `ShareBan` y `MySharesResponse`.
- `model/schemas/shareSchema.ts`: Zod `strictObject` con cotas + `assertNoShareForbiddenFields` (denylist
  explícita con los campos privados, los de identidad y la foto). `assertValidSharedReview` lanza al publicar;
  `parseSharedReview` devuelve `null` al leer, para que un artículo corrupto no rompa la página del visitante.
- `tests/unit/shareQuota.test.ts` y `tests/unit/shareSchema.test.ts`: **28 casos**, incluidos los que fijan
  decisiones de producto (bronce comparte aunque no publique; el override manda en absoluto y se recorta al
  techo; un valor corrupto degrada al rango).

**Decisión de implementación:** la resolución de cuota **no se duplica** en el Worker. `tiers.ts` no tiene
dependencias (ni React, ni DOM, ni otros módulos), así que la Function puede importarlo por ruta relativa aunque
`functions/` quede fuera del tsconfig del proyecto. Queda anotado en el propio fichero. **Comprobar en el paso 3
con `wrangler pages dev`**; si el build de Functions no lo resolviera, la alternativa es copiar las constantes
allí con nota de sincronía, como ya se hace entre `storageKeys.ts` y `public/theme-init.js`.

**Pendiente para el paso 4:** Zod está fuera del bundle de arranque a propósito (`BOOT_PAYLOAD_BUDGET_KB`), así
que `shareSchema.ts` debe cargarse **bajo demanda**, como hace el canal social con `loadSocialGistValidator`.
Está avisado en la cabecera del módulo.

**Verificación:** `npm test` (111 ficheros, 1081 casos), `npm run typecheck` y `npm run validate` en verde. El
presupuesto de arranque no se mueve (210,3 kB de 215): los módulos nuevos todavía no los importa nadie.

### Paso 3 — Pages Functions · **HECHO**

```
functions/_lib/firebaseAuth.ts   verificación de ID token (JWKS + RS256, caché en KV)
functions/_lib/tier.ts           lectura del tier vía Firestore REST (reenvía idToken + App Check), caché 5 min
functions/_lib/quota.ts          resolución de cuota (veto → override → rango → techos) + contador diario
functions/_lib/ban.ts            lectura/escritura del veto y purga de los enlaces de un usuario
functions/_lib/html.ts           escapado y plantilla de metadatos
functions/api/share/index.ts     POST (crear/renovar) · GET mine (incluye estado de veto)
functions/api/share/[token].ts   DELETE (propietario o admin)
functions/api/share/all.ts       GET censo (admin)
functions/api/share/ban/[uid].ts POST veto (con purga opcional) · DELETE levantar (admin)
functions/api/share/quota/[uid].ts POST ajuste individual · DELETE volver al rango (admin)
functions/r/[token].ts           SSR de la página pública
```

- `wrangler.toml`: binding del namespace KV (`SHARES`) y vars `ADMIN_EMAIL`, `FIREBASE_PROJECT_ID`. El
  `client_id` de GitHub que ya está ahí es el precedente de cómo se documentan estas variables.
- `tests/unit/shareFunctions.test.ts`: 14 casos sobre los ayudantes puros. Lo que necesita KV o HTMLRewriter se
  probó con `wrangler pages dev` de verdad, no con simulacros: imitar el almacén no habría demostrado nada.

**Decisiones tomadas al implementar:**

- **El import desde `src/` funciona** (verificado): la Function usa `resolveShareQuota` y el esquema Zod del
  proyecto, así que no hay una segunda copia de las cuotas ni de la allowlist. El bundle son 596 kB sin
  comprimir, Zod incluido — muy por debajo del límite de Workers.
- **Renovar en vez de duplicar:** volver a compartir la misma reseña reescribe sobre el mismo token con nueva
  caducidad. No gasta cuota y, sobre todo, el enlace que ya circula sigue vivo en vez de morir mientras otro
  nuevo da vueltas en paralelo.
- **`/r/:token` responde siempre con el shell**, también si el enlace no existe o caducó. Un 404 dejaría al
  visitante en la página de error de Cloudflare, que no explica nada; así lo explica la propia app.
- **El escapado lo hace HTMLRewriter**, que es un parser de verdad, no reemplazos de cadena. La limpieza de
  ángulos que hay encima es de PRESENTACIÓN y solo quita lo que tiene forma de etiqueta: borrarlos todos habría
  destrozado texto legítimo como «se mata en <3 minutos» o «dura 5 < 10 horas».
- **El contador diario no es atómico** (KV no tiene incremento). Aceptable a propósito: la cuota de producto se
  calcula contando enlaces vivos, que sí es exacta; el diario es un freno anti-abuso donde fallar por uno no
  cambia nada.

**Verificado con `wrangler pages dev` + KV local:** artículo inexistente → 404 con mensaje único (no distingue
caducado de retirado de inexistente); endpoints autenticados sin configuración → 500 explícito antes de mirar el
token; `/r/:token` con un artículo sembrado → reescribe `<title>`, `og:title`, `og:description`,
`og:type: article` y `og:url`, con las comillas del nombre del juego escapadas a `&quot;` y sin rastro de la
etiqueta `<script>` incrustada en el texto de prueba.

**Configuración completa y verificada en un despliegue real.** `FIREBASE_PROJECT_ID = "mylists-f7313"`, tomado del fallback público de
`firebaseClient.ts:139-147`: como en Cloudflare no hay variables `VITE_FIREBASE_*`, el build usa ese fallback, así
que es el proyecto real. Si algún día se definen esas variables en el panel, hay que sincronizar este valor.

**Un fallo que solo apareció al comprobar la configuración de verdad:** la URL de las claves públicas de Google
es `/service_accounts/v1/jwk/` en **singular**. El código pedía `/jwks/` —que es como se llama el formato, y por
eso invita al error— y eso devuelve un 404 en HTML. El fallo era cerrado, pero habría dejado la funcionalidad
inservible con un síntoma engañoso: **401 para todos los usuarios**, que parece un problema de sesión y no de
configuración. Hay una prueba que fija la URL para que nadie la "corrija", y `loadJwks` ahora rechaza una
respuesta vacía en vez de cachearla una hora.

**Verificado con el `projectId` ya puesto:** sin cabecera → 401 «Falta la sesión»; con un token inventado o con
un JWT bien formado pero de otro firmante → 401 «Sesión no válida»; y la caché `jwks:securetoken` aparece en el
KV local con las claves reales de Google, que es la prueba de que la descarga funciona.

**Efecto secundario bueno:** como `tests/unit/shareFunctions.test.ts` importa de `functions/_lib`, esos módulos
entran ahora en `npm run typecheck` aunque `functions/` siga fuera del tsconfig. Ya destapó un error de tipos
real en la llamada a WebCrypto.

### Paso 4 — Cliente: publicar y gestionar · **HECHO**

- `model/repository/shareRepository.ts`: `createShare`, `deleteShare`, `listMyShares`. Adjunta ID token + token
  de App Check.
- `viewmodel/useShareViewModel.ts`: estado, cuota restante, errores.
- UI:
  - Botón **Compartir** en el detalle de tu reseña — `StatsReviews.tsx` pasando una prop nueva y opcional a
    `SocialProfileReviewScreen`, para que el hub social (donde la reseña es de otro) no lo pinte.
  - `view/modals/ShareReviewModal.tsx`: hoja de consentimiento la primera vez (qué se publica, qué no, cuánto
    dura según tu rango, que se puede retirar), casilla obligatoria y confirmación.
  - Distintivo en la reseña: *«Compartida · caduca en 5 días»* con *Copiar enlace* y *Dejar de compartir*.
  - Ajustes → **Reseñas compartidas**: lista con juego, fecha, caducidad y contador *«3 de 5 enlaces activos»*.
    Si el usuario está vetado, la pantalla lo dice con su motivo y el botón *Compartir* queda desactivado con la
    misma explicación (nunca un error genérico).
- Textos en `core/constants/labels.ts` (`SHARE_UI`), como el resto de la app.

### Paso 5 — Página pública y navegación cerrada · **HECHO**

- `view/components/PublicReviewScreen.tsx`: envuelve `SocialProfileReviewScreen` con `hours: null`, sin enlaces
  de navegación y con el CTA único.
- Arranque en `src/main.tsx`: si `location.pathname.startsWith('/r/')` **y** no hay marca de app en
  `localStorage` → montar solo esa pantalla, sin registrar el service worker ni cargar Firebase.
- Declarar `/r/:token` en `APP_ROUTES` para el caso con app instalada.
- Estados terminales (caducado / retirado / no encontrado).

**Aceptación:** con el `localStorage` vacío, la página no monta ningún enlace de navegación ni carga chunk de
Firebase (verificable en la pestaña de red).

### Paso 6 — Moderación en `/admin` · **HECHO**

- Repositorio y sección nueva en `AdminHub` + `useAdminViewModel`: censo paginado, filtro por autor, retirada
  con `ConfirmModal`.
- Acción de **veto** (con motivo y casilla de purga) en la fila del censo de enlaces y en la ficha del usuario
  del censo de perfiles, más la de levantarlo. Confirmación con el mismo modal que el resto de acciones
  destructivas.
- Acción de **ajuste de cuota** (enlaces activos y/o días, con motivo) y de vuelta al valor del rango, en las
  mismas dos vistas. La ficha muestra la cuota efectiva y el valor de rango del que viene.
- Sube a ~1,5 días con el veto y el ajuste incluidos.

### Paso 7 — Legal, supresión y cierre · **HECHO** (falta la QA de tarjetas en clientes reales)

- `legal.ts` + `LEGAL_VERSION`.
- `accountDeletionRepository.ts`: retirada de enlaces antes de borrar el perfil.
- Repaso de `SECURITY.md` y `README.md` si mencionan qué sale de la app.
- QA real en WhatsApp, X, Telegram, Discord y Bluesky, que es donde salen las sorpresas.

**Total ≈ 7,5 días** de trabajo, sin contar la QA en clientes reales.

---

## 9. Pruebas

| Nivel | Qué cubre |
|---|---|
| Unitario (Vitest) | Esquema Zod (campo extra, `hours`, `authorPhoto`, longitudes), resolución de cuota (veto → override → rango → techos, con override parcial de un solo campo), cuota activa y diaria, veto (403 y purga), escapado HTML |
| Componente | `ShareReviewModal` (consentimiento obligatorio), pantalla de gestión (retirar libera cuota; vetado lo explica), `PublicReviewScreen` sin elementos de navegación ni foto |
| E2E (Playwright) | Abrir `/r/:token` sin sesión: no hay enlaces internos, no hay botón atrás, no hay foto del autor, el CTA es la única salida. Pasada de `axe` como en el resto de pantallas |
| Manual | Tarjeta en WhatsApp, X, Telegram, Discord y Bluesky |

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Inyección desde el texto del usuario en los metadatos | Escapado en la Function + prueba unitaria con `"`, `<`, `>` y saltos de línea |
| Abuso del dominio (spam/phishing) | Cuotas por rango, techo diario, censo, retirada y veto desde `/admin` |
| Reincidencia tras retirar sus enlaces | Veto en `ban:{uid}`, comprobado antes que la cuota en cada publicación |
| Dedazo en el panel (override desmedido) | La resolución recorta siempre al techo de mithril y al techo diario |
| Foto de perfil expuesta a desconocidos | No viaja en el artículo: no hay nada que ocultar en el render |
| Caché del borde contra revocación | `max-age=60` en `/r/*` |
| Enumeración de tokens | Token aleatorio de 128 bits, nunca derivado de `uid` o `gameId` |
| Fuga de identidad | El artículo no lleva uid, email ni gistId; el índice va en clave aparte; esquema Zod como garantía positiva |
| Campo privado colado (`hours`) | `hours: null` explícito + denylist en el esquema |
| Bots de preview bloqueados en el borde | Bot Fight Mode no aplica en `pages.dev` (§12.3); revisar al pasar a dominio propio |
| Supresión incompleta | El borrado de cuenta retira los enlaces antes de borrar el perfil |

---

## 11. Dudas menores, resueltas por defecto

Si alguna no convence, se cambia aquí y en el código:

1. **Volver a compartir la misma reseña** actualiza el snapshot y **renueva la caducidad sobre el mismo token**,
   sin consumir cuota nueva. Efecto secundario aceptado: un usuario activo puede mantener vivo un enlace
   renovándolo.
2. **Sin contador de visitas** en la primera entrega: sería analítica sobre lectores que no han consentido nada.
3. **Cota del texto publicado**: `POST_HARD_CEILING` (100.000), la misma que ya usa el saneador de publicaciones.
4. **Reseña de un juego en una pestaña oculta** (`visibility.hiddenTabs`): se puede compartir —es una acción
   explícita sobre una pieza concreta—, pero la hoja avisa de que esa pestaña está oculta en tu perfil.
5. **Foto del autor**: no se publica en ningún caso (§2). Avatar genérico para todo el mundo.
6. **Compartir exige perfil social**, porque de ahí salen el nick y el rango. Quien no lo tenga ve la invitación
   a darse de alta. *(Es la duda más discutible del lote: alternativa sería permitirlo con rango bronce y el
   nombre de la cuenta de Google, cosa que prefiero no hacer sin que lo decidas.)*
7. **El veto es permanente hasta que el admin lo levante** (la clave `ban:{uid}` no lleva TTL). Si se quisieran
   vetos temporales, basta con darle TTL a esa clave. Lo mismo vale para el ajuste de cuota.
8. **Idioma**: la página pública en español, como el resto de la app.
9. **El ajuste individual de cuota no se le anuncia al usuario**: ve su número efectivo, sin etiqueta de
   excepción ni motivo. Es la opción discreta y evita convertir un número en una conversación. *La alternativa
   sería enseñar el motivo cuando el ajuste es a la baja, por transparencia; se descarta porque un recorte
   silencioso ya se nota (el contador baja) y quien quiera saber por qué preguntará.*

## 11 bis. Estado del despliegue

**Vista previa viva y funcionando**: `https://develop.mygamelist.pages.dev` sirve ya esta rama, y sus Functions
responden con **404 «Este enlace ya no está disponible»** y **401 «Falta la sesión»** — no con el 500 de
«no está configurada», que es lo que saldría si faltara el binding `SHARES` o `FIREBASE_PROJECT_ID`. Es decir:
el bloque `[env.preview]` del `wrangler.toml` **valida en un despliegue de verdad**, con su namespace de vista
previa, que era la incógnita que quedaba de la configuración.

Producción (`mygamelist.pages.dev`) sigue en la versión anterior: su `og:image` todavía apunta al SVG.

**Lo que se puede probar ya en la vista previa, sin tocar producción:** publicar un enlace con una cuenta real
de principio a fin, la pantalla de gestión en Cuenta, la moderación en `/admin` y la página pública `/r/:token`.
Los datos van al KV de vista previa, así que nada de esto ensucia el de producción.

## 12. Confirmaciones

1. **Dominio: `mygamelist.pages.dev`** ✅ — confirmado y en producción (responde 200 y sirve el
   `X-Robots-Tag: noindex, nofollow`). Los enlaces serán `https://mygamelist.pages.dev/r/{token}`.
   *Consecuencia asumida:* un enlace compartido es inmutable. Si algún día la app se muda a un dominio propio,
   los `/r/…` ya pegados en un chat seguirán apuntando aquí y solo vivirán mientras `pages.dev` responda. Si esa
   mudanza llega, hay que dejar una redirección permanente de `/r/*`, no retirar el dominio sin más.
2. **Namespace de KV** ✅ — creados `mygamelist-shares` (producción) y `mygamelist-shares-preview`, y declarados
   en `wrangler.toml` con el binding `SHARES`. En **desarrollo local se usa el de vista previa** a propósito: una
   prueba nunca debe escribir en los datos que están sirviendo enlaces reales.

   Dos cosas que costaron un rato y conviene no volver a descubrir:

   - **En Pages no existe `preview_id`** (eso es de Workers). Hay dos entornos, `preview` y `production`, y cada
     uno declara su propio binding.
   - **`vars` y `kv_namespaces` son claves NO HEREDABLES.** En cuanto se declara una para un entorno, *todas* las
     no heredables deben declararse en ese entorno. Por eso `GITHUB_CLIENT_ID` aparece repetido en los tres
     bloques: si se dejara solo arriba, funcionaría en local y **el despliegue fallaría al validar**. Está
     avisado en el propio `wrangler.toml` para que nadie lo "limpie".

   **El panel ya no manda.** Con `pages_build_output_dir` presente, los bindings configurados en
   *Settings → Bindings* no se aplican: todo tiene que estar en el fichero.

   *Validado* con `npx wrangler pages functions build` (compila sin avisos). La configuración de
   `[env.production]` solo se valida de verdad en el primer despliegue: `pages deploy` no tiene `--dry-run`.

3. **Bot Fight Mode** ✅ — **no aplica**, y conviene saber por qué antes de volver a preocuparse: ese ajuste se
   configura por ZONA (un dominio propio añadido a Cloudflare), y `mygamelist.pages.dev` no es una zona del
   proyecto, así que el interruptor ni existe aquí. Comprobado además contra el dominio real: `Twitterbot`,
   `facebookexternalhit`, `WhatsApp` y `Discordbot` reciben **200**.

   *Vuelve a ser relevante el día que se ponga dominio propio*, porque al añadirlo como zona puede venir
   activado. La comprobación es una línea:

   ```sh
   curl -s -o /dev/null -w "%{http_code}\n" -A "Twitterbot/1.0" https://TU-DOMINIO/r/algun-token
   ```

   200 = bien; 403 o 503 = el borde está bloqueando al agente y la tarjeta saldrá vacía.
4. **App Check** — no bloquea el diseño (§3); saber si la exigencia está activada solo sirve para interpretar
   los errores en desarrollo.
5. **Wrangler no está en las dependencias** del proyecto: hoy se invoca con `npx wrangler` (4.123.0 al escribir
   esto). Si el paso 3 acaba usándolo a diario, conviene fijarlo como `devDependency` para que todos usen la
   misma versión.
