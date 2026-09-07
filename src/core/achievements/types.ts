// Modelo de los LOGROS. Ver docs/plan-logros.md §5.1, §5.2 y §6.3bis.
//
// CADA NIVEL ES UN LOGRO. Es la decisión que gobierna este fichero y la que lo separa de su primera versión: una
// escalera de cuatro escalones no es un logro con grados, son cuatro logros con el mismo dibujo. Lo que se
// cuenta, lo que se publica, lo que se pinta y lo que entra en el denominador es el ESCALÓN.
//
// Y por eso hay dos tipos donde antes había uno:
//
//  - `AchievementLadder` — lo que se DECLARA: una métrica, un dibujo, una rareza y sus umbrales. Es la unidad de
//    edición, y existe para que la métrica se escriba una vez y no once.
//  - `AchievementDef` — lo que se USA: un escalón de una escalera, con su `id` propio. El catálogo público
//    (`ACHIEVEMENTS`) es la lista de estos, y es la que ve todo lo demás.
//
// EL `id` DE UN ESCALÓN LLEVA SU UMBRAL, no su posición (`completados-50`, no `completados-3`). Es lo que hace
// que insertar un escalón intermedio sea ADITIVO: meter el 25 entre el 10 y el 50 no renombra a nadie. Con el
// índice en el `id`, esa misma inserción correría todos los siguientes y le retiraría a cada cual un logro que ya
// tenía publicado, que es exactamente lo que la regla del §6.4 prohíbe.
import type { TabData, TabId } from '../../model/types/game';

/** Familia del logro. Decide qué se anuncia en el feed y qué entra en el denominador. */
export type AchievementFamily = 'mirror' | 'data' | 'social' | 'annual' | 'onboarding';

/**
 * Rareza DECLARADA, curada a mano: es una propiedad del logro, no de las personas (§6.6).
 *
 * Gobierna tres cosas y las tres exigen que sea ESTABLE: los puntos que suma (§6.10.2), el aura de la medalla y
 * la prioridad de recorte al empaquetar (§5.3). El porcentaje MEDIDO sobre el directorio (§6.6bis) se enseña y
 * no decide nada — si moviera los puntos, el nivel de perfil bailaría al ritmo de quién ha abierto la app esta
 * semana, y un nivel que baja solo es el único fallo que la marca de agua no permite.
 *
 * La rareza la pone la ESCALERA y la heredan todos sus escalones. Un escalón alto no es «más raro» por estar
 * arriba: ya suma más porque hay más escalones debajo suyo, y contarlo dos veces dispararía los puntos.
 */
export type AchievementRarity = 'comun' | 'infrecuente' | 'raro' | 'excepcional';

/** Puntos que suma cada logro conseguido, según su rareza (§6.10.2). */
export const RARITY_POINTS: Record<AchievementRarity, number> = {
  comun: 5,
  infrecuente: 10,
  raro: 25,
  excepcional: 60,
};

/**
 * Lo que devuelve una métrica: cuánto llevas y CUÁNDO alcanzaste cada cantidad.
 *
 * La fecha llega por una de dos vías, y son dos porque las métricas no se parecen entre sí:
 *
 *  - `stamps` — lo normal. Un sello por cada unidad contada, y `evaluate` deduce solo la fecha de cada escalón
 *    (el sello de la unidad que hace el número). Vale para todo lo que cuenta cosas, que es la mayoría.
 *  - `at` — cuando la fecha por escalón solo la sabe la métrica: una racha de semanas sabe cuándo se completó, y
 *    un array de sellos por unidad no diría nada de eso. Índice `n-1` = escalón `n` de su escalera.
 *
 * Sin ninguna de las dos, el escalón queda conseguido y SIN FECHA, que es un estado legítimo y previsto (§5.3):
 * una biblioteca sin sellos existe y no es un error.
 */
