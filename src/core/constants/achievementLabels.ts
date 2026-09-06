// Textos de los LOGROS. Aparte de `statsLabels.ts` por el mismo criterio que separó aquel de `labels.ts`: los
// consumen dos chunks perezosos distintos —el panel y el hub social— y un módulo entra entero en un chunk o no
// entra.
//
// Los NOMBRES de cada logro no están aquí: viven en el catálogo (`core/achievements/catalog.ts`), junto a la
// métrica que miden, porque un nombre separado de su condición se desincroniza de ella. Aquí está solo el cromo
// de las pantallas.
import type { AchievementRarity } from '../achievements/types';

export const ACHIEVEMENTS_UI = {
  /** Rótulo del apartado del panel y de la pantalla. */
  title: 'Logros',
  // Dark Souls: la hoguera es donde se cuenta lo que uno lleva hecho.
  subtitle: 'Lo que llevas hecho con tu biblioteca, contado en medallas.',
  titleOf: (owner: string) => `Logros de ${owner}`,
  back: 'Volver',
  backToPanel: 'Volver al panel',
  backToProfile: 'Volver al perfil',
  cardAction: 'Ver todos tus logros',

  /** Las dos cifras (§6.10). El denominador dice «del catálogo actual» con esas palabras, y no es un adorno. */
  count: (earned: number, total: number) => `${earned}/${total}`,
  countHint: (percent: number) => `${percent}% del catálogo actual`,
  countLabel: 'Logros',
  // LOS TEXTOS DEL NIVEL DE PERFIL SE RETIRAN AQUÍ Y NO EN EL NÚCLEO. Los puntos por rareza y la curva por
  // tramos siguen calculándose y probándose (`core/achievements/summary`), pero no se enseñan mientras no esté
  // decidido cómo se presentan. Cuando lo esté, estos cuatro textos son lo que hace falta:
  //   levelLabel: 'Nivel'
  //   levelValue: (level) => `Nivel ${level}`
  //   levelToNext: (points, next) => `${points} pts para el ${next}`
  //   levelAria: (level, into, toNext) => `Nivel ${level}. Llevas ${into} puntos de los ${into + toNext}…`

  /** Estado de una fila del listado. */
  unlockedOn: (date: string) => date,
  noDate: '—',
  noDateTitle: 'Conseguido antes de que hubiera con qué fecharlo',
  locked: 'Bloqueado',
  /** Vista global: el recuadro marca lo que tiene el perfil, y el texto lo dice para quien no ve el recuadro. */
  owned: 'Conseguido',
  notOwned: 'No lo tiene',
  ownedSelf: 'Lo tienes',
  notOwnedSelf: 'No lo tienes',
  /**
   * Progreso de lo que aún no tienes, con la forma de Steam: lo que llevas, lo que hace falta y qué parte es eso.
   * El porcentaje va detrás y pequeño —lo que se busca de un vistazo es «cuánto me falta», y eso lo dicen los dos
   * números— pero está, porque con umbrales como 500 la fracción sola no dice si estás cerca.
   */
  progress: (value: number, next: number, percent: number) => `${value} de ${next} · ${percent} %`,
  progressPercent: (value: number, next: number, percent: number) => `${value} % de ${next} % · ${percent} %`,
  maxed: 'Al máximo',
  hiddenName: 'Logro oculto',
  hiddenCondition: 'Se revela al conseguirlo.',

  /** Vista global: el catálogo por lo común que es cada logro (§6.6bis). */
  globalTitle: 'Logros globales',
  globalTitleOf: (owner: string) => `Logros globales de ${owner}`,
  globalTitleSelf: 'Logros globales',
  globalLead: 'El catálogo entero, de lo más común a lo más raro. El recuadro marca lo conseguido.',
  globalButton: 'Logros globales',
  /** El botón de vuelta nombra su destino: en las dos vistas sigues en los logros, cambia de quién son. */
  ownAchievements: 'Tus logros',
  achievementsOf: (owner: string) => `Logros de ${owner}`,
  globalNoSample: 'Todavía no hay gente suficiente para decir lo común que es cada logro.',

  /** El porcentaje medido (§6.6bis). NUNCA se dice sin su denominador. */
  rarityPercent: (percent: number, holders: number, sample: number) =>
    `lo tiene el ${percent} % · ${holders} de ${sample}`,

  /**
   * Nombre accesible de una medalla. Es lo que hace que la tira solo-imagen sirva con lector de pantalla.
   *
   * El grado NO se añade aquí: desde que cada escalón es un logro, ya viene dentro del nombre («Créditos finales
   * III»). Componerlo otra vez lo hacía decirlo dos veces seguidas.
   */
  medalAria: (name: string, date: string) => (date ? `${name}, conseguido el ${date}` : name),
  medalLockedAria: (name: string) => `${name}, bloqueado`,
  medalHiddenAria: 'Logro oculto, se revela al conseguirlo',

  /** Aviso del instante (§7.4). Va por el `StatusBanner` de siempre, con su `role="status"`. */
  unlockedOne: (name: string) => `Logro conseguido: ${name}`,
  unlockedMany: (count: number) => `${count} logros conseguidos`,

  /**
   * Feed social (§8.4): se agrupa por DÍA, no por logro.
   *
   * Con UN logro el nombre va aparte, para poder meter la medalla entre el verbo y él, en la misma línea.
   */
  feedVerb: 'Ha conseguido',
  feedMany: (count: number) => `Ha conseguido ${count} logros`,

  empty: {
    // Sea of Stars, uno de los temas: el viaje empieza en alguna parte.
    title: 'Todavía no hay nada que contar',
    body: 'Añade juegos, ponles nota y escribe alguna reseña: los logros salen solos de lo que ya haces.',
  },
} as const;

