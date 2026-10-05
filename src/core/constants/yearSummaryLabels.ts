// Textos del RESUMEN DEL AÑO del perfil social (`view/components/socialhub/YearSummary.tsx`).
//
// En su propio fichero y no en `labels.ts`: solo los pinta una vista perezosa del hub social, y lo que entra en
// `labels.ts` viaja en el arranque de todo el mundo.
//
// DOS VOCES, y ningún pronombre. El mismo resumen se lee en tu perfil («terminaste») y en el de otra persona
// («Lucía terminó», «sus géneros»): el posesivo no tiene género, y donde hace falta un sujeto va el nombre.

import type { IconName } from './icons';

/**
 * Un icono del sprite por capítulo, en la cabecera de su tarjeta. Del sprite general y no de uno propio: son los
 * mismos dibujos que el resto de la app ya enseña para esas ideas (el trofeo de los premios, la bandera a cuadros
 * de terminar un juego, las dos personas de lo social).
 */
export const YEAR_SUMMARY_ICONS: Record<'cover' | 'best' | 'when' | 'genres' | 'tags' | 'previous' | 'common', IconName> = {
  cover: 'star',
  best: 'trophy',
  when: 'checkered-flag',
  genres: 'chart-simple',
  tags: 'signature',
  previous: 'repeat',
  common: 'bottom-hub',
};

const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;
/** En plural, que es como se dice un hábito: «los sábados». */
const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'] as const;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** «marzo», «marzo y abril», «marzo, abril y mayo». */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

const games = (count: number): string => (count === 1 ? '1 juego' : `${count} juegos`);

/** Quién protagoniza el resumen: tú, o otra persona con su nombre. */
export interface SummaryVoice {
  own: boolean;
  name: string;
}

