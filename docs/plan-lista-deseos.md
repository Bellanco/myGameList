# Plan: la lista de deseos

Estado: implementado en `develop`, pendiente de desplegar (05-10-2026). Documento vivo: si una línea no coincide
con el código, manda el código.

## Qué es

Una quinta lista, **Deseos** (`d`, ruta `/deseados`, la pestaña más a la derecha), para los juegos que se
quieren y todavía no se tienen.

| Lista    | Significa                       |
| -------- | ------------------------------- |
| Próximos | Lo tengo y lo jugaré.           |
| Deseos   | Lo quiero, pero no lo tengo.    |

## Decisiones

- **Mismos campos que Próximos**, nota de interés incluida.
- **Un solo movimiento: Deseos → Próximos**, además de borrar. Ninguna lista lleva juegos a Deseos.
- **Alta solo a mano.** La bandeja de Playnite no clasifica en Deseos: lo que llega de Playnite ya lo tienes. Si
  un juego importado está en Deseos, la bandeja ofrece pasarlo a Próximos.
- **Ruleta del perfil de un amigo:** si el juego no lo tienes, el botón es «Añadir a deseados».
- **No es la biblioteca.** Queda fuera de reseñas, estadísticas, logros, premios y de tu propia ruleta.
  Estadísticas propias de Deseos: fuera por ahora.
- **Ocultarla en Ajustes:** interruptor sincronizado (`publicConfig`), encendido por defecto. Apagado, la pestaña
  desaparece y `/deseados` lleva a Próximos; los juegos se conservan y siguen sincronizándose. Ocultarla en tu
  navegación **no** la oculta en social: eso lo decide la casilla del perfil.
- **Social:** casilla para ocultarla, como las demás listas, y visible por defecto. En el feed:
  - al añadir: «Ada añadió *Hollow Knight* a su lista de deseos»;
  - al pasarla a Próximos: «Ada añadió *Hollow Knight* a su biblioteca».

  El alta en Deseos SÍ publica, al contrario que el resto de altas (ver `moveActivity`).
- **Filtro del feed:** casilla propia. Los valores guardados antes de la lista la reciben encendida (marca `~`,
  ver `core/social/moveTabsFilter`).

## Despliegue: todo junto

Se planteó desplegar la fase 0 sola y dejarla asentar, y se descartó el 05-10-2026 tras medir el riesgo real.

**El riesgo.** Un cliente anterior a la lista descarta la clave `d` al leer el gist (`migrateData`,
`normalizeData`, `unwrapGamesFile`) y en la siguiente subida lo reescribe sin esos juegos. Pasa si un aparato
con la versión nueva apunta deseos y otro, abierto por primera vez tras el despliegue, sincroniza con la versión
que tenía en caché antes de actualizarse. No hay forma de exigir una versión mínima.

**Por qué es tolerable.** Todos los ciclos de sincronización FUSIONAN juego a juego (`mergeCrdt`); ninguno
sustituye lo local por lo remoto, salvo la sobrescritura manual. Y el cliente viejo no deja lápidas, solo omite
los juegos. Así que el aparato que los apuntó los sigue teniendo y los vuelve a subir en su siguiente ciclo, y el
otro los recibe en cuanto se actualiza. Solo se perderían si ese aparato perdiera sus datos locales en el
intervalo. Si el envoltorio del gist solo tuviera deseos, el cliente viejo no podría leerlo: su sincronización
da error hasta actualizarse, sin perder nada.

**A quién no afecta.** A quien usa un solo aparato (al abrirlo por primera vez tras el despliegue aún no tiene
deseos) ni a las amistades con la versión vieja, que ignoran la lista y sus mensajes sin romper nada.

**Para dejarlo en cero:** abrir cada aparato una vez tras desplegar, antes de apuntar ningún deseo.

**Reglas de Firestore:** desplegadas el 05-10-2026 (`showWishlist` y `feedMoveTabs` ≤ 5), así que la versión
nueva no tiene orden que respetar por ese lado.

## Fases

- [x] **0. Datos y compatibilidad.** `TAB_IDS`, tipos, normalización, fusión, IndexedDB, envoltorio del gist,
  esquemas (juegos y social), regla de `feedMoveTabs` (≤ 5), exclusiones (reseñas, premios, ruleta, estadísticas,
  etiquetas), exportar e importar JSON y la marca del filtro del feed.
- [x] **1. La lista.** Textos, ruta, icono, pestaña, formulario y tabla como Próximos, `d → p`, bandeja de
  Playnite, ruleta del amigo, estilos de los temas y el tour.
- [x] **2. El interruptor de Ajustes.** En Ajustes → Diseño (`wishlistPreference`, campo `showWishlist`). Sus reglas (`showWishlist`) ya están desplegadas (05-10-2026).
- [x] **3. Social.** Casilla de ocultar, pestaña en el perfil de un amigo, mensajes del feed, filtro del feed y
  texto de privacidad. `LEGAL_VERSION` no sube: un aviso de entrada en una lista ya se aceptó el 2026-08-22 (ver
  el comentario en `legalContent`).
