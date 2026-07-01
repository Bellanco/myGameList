# Plan FUTURO — almacenamiento híbrido: Google Drive (biblioteca) + Firestore (social)

> Plan **diferido**: no se ejecuta ahora. Complementa a [`FUTURE-STORAGE-BACKEND-PLAN.md`](./FUTURE-STORAGE-BACKEND-PLAN.md). Define una tercera vía que conserva el **modelo distribuido y de coste cero** de Gist (el dato vive en la cuenta de cada usuario) pero **elimina el token PAT de GitHub** reusando el Google Auth ya integrado, y esquiva el problema de **egress/lecturas** que tensaba a Firestore-solo en el tramo alto de usuarios.
>
> Stack actual: local-first + merge CRDT determinista, Gist (juegos privados + social público), **Firestore ya integrado** (`profiles`, `privateConfig`, `userMap`, `friendships`), **Google Auth** cableado, hosting en **Cloudflare Pages**.

---

## TL;DR

- **La idea:** partir el dato según su naturaleza. **Biblioteca privada de juegos → Google Drive de cada usuario** (carpeta oculta `appDataFolder`); **capa social/feed → Firestore**. Auth **solo Google** → el PAT de GitHub desaparece.
- **Por qué gana a las otras dos opciones a escala de decenas–bajos cientos de usuarios:**
  - Frente a **Gist**: fuera el PAT (onboarding de un clic) y fuera el muro de ~950 KB / chunking / multi-gist.
  - Frente a **Firestore-solo**: la biblioteca (el dato pesado) no pasa por tu cubo gratuito → **desaparece el cuello de egress/lecturas** que aparecía a 150–200 usuarios muy sociales.
- **Coste distribuido, $0 para el dev:** cada usuario usa su propia cuota de Drive (15 GB gratis) para SUS juegos, igual que hoy usa su GitHub. No hay cubo global que pagues/gestiones para el dato voluminoso.
- **Sin CASA ni verificación pesada:** los scopes `drive.appdata` y `drive.file` son **no sensibles/recomendados** (no restringidos) → no disparan el CASA anual de pago, ni el muro de "app no verificada", ni el tope de 100 usuarios.
- **Lo que Drive NO resuelve** (y por eso es híbrido): el **feed social muchos-a-muchos**. `appDataFolder` es privado por usuario y compartir ficheros de Drive uno a uno es torpe. Eso vive mejor en Firestore (dato pequeño, tiempo real, N+1 denormalizable).
- **El merge CRDT se mantiene** sea cual sea el backend: es lo que da convergencia multi-dispositivo.

---

## Cuándo actuar — señales de disparo

No migrar "porque sí". Ejecutar cuando se cumpla **alguna**:

1. **Fricción del PAT:** el token de GitHub frena a usuarios reales en "conectar GitHub". → Drive+Google elimina el PAT.
2. **Rozar límites de Gist:** quejas de tamaño/latencia, o bibliotecas que empujan a Fase B (gists de overflow).
3. **Rechazo a centralizar el dato:** se quiere seguir dando **propiedad/portabilidad** al usuario (que su dato viva en su cuenta), lo que descarta Firestore-solo como almacén de la biblioteca.
4. **Coste/egress de Firestore:** si al crecer el free tier de Firestore se queda corto por el peso de la biblioteca (ver números en `FUTURE-STORAGE-BACKEND-PLAN.md`).

Si nada aprieta, **quedarse en Gist** (ya escala con Fase A/B, coste cero) sigue siendo la opción de menor esfuerzo.

---

## Arquitectura objetivo

```
Auth: SOLO Google (ya integrado) — el PAT de GitHub desaparece por completo

Biblioteca privada de juegos ──▶ Google Drive del usuario (appDataFolder)
   • distribuido, $0, 15 GB/usuario, scope NO sensible (sin CASA), dato del usuario
   • resuelve el problema de EGRESS que descartaba Firestore para la librería
   • chunking casi innecesario (15 GB >> biblioteca de un usuario)

Capa social / feed ──▶ Firestore
   • datos pequeños (activity ≤320, posts ≤100) → free tier de sobra
   • tiempo real (onSnapshot) + feed N+1 resoluble por denormalización
   • Drive es malo compartiendo muchos-a-muchos; Firestore es bueno

Metadatos ──▶ Firestore (ya): profiles / friendships / userMap
   • privateConfig deja de guardar el token PAT (ya no existe)

Merge CRDT ──▶ se mantiene en cliente, igual que hoy
```

