# Plan: el social lee a tus amigos, no a los 50 más recientes

> Objetivo: que el coste en Firestore del espacio social dependa de **tus amigos activos**, no de un directorio
> fijo de 50 perfiles que se relee en cada caducidad del feed. Sigue al recuento del 04-10-2026
> (`docs/plan-capacidad-gratuita.md`, «Revisión del 04-10-2026») y a los arreglos A ya hechos (`e3fa8ae3`…`7bbc8a76`).

> ⚠️ **Documento vivo.** Las cifras son estimaciones leyendo el código, no medición en producción. Si una línea no
> coincide con el código, manda el código: corrige esto en la misma pasada.

## Decisiones del usuario (04-10-2026)

1. **El feed lee solo a tus amigos**, y de ellos a los recientes: quien lleva mucho sin usar la app no debe costar.
2. **«Perfiles» (descubrir) enseña 34 usuarios recientes**, y solo se paga al abrir esa pantalla.
3. **A quien no es tu amigo no se le enseña más que lo imprescindible**: nada de rango ni de lo demás que hoy sale
   del directorio.
4. **Ocultar del feed a los amigos inactivos**, con el mismo corte de 30 días con el que avisa el panel.

## De dónde se parte

Hoy `useSocialDirectory` pide `profiles where social.enabled == true orderBy updatedAt desc limit 50` cada vez
que caduca la copia de la consulta (bronce 2 h … mithril 30 min). Son **50 lecturas por ventana y por usuario**,
tenga 3 amigos o 40, y es la partida más grande del usuario intenso (~200–300 de sus ~600–1.000 lecturas al día).

Lo que sale SOLO de esa consulta, y por tanto hay que seguir teniendo para los amigos:

| Dato | Para qué |
|---|---|
| `tier` | sello de rango en «Perfiles» y en la lista de amigos |
| `updatedAt` | corte de 30 días: de un amigo inactivo no se lee el gist |
| `achievements.list` | vitrina y anuncios de logros en el feed; porcentaje comunitario |
| `palmares` | tira de palmarés de la ficha y resumen del año |
| `yearSummary` | tarjeta del resumen del año en el feed |
| **tu propia entrada** | tu actividad en el feed, tus contadores de logros, tu ficha (`me`) |

Los amigos que hoy caen fuera de los 50 se sintetizan desde el documento de amistad y **pierden todo eso**
(salen como bronce, sin vitrina ni resumen del año): es el motivo por el que no basta con bajar el tope.

## Fase 1 — `updatedAt` siempre como fecha · S · ✅ hecha (04-10-2026)

**Problema.** `grantPalmares` y `revokePalmares` escriben `updatedAt` como **número**
(`premios/premiosPalmaresRepository.ts:161,214,224`). Con eso:

- el premiado parece activo aunque no haya abierto la app: es una escritura del administrador, no actividad suya;
- Firestore ordena los números antes que las fechas, así que en el orden descendente esos perfiles caen al final, y
  un filtro `updatedAt >= <fecha>` (Fase 3) los dejaría fuera.

**Cambio.** El palmarés deja de tocar `updatedAt` (las reglas lo permiten: es opcional en `firestore.rules:95`). Los
perfiles que ya lo tengan como número se corrigen solos con su siguiente latido (`touchOwnProfileActivityThrottled`
escribe `serverTimestamp()`).

**Verificación.** `tests/unit/premiosPalmaresRepository.test.ts`: dar y quitar el trofeo no toca `updatedAt`. Las
reglas no cambian: la escritura del administrador no exige el campo.

## Fase 2 — El feed lee a tus amigos por id · M

**Cambio.**

- Nueva lectura `getSocialProfilesByUid(uids)`: un `getDoc` por perfil, con `mapWithConcurrency` (6), sobre tus
  **amigos aceptados + tú**. Se descarta la consulta `documentId() in [...]`: ahorra idas y vueltas, pero no
  lecturas (Firestore cobra igual, una por documento), obliga a trocear de 30 en 30 y su necesidad de índice no se
  puede probar en el emulador. Con `getDoc` no hay índice que desplegar.
- **Copia por uid en IndexedDB**, con la edad del rango de quien mira (`PROFILE_TIER_DIRECTORY_TTL_MS`). Un amigo
  cuyo `updatedAt` pase de 30 días se relee **como mucho una vez al día**: si vuelve, se le ve al día siguiente.
- Un amigo sin perfil legible (`social.enabled` en falso → `permission-denied`) se sintetiza desde la amistad, como
  hoy.
- **Los amigos inactivos (> 30 días) no salen en el feed**: ya no se lee su gist, y ahora tampoco aportan tarjetas.
  Siguen en la lista de amigos y su ficha se abre igual (la hidratación bajo demanda de `useSocialViewModel` ya
  existe). El corte pasa de `admin/adminShared.ts` a `core/constants` para que panel y feed usen **la misma**
  constante (`INACTIVITY_MS`).
- La consulta de 50 desaparece del feed. Tu propia entrada sale de la misma lectura por id.
- Las invalidaciones que hoy tiran «la copia del directorio» (`invalidateSocialDirectoryCache`) pasan a tirar solo la
  copia **de tu propio uid**: tu nick o tu foto se ven al momento sin releer a nadie más.

**Coste.** Por ventana del rango: **amigos activos + 1** lecturas, en vez de 50. Los inactivos, 1 al día cada uno.
Con 10 amigos activos, ~11 en vez de 50.

