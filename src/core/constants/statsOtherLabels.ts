// La voz de TERCERA persona del panel de estadísticas: «Lo mejor de su biblioteca» donde tu panel dice «Lo mejor
// de tu biblioteca». Solo van los rótulos que CAMBIAN; el resto se hereda de `UI_MESSAGES.stats`, de modo que no
// hay dos juegos de literales que mantener en paralelo y un retoque en el texto propio no deja el ajeno atrás.
//
// Vive en su propio módulo y no en `labels.ts` por el mismo motivo que la hoja de estilos del panel no está en
// `index.scss`: `labels.ts` entra en el arranque, y estos textos solo hacen falta cuando se abre el panel, que
// llega en un chunk perezoso. Media pantalla de rótulos que nadie ha pedido todavía no tiene por qué viajar en el
// primer byte de la app.
//
// Los guiños se conservan uno a uno (el aventurero de Skyrim, la princesa de Mario, el arma de Bloodborne): son la
// voz del panel, y perderlos al hablar de otra persona lo convertiría en otra pantalla.
import { UI_MESSAGES, type StatsLabels } from './labels';

const STATS_OWN = UI_MESSAGES.stats;

export const STATS_LABELS_OTHER: StatsLabels = {
  ...STATS_OWN,
  // De dónde salen sus cifras, en vez del destino de The Witcher: aquí lo que importa es que es SU biblioteca.
  subtitle: STATS_OWN.friend.subtitle,
  empty: {
    title: 'Nada que resumir',
    body: STATS_OWN.friend.empty,
  },
  tiles: {
    ...STATS_OWN.tiles,
    longest: 'Su partida más larga',
  },
  years: {
    ...STATS_OWN.years,
    subtitle: 'Roma no se construyó en un día: cómo ha avanzado año a año.',
    empty: 'No tiene ningún juego marcado como completado.',
    noYearHint: 'Completados a los que no les registró año.',
    peak: (year: number, value: string, metric: string) => `Su récord: ${year} con ${value} ${metric}`,
  },
  grades: {
    ...STATS_OWN.grades,
    subtitle: 'Entre el mal menor y la obra maestra: ahí se reparten sus notas.',
    empty: 'Todavía no ha puntuado ningún juego.',
  },
  genres: {
    ...STATS_OWN.genres,
    empty: 'Sus juegos no tienen géneros anotados.',
  },
  ratio: {
    ...STATS_OWN.ratio,
    subtitle: 'No hagas tratos con el diablo: estos son los contratos que cierra.',
    empty: 'Aún no ha completado ni abandonado ningún juego.',
  },
  top: {
    ...STATS_OWN.top,
    title: 'Lo mejor de su biblioteca',
    subtitle: 'Los que le robaron el corazón: su podio y en qué se parecen.',
    empty: 'Todavía no ha puntuado ningún juego.',
    ranked: 'El resto de su top',
    byGenre: 'Dónde brilla',
    yourAverage: 'su media',
    avgGrade: (count: number) => ` de nota media en sus ${count} mejores`,
    genres: 'Sus mejores géneros',
    platforms: 'Dónde los juega',
  },
  radar: {
    ...STATS_OWN.radar,
    title: 'Sus géneros',
    subtitle: 'Elige tu arma: no gana el género que más juega, sino el que más juegazos le ha dado.',
    subtitleYear: (year: number) => `Elige tu arma: los géneros que mejor le trataron en ${year}.`,
    empty: 'Sus juegos no tienen géneros anotados.',
  },
  backlog: {
    ...STATS_OWN.backlog,
    // En un perfil ajeno la curva es SIEMPRE la derivada: el histórico mes a mes se registra en tu aparato y no
    // viaja con nadie, así que la versión "real" de este texto no puede darse aquí.
    derivedSubtitle: 'Despierta, samurái: así ha ido creciendo lo que hoy tiene en cada lista.',
    empty: 'Todavía no hay meses que representar.',
  },
  shame: {
    ...STATS_OWN.shame,
    subtitle: 'Antes eras un aventurero como él: qué deja a medias, por qué y cuánto le ha costado.',
    empty: 'Ni una flecha en la rodilla: no ha abandonado ningún juego. Por ahora.',
    noReasons: 'No ha anotado razones de abandono.',
    genres: 'Géneros que más abandona',
    rate: 'Terminados frente a abandonados, por género',
  },
  wishlist: {
    ...STATS_OWN.wishlist,
    subtitle: 'Su princesa siempre está en otro castillo: qué ha ido añadiendo y desde cuándo.',
    empty: 'No tiene nada en la lista de próximos.',
    genres: 'Géneros que más le apetecen',
  },
  year: {
    ...STATS_OWN.year,
    gamesTitle: (year: number) => `Todo lo que completó en ${year}`,
  },
  reviews: {
    ...STATS_OWN.reviews,
    // El panel ajeno no pinta reseñas (tienen su apartado en el perfil), pero el rótulo del botón que las abre
    // vive en las fichas del podio: si algún día se enlazan desde aquí, no dirá «tu reseña» de la de otro.
    openTitle: (name: string) => `Leer su reseña de ${name}`,
  },
};