export interface AchievementMeasure {
  value: number;
  /** Sello (ms) de cada unidad contada. 0 = esa unidad no tiene fecha deducible. Sin ordenar. */
  stamps?: number[];
  /**
   * Instante (ms) por VALOR alcanzado: `at[n-1]` es cuándo la métrica llegó a `n`. 0 = sin fecha deducible.
   *
   * Por valor y no por escalón, porque es lo único que una racha sabe decir: sabe cuándo llegó a siete semanas,
   * no cuándo cruzó «el tercer umbral» —eso depende de unos umbrales que la métrica no conoce—. El evaluador
   * hace la conversión con el umbral de cada escalón.
   */
  at?: number[];
}

/** Lo que la métrica recibe. Todo por parámetro: la función es pura y se prueba con fechas fijas. */
export interface AchievementInput {
  games: TabData;
  /** Contadores que no salen de la biblioteca. Pueden faltar y evalúan a 0: la marca de agua lo cubre (§7.1). */
  social: {
    friends: number;
    /** Semanas distintas con publicación (posts + reseñas) en el gist social PROPIO (§7.5). */
    postWeeks: number;
    /** `profiles.createdAt`, sellado por el servidor e inmutable por reglas. 0 si aún no se ha leído. */
    profileCreatedAt: number;
  };
  /** Señales locales que no dejan rastro en la biblioteca. Solo las usan los «primeros pasos» (§5.3ter). */
  device: {
    hasSync: boolean;
    /** La ruleta es una función pura y no persiste nada: sin este sello no hay forma de saber que se usó. */
    rouletteUsedAt: number;
    /** Paleta activa distinta de la de fábrica. */
    themeChanged: boolean;
  };
  now: number;
  /**
   * Los `id` ya conseguidos en la PRIMERA pasada del evaluador. Solo lo reciben las escaleras «meta» —las que
   * miden sobre otros logros, `tutorial` y `platino`—, y por eso es opcional: cualquier métrica normal que lo
   * mire está midiendo lo que no le toca, y sin él evalúa a cero en vez de mentir.
   */
  earned?: ReadonlySet<string>;
}

/**
 * Lo que declara una ESCALERA: su nombre y su condición genérica, sin cifra («Juegos que te has terminado»).
 *
 * No lleva `done` porque en la escalera el hecho es una FUNCIÓN del umbral (`done(step)`): sin la cifra, «Te has
 * terminado juegos» no dice nada. Los textos con cifra los compone `expand()` para cada escalón.
 */
export interface LadderLabels {
  name: string;
  condition: string;
}

export interface AchievementLabels {
  /** Nombre visible. Es un guiño y SE PUEDE RETOCAR; el `id` no (§6.4). */
  name: string;
  /**
   * LA META: qué hay que hacer, en imperativo y con la cifra de ESTE escalón («Termina 100 juegos»).
   *
   * Es el texto de lo que AÚN NO TIENES —la fila bloqueada del listado, la zanahoria— y el contrato del logro:
   * sin él el guiño se vuelve un acertijo.
   */
  condition: string;
  /**
   * EL HECHO: lo mismo contado en pasado y de tú a tú («Te has terminado 100 juegos»).
   *
   * Existe porque una sola frase no puede hacer los dos trabajos: en imperativo, un logro CONSEGUIDO se lee como
   * una tarea pendiente («Termina 100 juegos» debajo de una medalla que ya tienes), y en pasado, uno que te falta
   * te felicita por algo que no has hecho. Lo usan tu listado y el aviso del desbloqueo (§7.4).
   *
   * OJO CON LA SEGUNDA PERSONA: habla de TI, así que no vale para la ficha de otra persona. Ahí se sigue
   * enseñando `condition`, que describe el logro sin atribuírselo a nadie.
   */
  done: string;
}

/**
 * UNA ESCALERA: la unidad de edición del catálogo. No se publica, no se cuenta y no se pinta — se expande.
 */
