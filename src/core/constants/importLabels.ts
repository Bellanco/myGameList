// Textos de la importación: las guías de Playnite (Ajustes › Datos) y la bandeja de importados.
//
// Aparte de `labels.ts` por peso: eran ~1,3 kB comprimidos que viajaban en el arranque y solo los pintan pantallas
// perezosas (`SettingsHub`, `InboxScreen` y sus piezas). En `labels.ts` se queda lo que SÍ dice el arranque
// (`UI_MESSAGES.import`): los avisos que lanza `App` al importar y el botón «Importar de Playnite» de la lista
// vacía de `GameTable`.
import type { ImportField } from '../../model/types/import';

export const IMPORT_UI = {
  back: 'Volver',
  integrations: {
    title: 'Integraciones',
    /* CINCO FRASES SEGUIDAS ERAN UN MURO. Decían cosas distintas —qué hace, qué necesitas, de dónde trae,
       qué pasa con los duplicados— y había que leerlas enteras para saber si esto te servía. Ahora la
       primera va sola arriba y el resto se reparte en lo que cada cosa es: una condición, una lista de
       tiendas que se lee de un vistazo y una nota al pie. */
    /* TRES FRASES Y SE ACABÓ. Aquí se viene a traer la biblioteca, no a estudiar cómo funciona: basta con
       saber qué hace, de dónde lo saca y qué hace falta para ello. Lo demás —los pasos, el detalle de las
       consolas, qué pasa con un juego repetido— está en las dos guías de abajo, que es donde se busca cuando
       de verdad hace falta. Las tiendas van dentro de la frase y no en fichas sueltas: son siete nombres, se
       leen igual de rápido y no fingen ser botones. */
    note: 'Trae de una vez los juegos que ya tienes en tus tiendas. Llegan a la bandeja y ahí eliges cuáles te quedas.',
    sources: 'Funciona con Steam, GOG, Epic, EA, Ubisoft, Amazon y Battle.net, y también con PlayStation y Xbox si les instalas su complemento en Playnite.',
    requires: 'Necesitas Playnite (solo Windows) y su extensión gratuita «Playnite Library Exporter».',
    stepsTitle: 'Cómo traer tu biblioteca, paso a paso',
    /* UN PASO, UNA COSA. Estas instrucciones las sigue alguien con Playnite abierta en la otra pantalla, y
       cada paréntesis, cada «cuando termine» y cada frase con dos acciones dentro obliga a releer para saber
       qué toca hacer ahora. Se cuentan como se dictan en voz alta: haz esto, ahora esto. */
    /* La invitación a descargar Playnite va SUELTA y no dentro del primer paso: solo se enseña en un
       navegador de Windows, que es el único sitio donde se puede instalar (ver `isWindows`). En el resto
       —el móvil incluido— el paso se queda en «abre Playnite» y nadie persigue un programa que no existe
       para su sistema. */
    downloadHint: 'Si no la tienes, descárgala en',
    downloadLabel: 'playnite.link',
    downloadUrl: 'https://playnite.link',
    steps: [
      'Abre Playnite en tu PC con Windows.',
      'Arriba a la izquierda, entra en «Complementos» → «Explorar complementos» y abre la pestaña «Genérica».',
      'Busca «Playnite Library Exporter» y pulsa «Instalar».',
      'Cierra Playnite y vuelve a abrirla.',
      'Entra otra vez en «Complementos» → «Playnite Library Exporter» → «Export» y confirma. Deja el formato JSON, que es el que viene puesto.',
      'Se guardará un archivo «.json». Vuelve aquí, pulsa «Importar de Playnite» y elígelo.',
      'Tus juegos aparecerán en la bandeja de importados, donde eliges cuáles te quedas.',
    ],
    consoles: {
      psn: {
        title: 'Añadir tus juegos de PlayStation',
        steps: [
          'Abre Playnite en tu PC con Windows.',
          'Arriba a la izquierda, entra en «Complementos» → «Explorar complementos» y abre la pestaña «Bibliotecas».',
          'Busca «PlayStation library integration», de Xenor, y pulsa «Instalar».',
          'Cierra Playnite y vuelve a abrirla.',
          'Entra en «Complementos» → ajustes de «PlayStation library integration» e inicia sesión con tu cuenta de PlayStation.',
          'Tus juegos de PlayStation ya están en Playnite. Ahora tráelos aquí con los pasos de la otra guía.',
        ],
      },
    },
  },
  inbox: {
    title: 'Bandeja de importados',
    note: 'Estos juegos se guardan en este equipo y caducan a los 30 días si no los clasificas.',
    sectionNew: 'Nuevos',
    sectionExisting: 'Ya en tus listas',
    empty: 'No hay juegos en la bandeja. Impórtalos desde Ajustes.',
    goSettings: 'Ir a Ajustes',
    classifyTo: 'Clasificar en',
    discard: 'Descartar',
    clear: 'Vaciar bandeja',
    existingBadge: 'Ya en tus listas',
    suggested: 'sugerida',
    origin: 'Origen',
    game: 'Nombre',
    search: 'Buscar por nombre',
    enrich: 'Actualizar en tus listas',
    enrichHint: 'Ya lo tienes: añade género/plataforma/horas que falten al juego de tu lista.',
    promote: 'Pasar a próximos',
    promoteHint: 'Lo tenías en deseados y ya es tuyo: pásalo a próximos con lo que falte del importado.',
    showing: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
    copyNameAria: (name: string) => `Copiar «${name}»`,
    copyNameSuccess: (name: string) => `«${name}» copiado`,
    copyNameError: 'No se pudo copiar el nombre',
    fields: {
      title: 'Qué datos traer',
      note: 'Se aplica a TODOS los juegos de la bandeja. El nombre siempre se traslada; lo que desmarques aquí no se copiará (podrás rellenarlo a mano en el formulario).',
      toggleShow: 'Ver qué datos traer',
      toggleHide: 'Ocultar qué datos traer',
      newGames: 'Al clasificar un juego nuevo',
      existingGames: 'Al actualizar uno que ya tienes',
      existingHint: 'Las plataformas y los géneros se SUMAN a los que ya tenga el juego (no se quita nada); las horas y la nota solo se rellenan si las tienes vacías.',
      labels: {
        platforms: 'Plataformas',
        genres: 'Géneros',
        hours: 'Horas',
        grade: 'Nota',
      } satisfies Record<ImportField, string>,
      fieldAria: (field: string, group: string) => `${field} — ${group}`,
      summary: (fields: string) => (fields ? `Se traen: ${fields}.` : 'No se trae ningún dato extra.'),
    },
  },
} as const;