### Por qué el reparto esquiva las dos pegas a la vez
- Saca la **biblioteca pesada** de Firestore → adiós al cuello de **egress/lecturas**.
- Saca lo **social/compartido** de Drive → adiós al problema de **sharing muchos-a-muchos**.

---

## Detalle técnico

### Scopes de Drive (verificado, 2026)
- **`drive.appdata`** (carpeta oculta `appDataFolder`): "ver y gestionar los datos de configuración de la propia app". **No sensible/recomendado.**
- **`drive.file`** (solo ficheros creados/abiertos por la app): **No sensible/recomendado.** Úsalo si quieres que el fichero sea **visible** para el usuario en su Drive (a cambio de que pueda moverlo/borrarlo).
- Ninguno de los dos es restringido → **sin CASA, sin verificación pesada, sin tope de 100 usuarios**. (Los restringidos son `drive`, `drive.readonly`, `drive.metadata*`, etc.)
- **Recomendado:** `appDataFolder` para la biblioteca (oculto, no gestionable por error por el usuario). Alternativa `drive.file` si se prioriza visibilidad/portabilidad explícita.

### Modelo de datos en Drive
- Un fichero JSON por usuario en `appDataFolder` (misma codificación magra que el gist de juegos: `EncodedGameItem`, dicts deduplicados, `deletedIndex`, `syncMeta` Lamport).
- Chunking: reaprovechable (`distributeIntoChunks`) pero **casi innecesario** — 15 GB por usuario; se trocea solo por rendimiento de lectura/escritura, no por tope.
- Integridad: mantener el checksum actual.

### Sync (biblioteca)
- **Sin push en cliente desde Drive:** sincronizar por **sondeo del feed de cambios** (`changes.list` con `pageToken`/`startPageToken`) → solo trae **deltas**, más barato que releer. Sustituye al polling de gist con ventaja.
- El **tiempo real** de verdad se obtiene en la capa social vía Firestore `onSnapshot` (que es donde importa la inmediatez).
- El merge CRDT resuelve escrituras concurrentes entre dispositivos, igual que hoy.

### Auth
- Añadir el scope `drive.appdata` al login de Google **existente** (incremental; misma sesión). Se elimina el token PAT y toda su gestión/cifrado/recuperación en `gistConfigRepository`/`privateConfig`.

### Reglas Firestore (capa social)
- Reutilizar el patrón actual (`hasOnly` allowlist + `isOwner` + deny-all) para el feed/actividad. Ya existe el andamiaje para `profiles`/`friendships`.

---

## Estrategia de migración (sin romper — patrón A/B, gated)

1. **Repositorio Drive (lectura) OFF de escritura:** `driveGamesRepository` con la **misma interfaz** que `gistRepository`; lee `appDataFolder`; flag de escritura en `false`. La app sigue leyendo/escribiendo Gist. Tests de round-trip (encode → Drive → decode).
2. **Dual-write puente (opcional):** durante una ventana, escribir biblioteca en **Gist + Drive** para sembrar Drive sin perder Gist como respaldo.
3. **Cutover biblioteca por flag:** conmutar la fuente de verdad de la biblioteca a Drive (flag, estilo `ENABLE_GAMES_WRAPPER_WRITE`).
4. **Social a Firestore:** mover activity/posts del gist social a colecciones Firestore con feed **denormalizado** (matar el N+1); `onSnapshot`.
5. **Retirar el PAT:** cuando ni biblioteca ni social dependan de GitHub, eliminar el token PAT, su cifrado y el camino Gist. Dejar un **"exportar a Gist/JSON"** para portabilidad.
6. **Limpieza:** retirar `gistRepository`, `gistConfigRepository` y tipos asociados (respetando el *staging* de migración).

---

## Comportamiento a escala (perfil de referencia: 50–200 usuarios, ~800 juegos, ~35 amigos, 6–10 aperturas/día)

