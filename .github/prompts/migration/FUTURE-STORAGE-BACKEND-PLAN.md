# Plan FUTURO — backend de datos en servidor (más allá de GitHub Gist)

> Plan **diferido**: no se ejecuta ahora. Define **cuándo** convendría dejar Gist como almacén principal y **cómo** migrar sin romper a nadie, según cómo crezca la app. Hoy Gist + Fase A/B cubren el caso; esto es para cuando la escala o la fricción lo justifiquen.
>
> Contexto verificado (números de tiers gratuitos, 2026): ver Apéndice. Stack actual: local-first + CRDT, Gist (juegos privados + social público), **Firestore ya integrado** (metadatos: `profiles`, `privateConfig`, `userMap`), **Google Auth** cableado, hosting en **Cloudflare Pages**.

---

## TL;DR

- **Lo bueno se queda:** el núcleo local-first + merge CRDT determinista es **agnóstico del backend**. Migrar = cambiar el repositorio de sync, no la app.
- **Mejor alternativa a Gist para decenas de usuarios y texto: Firestore** — ya está integrado (auth + SDK + reglas), elimina el muro de 950 KB / chunking / multi-gist, y permite sync en tiempo real (`onSnapshot`, sin polling). El doc de 1 MiB se resuelve con pocos "docs-chunk" (mucho más simple que multi-gist).
- **Alternativa con backend propio:** Cloudflare D1 + Worker (mismo hosting, sin pausa, generoso) a cambio de escribir una API + auth.
- **Evitar** Supabase free aquí (se pausa a los 7 días de inactividad + sin backups).
- **Decisión de producto (no técnica):** Gist da **propiedad/portabilidad del dato al usuario**; un backend lo **centraliza** bajo el proyecto del dev. Si esa propiedad es un valor, Gist sigue teniendo sentido.

---

## Cuándo actuar — señales de disparo

No migrar "porque sí". Ejecutar este plan cuando se cumpla **alguna**:

1. **Fricción de onboarding alta:** el token PAT de GitHub frena a usuarios reales (abandono en el paso "conectar GitHub"). → mayor motivo, porque Firestore/Google elimina el PAT.
2. **Escala de datos:** usuarios que de verdad rozan el techo de un gist incluso troceado (Fase B activa y aun así varios gists de overflow por usuario), o quejas de tamaño/latencia de sync.
3. **Necesidad de funciones de servidor:** consultas/agregaciones que el modelo gist-por-usuario no da bien (feed global, ranking, búsqueda cross-user, notificaciones) → hoy el feed social es N+1 por diseño.
4. **Rate-limit de GitHub:** si con más dispositivos/usuarios el polling + escrituras chocan con los límites de la API de gists.
5. **Tiempo real:** se quiere sync instantáneo entre dispositivos en vez del polling de 60 s.

Si nada de esto aprieta, **quedarse en Gist** (ya escala con Fase A/B) es la opción de menor coste y mantiene la propiedad del dato.

---

## Opción recomendada — Firestore como almacén principal

Mismo principio disciplinado que A3/Fase B: **aditivo, gated, sin romper**. Se añade un repositorio Firestore **en paralelo** al de gist y se conmuta por flag.

### Modelo de datos (esquiva el límite de 1 MiB/doc)
- Juegos privados: subcolección `users/{uid}/games/{chunkId}` con **pocos docs-chunk** (mismo reparto por tamaño que ya tenemos en `distributeIntoChunks`), o `users/{uid}/games/{gameId}` por juego si se prefiere granularidad (ojo a cuotas de lecturas).
- Recomendado: **docs-chunk** (p.ej. ≤~800 KB/doc) → reaprovecha el chunking de Fase A; reconstrucción = leer N docs de la subcolección. **Sin** crear gists ni manifiestos: Firestore lista la subcolección nativamente.
- Social público: colección/doc legible por autenticados (las reglas de `profiles` ya contemplan `social.enabled`).
- Metadatos: ya en `privateConfig`/`userMap`/`profiles`.

