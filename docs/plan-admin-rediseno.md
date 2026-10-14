# Rediseño del panel de administración

Estado: **F1–F7 publicadas en la 1.7.4** (`5e7f8f36`; revisado el 14-10-2026). F8 (denuncias) pendiente de decisión.
Reglas desplegadas y secretos de Capacidad subidos a producción el 14-10-2026.

Ver el panel sin sesión: `docs/maquetas/admin.html` en el servidor de desarrollo. Monta las pantallas REALES con un
contexto de mentira (censo de 42 personas, fotos diarias, enlaces, medidores, registro) y deja cambiar tema y modo.

El panel era una sola ruta (`/admin`) con el censo de entrada, un menú de tres botones encima y cada usuario como
una ficha grande. Ahora es un panel con secciones, rutas reales y los datos que hacen falta para decidir, sin
cambiar lo que ya hace cada acción de moderación (mismas funciones, mismas confirmaciones, mismos textos).

## Decisiones (con el usuario, 14-10-2026)

- **Denuncias: después.** Cambian producto y privacidad (botón en el feed, colección nueva, párrafo en la política
  y `LEGAL_VERSION`). Quedan como F8 y no salen en el menú hasta entonces.
- **Capacidad: entera.** `/api/admin/health` lee el consumo real de Cloudflare (GraphQL de analíticas). Mientras
  falten las credenciales, cada medidor dice «Sin conectar» y qué falta.
- **Firestore, fuera (14-10-2026).** Se midió con Cloud Monitoring y en producción respondió «requires billing to be
  enabled»: su API exige facturación activa, y el proyecto sigue en Spark. No hay otra vía pública (la pestaña
  «Uso» de la consola tira de una API interna, y la de *usage insights* es de la edición Enterprise, también de
  pago). Se quitaron los tres medidores; si algún día se pasa a Blaze, el lector está en el historial
  (`functions/_lib/gcpMonitoring.ts`).
- **Rangos:** el panel sí los nombra (es solo del administrador). El público de las notificaciones es «con / sin
  espacio social», nunca por rango.
- **Sin subtítulos:** cada pantalla lleva solo su título. La de notificaciones perdió el suyo.
- **«Notificaciones»** sigue siendo el nombre de la pantalla del aviso (como ya lo era), también en el menú.

## Qué hay

| Fase | Qué | Dónde |
|------|-----|-------|
| F1 | Rutas `/admin/*` (una sola guarda en `AdminHub`), menú lateral (tira en móvil), buscador ⌘K propio | `core/admin/adminRoutes.ts`, `admin/AdminNav.tsx`, `admin/AdminSearch.tsx` |
| F2 | Usuarios: tabla ordenable (tarjetas en móvil), filtros en la URL, selección y lote (rango, suspender), ficha en `/admin/usuarios/:id` | `core/admin/userFilters.ts`, `viewmodel/useAdminUserTable.ts`, `admin/AdminUsersScreen.tsx`, `admin/AdminUserDetail.tsx` |
| F3 | Hoy: bandeja «Necesita atención», cifras en tres grupos, rangos, notificaciones y retos, pendientes, últimas acciones | `core/admin/attention.ts`, `admin/AdminTodayScreen.tsx`, `viewmodel/useAdminInsights.ts` |
| F4 | Comunidad: activos por día (foto diaria), altas por semana, amigos por persona, siguen activos por mes de alta | `core/admin/communityStats.ts`, `admin/AdminCommunityScreen.tsx` |
| F5 | Capacidad: medidores frente a los techos del plan gratuito, con proyección al final del día y el valor de ayer | `functions/api/admin/health.ts`, `functions/_lib/cloudflareAnalytics.ts`, `admin/AdminCapacityScreen.tsx` |
| F6 | Registro de acciones con «Deshacer» (rango y social); aviso de cada acción abajo a la izquierda; borrar un perfil exige escribir su nombre | `viewmodel/useAdminLog.ts`, `admin/AdminLogScreen.tsx`, `admin/AdminToastView.tsx`, `admin/AdminConfirmDialog.tsx` |
| F7 | Notificaciones programadas (desde/hasta, público) e historial reutilizable | `core/announcement/announcement.ts`, `functions/api/announcement.ts`, `AdminAnnouncement.tsx` |
| F8 | Denuncias | pendiente |