- **Biblioteca en Drive:** **sin cuello de cuota global** (modelo distribuido por-usuario, como Gist). QPM por proyecto (~12k/min) sobra para 200 usuarios. Coste dev $0.
- **Social en Firestore:** dato pequeño (cientos de entradas por usuario) → el free tier (50K lecturas/día, 20K escrituras/día, 10 GB egress/mes) lo traga con holgura **porque ya no carga la biblioteca**. El feed denormalizado evita el N+1.
- **Resultado:** para tu tramo, es la única de las tres arquitecturas **sin punto de tensión** de cuota: Gist tensa por PAT/tamaño; Firestore-solo tensaba por egress de la biblioteca; el híbrido reparte y ninguno de los dos lados aprieta.

---

## Riesgos / no-hacer

- **No** intentar el feed social sobre Drive: compartir ficheros muchos-a-muchos es torpe y no escala. El social va en Firestore.
- **No** usar scopes restringidos de Drive (`drive`, `drive.readonly`…) → dispararían **CASA + verificación anual de pago**. Ceñirse a `drive.appdata`/`drive.file`.
- **Dato oculto:** `appDataFolder` no es visible para el usuario (sí borrable desde "gestionar apps de Drive"). Si la visibilidad/portabilidad es un valor, usar `drive.file` con fichero visible (a cambio de que el usuario pueda moverlo/borrarlo).
- **Sin push de Drive en cliente:** asumir sondeo por feed de cambios; no prometer tiempo real en la biblioteca (sí en lo social vía Firestore).
- **Mantener el merge CRDT** intacto: es lo que da convergencia multi-dispositivo con dos backends distintos.
- **No** ejecutar sin señal de disparo real: Gist ya escala y es de coste/responsabilidad cero.

---

## Comparativa rápida de las tres vías (a 50–200 usuarios)

| Eje | Gist (hoy) | Firestore-solo | **Híbrido Drive+Firestore** |
|-----|-----------|----------------|------------------------------|
| Coste para el dev | $0 (distribuido) | Free tier tenso arriba; Blaso si crece | **$0 en la biblioteca (distribuido); social nimio en free** |
| Onboarding | 🔴 PAT GitHub | 🟢 Google | 🟢 **Google (ya integrado)** |
| Muro de tamaño | 🔴 ~950 KB → chunking/multi-gist | 🟡 1 MiB/doc → chunking | 🟢 **15 GB/usuario, chunking casi innecesario** |
| Egress/lecturas (biblioteca) | n/a (distribuido) | 🔴 cuello a 150–200 sociales | 🟢 **fuera del cubo pagado** |
| Feed social | 🟡 N+1 gratis pero lento | 🟢 N+1 denormalizable + tiempo real | 🟢 **igual que Firestore (vive ahí)** |
| Propiedad del dato | 🟢 del usuario | 🔴 centralizado | 🟢 **biblioteca en Drive del usuario** |
| Tiempo real | 🔴 polling 60 s | 🟢 onSnapshot | 🟡 **social en tiempo real; biblioteca por deltas** |
| Esfuerzo | — (actual) | Medio | **Medio-alto (dos repositorios + corte social)** |

---

## Apéndice — clasificación de scopes y verificación (2026)

| Scope Drive | Clasificación | Implicación |
|-------------|---------------|-------------|
| `drive.appdata` (`appDataFolder`) | **No sensible/recomendado** | Sin CASA, sin verificación pesada, sin tope 100 usuarios |
| `drive.file` | **No sensible/recomendado** | Igual; fichero visible/gestionable por el usuario |
| `drive`, `drive.readonly`, `drive.metadata*`, `drive.activity*` | **Restringido** | Requieren verificación + **CASA anual de pago** (cientos–miles $/año) |

Fuentes:
- Choose Google Drive API scopes — `developers.google.com/workspace/drive/api/guides/api-specific-auth`
- OAuth 2.0 Scopes for Google APIs — `developers.google.com/identity/protocols/oauth2/scopes`
- Restricted scope verification — `developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification`
- Sensitive scope verification — `developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification`
- Free tiers de backend y números de escala: ver [`FUTURE-STORAGE-BACKEND-PLAN.md`](./FUTURE-STORAGE-BACKEND-PLAN.md).
