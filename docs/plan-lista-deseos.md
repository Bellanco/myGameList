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

## Por qué hay una fase 0 que se despliega sola

Un cliente anterior a la lista descarta la clave `d` al leer el gist (`migrateData`, `normalizeData`,
`unwrapGamesFile`) y en la siguiente subida lo reescribe sin esos juegos. Si el envoltorio solo tuviera
deseos, ni siquiera podría leerlo. No hay forma de exigir una versión mínima, así que:

1. **Fase 0** — la versión que lee y conserva `d` sin enseñarla (`TAB_ORDER` la deja fuera). **Desplegar sola
   y dejar que se asiente** antes de publicar las demás.
2. **Fases 1–3** — la lista visible, el interruptor y lo social. Se despliegan juntas.

## Fases

- [x] **0. Datos y compatibilidad.** `TAB_IDS`, tipos, normalización, fusión, IndexedDB, envoltorio del gist,
  esquemas (juegos y social), regla de `feedMoveTabs` (≤ 5), exclusiones (reseñas, premios, ruleta, estadísticas,
  etiquetas), exportar e importar JSON y la marca del filtro del feed.
- [x] **1. La lista.** Textos, ruta, icono, pestaña, formulario y tabla como Próximos, `d → p`, bandeja de
  Playnite, ruleta del amigo, estilos de los temas y el tour.
- [x] **2. El interruptor de Ajustes.** En Ajustes → Diseño (`wishlistPreference`, campo `showWishlist`). Las reglas con `showWishlist` deben desplegarse antes que esta versión.
- [x] **3. Social.** Casilla de ocultar, pestaña en el perfil de un amigo, mensajes del feed, filtro del feed y
  texto de privacidad. `LEGAL_VERSION` no sube: un aviso de entrada en una lista ya se aceptó el 2026-08-22 (ver
  el comentario en `legalContent`).