export interface AchievementLadder {
  /** Prefijo estable de los `id` de sus escalones. Slug de LO QUE SE MIDE, nunca del nombre visible. */
  key: string;
  family: AchievementFamily;
  /** Umbrales, uno por escalón. Ascendentes, salvo que `descending` diga lo contrario. */
  steps: readonly number[];
  /**
   * MENOS ES MEJOR: el escalón se consigue cuando el valor BAJA hasta el umbral («deja Próximos en 25 o menos»).
   * Los umbrales van entonces en orden descendente y el `id` sigue llevando el umbral, no la posición.
   */
  descending?: true;
  metric: (input: AchievementInput) => AchievementMeasure;
  /** El nombre de la escalera y su condición genérica (sin cifra): el respaldo de `goal`/`done`. */
  labels: LadderLabels;
  /** LA META de un escalón concreto, en imperativo. Por defecto, `condición: umbral`. */
  goal?: (step: number) => string;
  /** EL HECHO de un escalón concreto, en pasado y en segunda persona. Por defecto, la meta. */
  done?: (step: number) => string;
  /** Símbolo del sprite perezoso, sin el prefijo `#ach-`. Lo comparten todos los escalones de la escalera. */
  icon: string;
  rarity: AchievementRarity;
  /** Nombre y condición tapados hasta conseguirlo. Es un ESTADO, no una familia (§6.7). */
  hidden?: true;
  /** Retirada: no se ofrece ni cuenta en la fracción, pero se sigue pintando a quien ya la tenga (§6.4). */
  retired?: true;
}

/** UN ESCALÓN: lo que se cuenta, se publica y se pinta. Se genera desde su escalera, nunca se escribe a mano. */
export interface AchievementDef {
  /** `<key>-<umbral>`. No se renombra ni se reutiliza jamás. */
  id: string;
  /** La escalera de la que sale, para agrupar sin volver a partir el `id`. */
  ladder: string;
  /** Posición dentro de su escalera, 1-based. Es lo que pinta el triángulo de la medalla. */
  grade: number;
  /** Cuántos escalones tiene su escalera. Con uno solo, el grado no se pinta. */
  grades: number;
  /** El umbral de ESTE escalón. */
  step: number;
  descending: boolean;
  family: AchievementFamily;
  icon: string;
  rarity: AchievementRarity;
  hidden?: true;
  retired?: true;
  labels: AchievementLabels;
  metric: (input: AchievementInput) => AchievementMeasure;
}

/** El estado de UN escalón. `level` vale 0 o 1 y nada más: un escalón se tiene o no se tiene. */
export interface AchievementState {
  id: string;
  /** 0 o 1. Sigue llamándose `level` porque es lo que viaja en el espejo y lo que leen las vistas. */
  level: number;
  /** El valor de la métrica de su escalera. El mismo para todos los escalones de una misma escalera. */
  value: number;
  /** El umbral que hay que alcanzar; `null` cuando ya está conseguido. */
  next: number | null;
  unlockedAt: number;
}

/** Las dos cifras del §6.10. Función pura de `AchievementState[]` + catálogo; no se publica (§6.10.3). */
export interface AchievementSummary {
  earned: number;
  total: number;
  percent: number;
  points: number;
  level: number;
  pointsIntoLevel: number;
  pointsToNext: number;
}

/** ¿Alcanza `value` el umbral de este escalón? Una línea, pero es la que respeta a las escaleras descendentes. */
export function reaches(def: AchievementDef, value: number): boolean {
  return def.descending ? value <= def.step : value >= def.step;
}

/**
 * Una entrada del listado: el escalón y en qué punto está.
 *
 * Vive en el núcleo y no junto a la pantalla que la pinta porque la ARMA el viewmodel (`listForScreen`) y la
 * CONSUME la vista: con el tipo en la vista, el viewmodel tenía que importar de ella, que es la capa de al lado
 * en el sentido contrario.
 */
export interface AchievementItem {
  def: AchievementDef;
  state: AchievementState;
}

/** Listas de la biblioteca, sin `deleted` ni `updatedAt`. */
export const LIBRARY_TABS: readonly TabId[] = ['c', 'v', 'e', 'p'];