### Datos nuevos en Firestore

Todo solo del administrador (`allow read, write, delete: if isAdmin()`), con prueba en
`tests/integration/firestore.rules.test.ts`:

- `adminPanel/todos` — pendientes con fecha.
- `adminPanel/stats/days/{AAAA-MM-DD}` — la foto diaria del censo. Se escribe la primera vez que se abre el panel
  cada día, nada más.
- `adminLog/{id}` — una entrada por acción: qué, sobre quién (uid y el nombre que se le veía), cuándo y, si es
  reversible, el valor de antes.

Ninguno contiene datos que el panel no viera ya. Si las reglas no están desplegadas, el panel funciona igual: la
foto, los pendientes y el registro fallan en silencio (se avisa por consola) y las acciones salen.

En KV, la clave nueva `announcement:history` (las 20 notificaciones anteriores). Se escribe solo al publicar una
campaña nueva.

### Lo que el censo puede y no puede decir

- **Activos por día** solo existe desde que se toma la foto diaria: `updatedAt` es la última actividad, no un
  historial. La gráfica arranca vacía y se llena día a día (y solo los días en que se abre el panel). Cuenta los
  activos en las 24 horas anteriores a la foto.
- **Altas por semana** sí es retroactivo (`createdAt`, o la amistad más antigua para los perfiles viejos).
- **Retención**: con una sola marca de actividad no hay curvas por semana. Lo que se pinta es «de los que se dieron
  de alta en ese mes, cuántos han estado activos en los últimos 30 días».
- **No se enseñan los logros de cada persona.** Los espejos del censo van sin dueño a propósito (ver
  `AdminCensus.mirrors`), y la ficha no los cuenta.

## Credenciales de Capacidad

**Hecho el 14-10-2026** en el entorno de producción de Pages: `CF_ACCOUNT_ID` y `CF_ANALYTICS_TOKEN`. La lectura
de Cloudflare se comprobó en local con el token real. (`GCP_MONITORING_SA` también se subió y se borró el mismo día al
retirar Firestore: ver «Firestore, fuera» arriba.) Los pasos quedan aquí por si hay que rehacerlos (cambiar la clave, otra cuenta).

Sin ellas, Capacidad enseña las carátulas (como antes) y los demás medidores salen «Sin conectar». Con ellas, el
panel compara cada cifra con su techo diario y avisa en Hoy al pasar del 70 %. En `npm run dev` el endpoint no
existe (lo sirve Pages) y la pantalla lo dice.

### Cloudflare (operaciones de KV y peticiones a Functions)

1. **Panel de Cloudflare → Mi perfil → Tokens de API → Crear token → Token personalizado.** Permiso:
   **Cuenta → Account Analytics → Leer**. Recursos de la cuenta: la tuya. Sin más permisos.
2. Subirlo: `npx wrangler pages secret put CF_ANALYTICS_TOKEN --project-name mygamelist`.
3. El id de la cuenta (en el panel, columna derecha de «Workers y Pages»):
   `npx wrangler pages secret put CF_ACCOUNT_ID --project-name mygamelist`. No es secreto, pero así no hay que
   repetirlo en los tres bloques de `wrangler.toml`.

Los cupos de Workers y KV se reinician a las 00:00 UTC. Son de la cuenta entera.

Los secretos se aplican en el siguiente despliegue. Para la vista previa, repetir los comandos con
`--env preview` si se quiere ver ahí también.

## Para desplegar

- Reglas: **desplegadas el 14-10-2026** (`npx firebase deploy --only firestore:rules --project mylists-f7313`;
  añaden `adminPanel` y `adminLog` y no cambian nada de lo que ya existía). Las consultas nuevas usan índices de un
  solo campo, que Firestore crea solo.
- El registro de acciones empieza vacío: el panel no apuntaba nada antes de este cambio.
- El resto va con el cliente (release del usuario).
