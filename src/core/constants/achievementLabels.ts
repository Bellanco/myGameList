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
  //
  // «Con tus juegos» y no «con tu biblioteca»: lo que se cuenta aquí son partidas —lo terminado, lo abandonado,
  // las horas—, y «biblioteca» nombra el continente en vez del contenido. Además es la palabra con la que la app
  // llama a la pantalla de listas, así que en el panel se leía como si los logros fueran de esa pantalla.
  subtitle: 'Lo que llevas hecho con tus juegos, contado en medallas.',
  /**
   * El mismo texto para el listado de OTRA persona. Hacía falta porque el de arriba está en segunda persona y la
   * pantalla es la misma: la ficha de una amistad se titulaba «Logros de Fulano» y debajo decía «lo que llevas
   * hecho con tus juegos», hablando de los juegos de quien mira.
   */
  subtitleOf: (owner: string) => `Lo que ${owner} lleva hecho con sus juegos, contado en medallas.`,
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
  /**
   * El rótulo de una fecha HEREDADA DEL SUELO. La fila la pinta como cualquier otra —una columna de fechas con
   * huecos no se lee— pero el puntero dice de dónde sale: es el día más antiguo del que hay constancia, y el
   * logro cayó ese día o después. Sin esta línea, la pantalla estaría afirmando un día que no sabe.
   */
  floorDateTitle: 'Sin sello propio: se enseña el día más antiguo del que hay constancia',
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
  /**
   * LO QUE LLEVAS, SIN EL PORCENTAJE. Decía «73 de 100 · 73 %» y esa tercera cifra ya la dibuja la barra que va
   * al lado: el mismo dato tres veces —barra, cuenta y porcentaje— en una columna de doce píxeles. Lo que no se
   * puede deducir de la barra es cuántos van y cuántos hacen falta, y eso es lo que se queda.
   *
   * `percent` sigue en la firma porque es lo que dibuja la barra, y el llamante lo tiene calculado ahí mismo.
   */
  progress: (value: number, next: number) => `${value} de ${next}`,
  progressPercent: (value: number, next: number) => `${value} % de ${next} %`,
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

  /**
   * El porcentaje medido (§6.6bis), en la columna que ordena la vista global: LA CIFRA SOLA.
   *
   * La lista tiene 334 filas y todas repetían la misma frase con el mismo denominador —«lo tiene el 100 % · 3 de
   * 3»—, así que la línea que se recorre con la vista para comparar cifras estaba hecha casi entera de texto
   * idéntico. Lo que cambia de una fila a otra es el número, y es lo único que se queda.
   */
  rarityShare: (percent: number) => `${percent} %`,

  /**
   * Y LA FRASE ENTERA NO SE PIERDE: va en el `title` y en el texto para lector de pantalla de esa misma cifra.
   *
   * El denominador es lo que sostiene la honestidad del porcentaje —sin él, «el 100 %» se lee como una
   * afirmación sobre todo el mundo y no lo es, que con muestras pequeñas pasa de recomendable a imprescindible—,
   * así que sale de la columna pero no de la pantalla: está a un puntero de distancia, y quien no ve la pantalla
   * lo oye igual que antes.
   */
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

  /**
   * AVISO DEL INSTANTE (§7.4), la tarjeta. Sustituye al texto que iba por el `StatusBanner`, que sigue siendo el
   * que ANUNCIA: la cápsula es visual y la región viva de siempre es la que lo dice a un lector de pantalla.
   */
  toastUnlocked: 'Has desbloqueado',
  toastManyName: (count: number) => `${count} logros`,
  /**
   * «Créditos finales V y 2 más» — un nombre entero y la cuenta. Una lista cortada a mitad de nombre se lee como
   * un fallo, y con dos nombres largos no cabía ni el primero.
   */
  toastNames: (names: readonly string[]) =>
    (names.length === 2 ? names.join(' y ') : `${names[0]} y ${names.length - 1} más`),
  /**
   * EL ESTRENO: lo que ya estaba hecho y se concede al abrir. No felicita por algo que acabas de hacer —no lo
   * has hecho ahora— sino por algo que llevabas hecho sin saberlo, que es otra cosa y se dice de otra manera.
   */
  toastWaiting: 'Te estaban esperando',
  toastWaitingName: (count: number) => `${count} logros nuevos`,
  toastWaitingBody: 'Salen de lo que ya tenías en tus listas',

  /** El HITO: la mitad de una escalera, o su recta final. No es un logro, así que no felicita: sitúa. */
  toastHalf: 'Vas por la mitad',
  toastNear: 'Casi lo tienes',
  toastFigure: (value: number, step: number, percent: number) => `${value} de ${step} · ${percent} %`,
  toastLink: 'Ver tus logros',

  /** Lo que ANUNCIA la región viva del banner. Lo visual lo pone la tarjeta; esto es lo que se oye. */
  unlockedOne: (name: string) => `Logro conseguido: ${name}`,
  unlockedMany: (count: number) => `${count} logros conseguidos`,
  milestoneAria: (name: string, percent: number) => `${name}, ${percent} % completado`,

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
 * LA CIFRA DEL ESCALÓN, para la píldora de la medalla. Vive aquí y no en el catálogo a propósito: el catálogo
 * declara lo que se MIDE (`steps`) y la condición en llano; cómo se rotula esa cifra dentro de un disco de 48 px
 * es una decisión de la vista, y meterla en `AchievementLadder` obligaría a tocar el contrato de datos —y el
 * espejo que viaja al gist— por un rótulo.
 *
 * VA SIN UNIDAD, y es lo que hace que quepa. Dentro de una escalera la unidad es constante —todos los escalones
 * de «Aún estás aquí» son semanas—, así que escribirla en cada medalla gasta la mitad del disco para no añadir
 * nada: «52 sem» son siete caracteres y «52» son dos. Lo que la unidad aporta lo aporta ya la fila del listado,
 * que dice la condición entera.
 *
 * El aspa se queda porque no es unidad, es la señal de que eso es un contador; las descendentes llevan «≤»,
 * porque «Exterminatus» pide dejar Próximos en 5 o MENOS, no en 5; y la única en porcentaje lleva su símbolo,
 * que sin él sería un número imposible.
 */