// LOS RÓTULOS DE FAMILIA SE VAN CON EL AGRUPADO. El listado es una sola lista —conseguidos primero, como en
// Steam—, así que ya no hay secciones que titular. La familia sigue viva en el catálogo, donde hace su trabajo:
// el filtro del feed (solo espejo, anual y social) y el denominador (fuera los primeros pasos). Si algún día
// vuelve un agrupado, los rótulos eran:
//   mirror: 'Lo que ya haces' · data: 'Tus fichas' · social: 'Con los demás'
//   annual: 'Año a año' · onboarding: 'Primeros pasos'

/**
 * Rareza dicha con PALABRAS, porque el aura es color puro y el color no puede ser el único que lo cuente. Es la
 * misma lección que los metales del podio de `top`, que también van escritos.
 */
export const ACHIEVEMENT_RARITY_LABELS: Record<AchievementRarity, string> = {
  comun: 'Común',
  infrecuente: 'Infrecuente',
  raro: 'Raro',
  excepcional: 'Excepcional',
};

/** Numeral romano del grado, I–XII. Más allá del XII no llega ninguna meta abierta del catálogo. */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Grado en romano. Vacío para el nivel 0 y para los logros de UN SOLO nivel: un «I» en algo que no tiene II no
 * dice nada y solo añade ruido a la rejilla.
 */
export function romanLevel(level: number, maxLevel: number): string {
  if (level < 1 || maxLevel <= 1) return '';
  return ROMAN[Math.min(level, ROMAN.length - 1)] || String(level);
}

/**
 * TEMPLE: la aleación del filo dice a qué altura de su escalera está el logro, en tres tramos.
 *
 * Es la señal de grado que sustituye al numeral, y se eligió por lo que sobrevive al tamaño: el filo es el borde
 * del disco entero, así que se lee a 28 px, mientras que un romano de 7 px no. Que sean tres tramos y no once no
 * es una pérdida: la cifra exacta ya la dicen la píldora y el nombre del logro; esto es «vas empezando / vas por
 * la mitad / estás arriba», de un vistazo y sin leer.
 *
 * OJO CON LOS METALES DEL RANGO (`_tiers.scss`): son otra escala y viven en la misma tarjeta del hub social. Por
 * eso el temple se queda en el FILO —un hilo de un par de píxeles— y nunca tiñe el cuerpo de la medalla.
 */
export function temperClass(grade: number, grades: number): string {
  if (grades <= 1 || grade < 1) return '';
  const frac = grade / grades;
  if (frac <= 1 / 3) return 'is-temple-1';
  if (frac <= 0.7) return 'is-temple-2';
  return 'is-temple-3';
}