export const YEAR_SUMMARY_UI = {
  /** Botón de la fila de acciones del perfil, junto a Reseñas y Estadísticas. */
  button: 'Resumen del año',
  buttonBack: 'Ver perfil',
  title: (year: number) => `Resumen de ${year}`,
  chapter: (index: number, total: number) => `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
  monthsShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const,
  monthLong: (month: number) => MONTHS_LONG[month] || '',
  dateLong: (month: number, day?: number) => (day ? `el ${day} de ${MONTHS_LONG[month]}` : `en ${MONTHS_LONG[month]}`),
  joinList,

  /** Piezas de formato: también son texto, y también van aquí. */
  format: {
    outOf: (scale: 'stars' | 'grade') => (scale === 'grade' ? '/ 100' : '/ 5'),
    meta: (parts: ReadonlyArray<string | null | undefined>) => parts.filter(Boolean).join(' · '),
    chip: (name: string, count: number) => `${name} · ${count}`,
    quote: (text: string) => `«${text}»`,
    tagCount: (count: number) => `×${count}`,
    /** Diferencia con signo: «+5», «−3», «±0». */
    signed: (value: string, delta: number) => `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${value}`,
    firstOrLast: (label: string, date: string) => `${label}, ${date}`,
  },

  cover: {
    kicker: (v: SummaryVoice) => (v.own ? 'Tu año en juegos' : 'Su año en juegos'),
    finished: (v: SummaryVoice, count: number) => (v.own ? `Terminaste ${games(count)}` : `${v.name} terminó ${games(count)}`),
    withReview: (count: number) => (count === 0 ? '' : count === 1 ? ', uno con reseña' : `, ${count} con reseña`),
    avg: 'nota media',
    palmares: (rank: number, season: string) => (rank > 0 ? `${season} · ${rank}.º puesto` : `${season} · participación`),
    platformsAria: 'Plataformas del año',
  },

  best: {
    kicker: 'Juego del año',
    noQuote: (v: SummaryVoice) => (v.own ? 'No le escribiste reseña.' : 'Sin reseña.'),
    podiumAria: 'Segundo y tercer puesto',
  },

  when: {
    kicker: (v: SummaryVoice) => (v.own ? 'Cuándo los terminaste' : 'Cuándo los terminó'),
    top: (v: SummaryVoice, months: readonly number[], count: number) => {
      const names = months.map((month) => MONTHS_LONG[month]);
      if (months.length === 1) return `${capitalize(names[0])} fue ${v.own ? 'tu' : 'su'} mes: ${games(count)}`;
      return `${capitalize(joinList(names))}, ${games(count)} cada uno`;
    },
    monthsAria: (months: readonly number[]) =>
      `Juegos terminados en cada mes: ${months.map((count, month) => `${MONTHS_LONG[month]} ${count}`).join(', ')}`,
    calendarAria: 'Días del año en que se terminó un juego',
    first: (names: readonly string[]) => (names.length === 1 ? 'el primero' : 'los primeros'),
    last: (names: readonly string[]) => (names.length === 1 ? 'el último' : 'los últimos'),
    weekday: (v: SummaryVoice, day: number, count: number, total: number) =>
      ({ title: `Los ${WEEKDAYS[day]}`, text: `${v.own ? 'tu' : 'su'} día para terminar: ${count} de ${total}` }),
    undated: (count: number) =>
      count === 1
        ? '1 juego del año no tiene fecha: entró de golpe con otros, es una rejugada o es de antes de que la app la guardara.'
        : `${count} juegos del año no tienen fecha: entraron de golpe con otros, son rejugadas o son de antes de que la app la guardara.`,
    gameTitle: (name: string, month: number, day: number) => `${name} · ${day} de ${MONTHS_LONG[month]}`,
  },

  genres: {
    kicker: (v: SummaryVoice) => (v.own ? 'Tus géneros' : 'Sus géneros'),
    title: (leaders: readonly string[], count: number, total: number) =>
      leaders.length === 1 ? `Un año de ${leaders[0]}: ${count} de ${total}` : `${joinList(leaders)}, empatados: ${count} de ${total} cada uno`,
    detail: (avg: string | null, best: string) => (avg ? `Media ${avg} · el mejor, ${best}` : `El primero, ${best}`),
  },

  tags: {
    kicker: (v: SummaryVoice) => (v.own ? 'Lo que más valoraste, y lo que te chirrió' : 'Lo que más valoró, y lo que le chirrió'),
    strengthsAria: 'Puntos fuertes más repetidos',
    weaknessesAria: 'Puntos débiles más repetidos',
  },

  previous: {
    kicker: (year: number) => `Frente a ${year}`,
    /** El titular cuando la carrera cuenta el mes en que ya había más juegos que en todo el año anterior. */
    passed: (v: SummaryVoice, month: number, year: number) => `En ${MONTHS_LONG[month]} ya ${v.own ? 'habías' : 'había'} superado todo ${year}`,
    /** El titular sin ese momento: sin fechas, o con menos (o los mismos) juegos que el año anterior. */
    title: (count: number, before: number, year: number) =>
      count === before ? `Los mismos juegos que en ${year}: ${count}` : `${games(count)}, ${Math.abs(count - before)} ${count > before ? 'más' : 'menos'} que en ${year}`,
    games: 'juegos',
    gamesVs: (count: number, before: number) => `${count} frente a ${before}`,
    grade: 'de nota media',
    gradeVs: (v: SummaryVoice, now: string, before: string, delta: number) =>
      `${now} frente a ${before}${delta > 0 ? `: ${v.own ? 'puntuaste' : 'puntuó'} más alto` : delta < 0 ? `: ${v.own ? 'puntuaste' : 'puntuó'} más bajo` : ''}`,
    genreRise: (name: string, from: number, to: number) => `${name}, de ${from} a ${to}`,
    genreRiseText: 'el género que más creció',
    raceAria: (year: number, before: number, count: number, previousCount: number) =>
      `Juegos terminados acumulados mes a mes: ${count} en ${year} frente a ${previousCount} en ${before}`,
    passLabel: (month: number, count: number) => `${MONTHS_LONG[month]}: ${count}`,
    raceUndated: (count: number) => (count === 1 ? '1 juego sin fecha no sale en la gráfica, pero sí en las cifras.' : `${count} juegos sin fecha no salen en la gráfica, pero sí en las cifras.`),
  },

  /** La tarjeta destacada del feed, cuando alguien abre su resumen en temporada. */
  feed: {
    line: (year: number) => `ya tiene su resumen de ${year}`,
    own: (year: number) => `Ya tienes tu resumen de ${year}`,
    cta: 'Ver resumen',
    aria: (name: string, year: number) => `${name} ya tiene su resumen de ${year}. Abrirlo`,
    ownAria: (year: number) => `Ya tienes tu resumen de ${year}. Abrirlo`,
  },

  /** El aviso propio del 15 de diciembre, en el carril de abajo a la izquierda. */
  notice: {
    kicker: 'Ya está aquí',
    title: (year: number) => `Tu resumen de ${year}`,
    text: 'Tus juegos del año, tus géneros y lo que compartes con tus amigos. Se irá actualizando hasta el 31.',
    open: 'Ver mi resumen',
    /** Lo que lee el lector de pantalla al pulsar la cápsula, y lo que anuncia su región viva al salir. */
    aria: (year: number) => `Tu resumen de ${year}. Ver mi resumen`,
    announce: (year: number) => `Tu resumen de ${year}. Tus juegos del año, tus géneros y lo que compartes con tus amigos.`,
  },

  common: {
    kicker: 'Contigo',
    title: (count: number) => (count === 1 ? 'Un juego que terminasteis los dos' : `${count} juegos que terminasteis los dos`),
    /** El titular con la afinidad, que solo existe con dos o más juegos en común con nota. */
    titleAffinity: (count: number, affinity: number) => `${count} juegos en común y un ${affinity} % de afinidad`,
    none: 'Este año no coincidisteis en ninguno.',
    near: (v: SummaryVoice, yours: string, theirs: string) => `donde más coincidís: ${yours} tú, ${theirs} ${v.name}`,
    gap: (v: SummaryVoice, yours: string, theirs: string) => `donde más chocáis: ${yours} tú, ${theirs} ${v.name}`,
    picksTitle: 'De su año, para ti',
    pickBest: 'Su juego del año',
    pickMonth: (month: number) => `Lo terminó en ${MONTHS_LONG[month]}`,
    pickWhere: 'Lo tienes en Próximos',
    pickWhereWish: 'Lo tienes en tu lista de deseos',
  },
} as const;