const PERCENT_LADDERS = new Set(['cobertura']);

/**
 * Escaleras que miden TIEMPO SEGUIDO —semanas, meses, años— y por eso van sin aspa.
 *
 * El aspa dice «tantas veces», y eso es verdad en «×100 juegos terminados» y mentira en «12 meses seguidos»:
 * ahí el 12 no cuenta doce cosas, mide una racha. Sin el aspa, la cifra se apoya en la condición de la fila
 * («12 meses seguidos cerrando al menos un juego») y no promete lo que no es.
 */
const STREAK_LADDERS = new Set([
  'constancia', 'conversador', 'ritmo', 'degustacion', 'deshielo', 'cadena-de-anos', 'ano-redondo', 'veterano',
]);

/**
 * Escaleras de ÍNDICE CUADRADO: la píldora dice «3×3», que es el nombre que tiene la cosa.
 *
 * Ni «×3» ni «3» servirían, y por el mismo motivo: el escalón no pide tres juegos ni tres vueltas, pide tres de
 * cada, y el aspa entre las dos cifras es justo lo que dice eso en dos caracteres. Es el único caso en que la
 * píldora lleva DOS números, y cabe porque son de una cifra hasta el escalón más alto declarado.
 */
const SQUARE_LADDERS = new Set(['marmota', 'todos-los-palos', 'anadas']);

/**
 * Escaleras de MAGNITUD: horas sumadas, palabras escritas, años de anchura. Sin aspa, como las rachas.
 *
 * El aspa dice «tantas veces» y aquí sería mentira otra vez: 2.000 no son dos mil cosas contadas, es un total.
 * La unidad la escribe la condición de la fila («Suma 2.000 horas entre todos tus juegos»), que es donde cabe.
 */
const MAGNITUDE_LADDERS = new Set(['horas-totales', 'obra-escrita', 'arqueologia']);

export function medalThreshold(ladder: string, step: number, grades: number, descending: boolean): string {
  if (grades <= 1) return '';
  if (PERCENT_LADDERS.has(ladder)) return `${step}%`;
  if (SQUARE_LADDERS.has(ladder)) return `${step}×${step}`;
  if (STREAK_LADDERS.has(ladder) || MAGNITUDE_LADDERS.has(ladder)) return String(step);
  return `${descending ? '≤' : '×'}${step}`;
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