**Verificación.** `tests/component/socialHubBudget.test.tsx` gana un presupuesto de Firestore: abrir el feed con N
amigos lee N+1 perfiles y **ninguna** consulta de colección; reabrir dentro de la ventana, 0. Tests del repositorio:
copia por uid, edad del inactivo, `permission-denied` → sintetizado, invalidación solo del propio.

## Fase 3 — «Perfiles» carga 34 recientes, solo al abrirla · M

**Cambio.**

- Consulta `profiles where social.enabled == true where updatedAt >= ahora − 30 días orderBy updatedAt desc
  limit 34`. El filtro de rango va sobre el mismo campo que el orden, así que **sirve el índice que ya existe**
  (`social.enabled ASC, updatedAt DESC`): no hay índice nuevo que desplegar. Requiere la Fase 1.
- **Solo se pide al abrir `/social/profiles`** (`activePanel === 'profiles'`) y las dos pantallas del porcentaje
  comunitario de logros. Con su propia copia en IndexedDB y la edad del rango.
- Son **hasta 34**: de esos se quitan tus amigos y tú, así que con muchos amigos activos «Otros» enseña menos. Pedir
  más para rellenar costaría una lectura por cada uno; si se echa de menos, mejor un botón «ver más» que pagar por
  adelantado.
- La ficha de un no-amigo abierta por enlace directo, si no está en la copia: un `getDoc` suelto (1 lectura).
- **El porcentaje comunitario de logros** pasa a calcularse con tus amigos + esos 34, en vez de con los 50 más
  recientes. Es la misma idea (una muestra de gente activa) con otra muestra.

**Coste.** 34 lecturas por ventana del rango, **y solo para quien abre esa pantalla**; hoy se pagan 50 en cada
caducidad del feed, la abra o no.

**Verificación.** Presupuesto: abrir el feed no lanza esta consulta; abrir «Perfiles» la lanza una vez; volver
dentro de la ventana, 0. `npm run test:rules`: la consulta con rango pasa las reglas de `profiles`.

## Fase 4 — A quien no es tu amigo, solo nombre y foto · S

**Cambio.**

- **Tarjeta de «Otros» en «Perfiles»**: nombre, foto y el botón de amistad. Sin rango ni «activo hace…».
- **Ficha de un no-amigo**: igual (hoy ya oculta la vitrina y el palmarés con `canSeeFullProfile`; se quita también
  el rango).
- **Bandeja de solicitudes**: sin el rango de quien te escribe (hoy lo cruza con el directorio,
  `friendshipViews.ts:55-71`). Así la bandeja no necesita leer ningún perfil.
- El rango, la vitrina y el palmarés siguen viéndose **en tus amigos**, que es de donde sale lo que la Fase 2 lee.

**Verificación.** Tests de componente de `SocialProfilesScreen`, la ficha y `SocialRequestsScreen`: un no-amigo no
pinta rango; un amigo sí.

## Fase 5 — Medir y documentar · S

- Rehacer la tabla por usuario de `docs/plan-capacidad-gratuita.md` con el código nuevo.
- Suite completa, `npm run test:rules`, `npm run test:e2e` sobre un `dist` recién construido, y el emulador social
  (`npm run emulate:social`) con más de 34 perfiles y amigos inactivos.
- Comprobar en la vista previa de Cloudflare contra el Firestore real que la consulta de la Fase 3 no pide índice.

## Qué se espera ganar (estimado)

| | Hoy (tras A) | Tras este plan |
|---|---|---|
| Feed, por ventana del rango | 50 lecturas | amigos activos + 1 (~11 con 10 amigos) |
| «Perfiles» | incluido en lo de arriba | 34, solo al abrirla |
| Usuario medio, lecturas/día | ~70–120 | ~40–60 |
| Usuario intenso, lecturas/día | ~450–800 | ~250–400 (lo que queda es sobre todo releer las amistades cada 15 min) |
| Techo por Firestore (mezcla 70/25/5) | ~650 activos/día | **~1.600–1.800** |

**El siguiente techo pasa a ser Cloudflare (Functions y lecturas de KV)**, por las carátulas de las bibliotecas de
los amigos: ~700–750 activos/día con la cuenta pesimista del primer día de un usuario intenso. Antes de tocarlo hay
que medirlo (Fase 0 del plan de capacidad): en régimen normal el service worker y la caché del navegador sirven casi
todas.

## Riesgos

- **El id del documento.** Hoy `profiles/{uid}`, y el código avisa de que tras el *cutover* de identidad podría ser
  el `profileId` (`firebaseSocialRepository.ts:472`). La lectura por id de la Fase 2 tendría que seguir a ese
  cambio; queda anotado en la propia función.
- **Amigos con `social.enabled` en falso.** Se sintetizan como hoy (nombre y foto de la amistad, sin rango): no
  cambia nada para ellos.
- **No se borra nada de `src/model/types/` ni de `src/model/repository/`** al retirar la consulta de 50 del feed:
  `listSocialDirectory` la sigue usando Premios (60, su propia copia), y lo que quede sin uso se consulta antes.

## Checklist

- [x] Fase 1: palmarés sin `updatedAt` (04-10-2026).
- [ ] Fase 2: feed por id, copia por uid, inactivos fuera del feed, presupuesto en `socialHubBudget`.
- [ ] Fase 3: «Perfiles» con 34 y filtro de 30 días, solo al abrirla; porcentaje de logros con la muestra nueva.
- [ ] Fase 4: no-amigos sin rango en «Perfiles», ficha y bandeja.
- [ ] Fase 5: suite, reglas, e2e, emulador con > 34 perfiles; tabla de capacidad rehecha.