### Auth
- Pasa a **solo Google** (ya integrado) → **se elimina el token PAT de GitHub** y toda su gestión/cifrado/recuperación. Simplifica onboarding (señal de disparo #1).

### Sync
- `onSnapshot` por dispositivo → **sync en tiempo real**, se retira el polling de 60 s y su backoff. El merge CRDT se mantiene para resolver escrituras concurrentes (Lamport/`_ts` → `_v` → hash, ya implementado).

### Reglas
- Reutilizar el patrón actual (`hasOnly` allowlist + ownership + deny-all). Añadir match para `users/{uid}/games/{chunkId}` (solo el dueño escribe/lee). Validar tamaño/forma como en `profileWriteIsValid`.

### Estrategia de migración (sin romper — patrón A/B)
1. **Lectura primero:** desplegar el `firestoreGamesRepository` con **lectura** activa y un flag de escritura en `false`; la app sigue leyendo/escribiendo Gist.
2. **Dual-write opcional (puente):** durante una ventana, escribir en ambos (Gist + Firestore) para sembrar Firestore sin perder Gist como respaldo.
3. **Cutover por flag:** cuando Firestore tenga los datos y la lectura esté desplegada, conmutar la **fuente de verdad** a Firestore (flag), igual que `ENABLE_GAMES_WRAPPER_WRITE`.
4. **Gist como export/backup:** mantener un "exportar a Gist" para conservar la **portabilidad** del dato (mitiga la pérdida de propiedad).
5. **Retirada:** tras validar en 2 dispositivos, apagar la escritura Gist.

### Límites (free) — caben decenas de usuarios con margen
1 GB almacenamiento · 50K lecturas/día · 20K escrituras/día · 10 GB/mes salida. Un usuario con miles de juegos ≈ cientos de KB; el cuello no es el almacenamiento sino las **lecturas/día** → usar listeners + caché local (ya existe) en vez de releer.

---

## Alternativa — Cloudflare D1 + Worker (backend propio)

Si se prioriza **propiedad del dato sin lock-in de BaaS** y se acepta más código:
- Estáis ya en **Cloudflare Pages** → añadir un **Worker** (API CRUD) + **D1** (SQLite). Free: 5 GB, 5M lecturas/día, Workers 100K req/día, **sin pausa**.
- Auth: verificar en el Worker el **ID-token de Google** (el mismo de Firebase Auth) o usar Cloudflare Access.
- Datos de texto en tablas SQL; el CRDT se aplica igual en cliente.
- Coste: escribir y mantener la API + auth (vs Firestore que lo da hecho).
- **Turso** (libSQL/SQLite edge) es equivalente como alternativa a D1 (sin pausa, muy generoso) si se quiere desacoplar de Cloudflare.

---

## La decisión de producto (resolver antes de ejecutar)

| Eje | Gist (hoy) | Firestore / D1 (futuro) |
|-----|-----------|--------------------------|
| Propiedad del dato | **Del usuario** (su GitHub, portable) | Centralizado bajo el dev |
| Coste/responsabilidad | Cero para el dev | Free a decenas; el dev paga/gestiona si crece |
| Onboarding | Requiere **token PAT** | Solo Google (más simple) |
| Sync | Polling + límites de tamaño | Tiempo real, sin muro de tamaño |
| Funciones de servidor | No (N+1) | Sí (consultas, feed global, ranking) |

Si **propiedad/portabilidad** es un valor de producto → quedarse en Gist (escala con A/B) y, como mucho, ofrecer Firestore como *opt-in*. Si priman **simplicidad + tiempo real + funciones** → Firestore.

---

## Fases (cuando se decida ejecutar)

- **F1 — Decisión:** validar señal de disparo + resolver la cuestión de propiedad del dato.
- **F2 — Repositorio Firestore (lectura):** `firestoreGamesRepository` con modelo docs-chunk + reglas; flag de escritura OFF. Tests de round-trip.
- **F3 — Puente dual-write** (opcional) para sembrar Firestore.
- **F4 — Cutover por flag** a Firestore como fuente de verdad; `onSnapshot`; retirar polling.
- **F5 — Export a Gist** (portabilidad) + apagar escritura Gist tras verificar en 2 dispositivos.
- **F6 — Limpieza:** retirar el camino Gist y la gestión del token PAT (cuando ya nadie dependa de ellos).

---

## Riesgos / no-hacer

- **No** migrar sin señal de disparo real: Gist ya escala (A/B) y es de coste/responsabilidad cero.
- **No** romper la propiedad del dato sin decidirlo a nivel de producto (ofrecer export a Gist mitiga).
- **No** elegir Supabase free para esto: **pausa a los 7 días** + sin backups.
- Vigilar **lecturas/día** de Firestore: usar listeners + caché local, no releer en cada navegación (la app ya cachea).
- Mantener el **merge CRDT** sea cual sea el backend: es lo que da convergencia multi-dispositivo.

---

## Apéndice — tiers gratuitos (2026)

| Backend | Free tier | Pega |
|---------|-----------|------|
| **Firestore** | 1 GB · 50K lecturas/día · 20K escrituras/día · 10 GB/mes | doc máx 1 MiB; dato centralizado |
| **Cloudflare D1** | 5 GB · 5M lecturas/día · Workers 100K req/día · **sin pausa** | requiere Worker API + auth |
| **Turso** | ~9 GB · ~1B lecturas-fila/mes · sin pausa | requiere API + auth |
| **Supabase** | 500 MB · Auth/RLS/realtime · 50K MAU | **pausa a 7 días** + sin backups |
| **Gist (actual)** | ~950 KB/fichero útil, muchos ficheros/gist | complejidad de tamaño/chunking/multi-gist |

Fuentes: Firestore — `firebase.google.com/docs/firestore/quotas`; Cloudflare D1 — `developers.cloudflare.com/d1/platform/pricing` y `/limits`; Workers — `developers.cloudflare.com/workers/platform/pricing`; Supabase — `supabase.com/pricing`.
