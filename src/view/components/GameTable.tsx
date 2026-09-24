import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useVirtualizer, useWindowVirtualizer } from '@tanstack/react-virtual';
import { COMMON_ICONS, TAB_ICONS } from '../../core/constants/icons';
import { categoryToneStyle } from '../../core/constants/categoryTone';
import { TAB_ROUTE, TAB_TITLES, UI_MESSAGES } from '../../core/constants/labels';
import { COMPACT_TABLE_MAX_WIDTH } from '../../core/constants/uiConfig';
import { FilePickerButton } from './FilePickerButton';
import { GameCover } from './GameCover';
import { coverUrl } from '../../core/utils/coverUrl';
import { sabemosQueNoTiene } from '../../core/utils/coverMemory';
import { plataformasYaPedidas } from '../../core/utils/coverDone';
import type { GameItem, TabId, TabSort } from '../../model/types/game';
import type { TabAction } from '../../viewmodel/useGameListViewModel';
import { hueFromGrade, resolveGrade } from '../../core/utils/scoreScale';
import { Icon } from './Icon';
import { ScoreDisplay } from './ScoreDisplay';
import { useScoreScale } from '../hooks/useScoreScale';
import { useListShape } from '../hooks/useListShape';
import { GRID_SIZES, useGridSize } from '../hooks/useGridSize';
import type { GridSize } from '../hooks/preferences';
import { useCovers } from '../hooks/useCovers';
import { useIsAdmin } from '../hooks/useIsAdmin';

interface GameTableProps {
  games: GameItem[];
  currentTab: TabId;
  expandedId: number | null;
  onExpandedChange: (id: number | null) => void;
  onEdit: (tab: TabId, id: number) => void;
  onDelete: (tab: TabId, id: number) => void;
  onMigrate: (tab: TabId, id: number, target: TabId) => void;
  onAddGame?: () => void;
  /** Trae la biblioteca desde el JSON de «Playnite Library Exporter» en vez de teclear juego a juego. */
  onImportLibrary?: (file: File) => void;
  /** Nº de juegos esperando en la bandeja; con 0 no se ofrece el acceso. */
  inboxCount?: number;
  onOpenInbox?: () => void;
  tabActions: TabAction[];
  readOnly?: boolean;
  /**
   * CÓMO SE PIDEN LAS CARÁTULAS EN ESTA LISTA. Va en un objeto y no en dos banderas sueltas por lo mismo que
   * `visibility`: son decisiones de la misma familia, y la siguiente que haga falta entra aquí sin ensanchar la
   * firma del componente.
   *
   * Existe porque la misma tabla pinta DOS cosas que no cuestan lo mismo: tu biblioteca, cuyos títulos ya están
   * resueltos y calentados por el recorrido de fondo, y la de otra persona, que es un catálogo entero de juegos
   * que tú no tienes. Abrir el perfil de un amigo con trescientos juegos nuevos son trescientas resoluciones
   * contra IGDB y trescientas escrituras de KV, y eso se multiplica por cada perfil que se visite: es el gasto
   * más grande que puede tener el servicio y el que menos control tiene, porque no lo decide cuánta biblioteca
   * tienes tú sino a cuánta gente miras. Por eso lo ajeno se pide con `cachedOnly`, que no resuelve nada.
   */
  coverPolicy?: {
    /**
     * ¿Se pueden pedir carátulas aquí? Por defecto sí, y entonces manda la preferencia de quien mira. Con
     * `false` la lista se pinta SIN imágenes, que es exactamente la vista que ya existe cuando la preferencia
     * está apagada: no hay que mantener un segundo diseño para esto.
     */
    allowed?: boolean;
    /**
     * Si de un título ya se pidió carátula en este navegador, pedirla con AQUELLAS plataformas en vez de con las
     * del juego que se tiene delante. Misma URL que la ya descargada, así que la sirve la caché y no sale ni una
     * petición (ver `core/utils/coverDone`). Se enciende en las listas ajenas, que es donde el mismo juego
     * aparece con otra estantería detrás.
     */
    preferKnown?: boolean;
    /**
     * Pedir SOLO lo que el servidor ya tenga resuelto (`c=1`, ver `functions/cover.ts`): lo que falte se queda sin
     * imagen en vez de preguntarse a IGDB. Es lo que hace que mirar la biblioteca de otra persona no gaste
     * escrituras de KV, que es el presupuesto que necesitan los enlaces compartidos.
     * Con `preferKnown`, un título que este navegador ya resolvió se pide con su URL de siempre y sin la marca:
     * está resuelto seguro, y así lo sirve la caché del navegador en vez de descargarse otra vez con otra URL.
     */
    cachedOnly?: boolean;
  };
  /** Orden activo de la pestaña; si se pasa junto a `onSort`, las columnas ordenables son pulsables. */
  sort?: TabSort;
  onSort?: (tab: TabId, column: string) => void;
  /** Id del juego recién guardado (añadido/editado): su fila destella brevemente para localizar el cambio. */
  recentlyChangedId?: number | null;
  /** Id del juego que se está ELIMINANDO: su fila se desvanece antes de que el borrado llegue a los datos. */
  removingId?: number | null;
  visibility?: {
    showYears?: boolean;
    showReplayable?: boolean;
    showRetry?: boolean;
    showHours?: boolean;
    /** Muestra el "Análisis" (reseña) en la fila expandida. En el perfil social se oculta: tiene pestaña propia. */
    showReview?: boolean;
  };
}

interface VirtualRow {
  /** `main` y `detail` son las de la forma de lista; `grid` es UNA FILA ENTERA del mosaico (varias cajas). */
  type: 'main' | 'detail' | 'grid';
  gameId: number;
  index: number;
  /** Solo en `grid`: los juegos que van en esa fila de la rejilla, en orden. */
  ids?: number[];
}

/* Alturas de partida del virtualizador, en píxeles. MEDIDAS SOBRE EL BUILD con una biblioteca real, no elegidas
   a ojo: 150 px el renglón a 1200 y a 1440 px de ancho —todas las filas miden lo mismo— y 129 px el mismo
   renglón en un teléfono de 412, donde las categorías se apilan en dos líneas (131 los que llevan el nombre en
   dos líneas).
   No hace falta que sean exactas —`measureElement` corrige cada fila en cuanto se pinta— pero sí que estén cerca,
   porque son las que fijan el tamaño total mientras el resto de la lista sigue sin medir: con 1.500 juegos, un
   error del 20 % son 19.000 px de barra de desplazamiento que aparecen de la nada mientras el usuario baja. */
const MAIN_ROW_ESTIMATE_PX = 150;
const COMPACT_ROW_ESTIMATE_PX = 130;
/* El detalle desplegado. Eran 320 px de cuando volcaba el análisis entero; desde que ese texto es un enlace a
   su pantalla, el detalle mide 245 px (278 los que reparten sus datos en tres líneas). MEDIDO sobre el build
   con la biblioteca real, como los de arriba. */
const DETAIL_ROW_ESTIMATE_PX = 250;
/* Mosaico: alto de una FILA de cajas (no de una caja) y ancho mínimo de caja, que es lo que decide cuántas
   caben. El reparto en columnas lo hace SOLO esta cuenta: `.game-grid` recibe el resultado en `--grid-cols` y
   se limita a partir el ancho en tantas columnas iguales (`minmax(0, 1fr)`), así que no hay ningún número que
   casar con el CSS — pero sí con la realidad, o una fila pintaría más cajas de las que caben.

   MEDIDOS SOBRE EL BUILD con la biblioteca real (302 juegos), como los de arriba: con el mínimo de 205 px salen
   6 columnas a 1440 y 5 a 1200. Con carátulas la fila mide 422 px (363 en un teléfono de 412, donde caben dos
   columnas); SIN ellas la caja pierde su marco 3:4 y la fila baja a 171. Son dos alturas muy distintas y la
   preferencia se puede cambiar con la lista abierta, así que la estimación tiene que mirarla o la barra de
   desplazamiento nace con el doble o la mitad de la altura que le toca. */
const GRID_ROW_ESTIMATE_PX: Record<GridSize, number> = { sm: 330, md: 420, lg: 520 };
/* La fila del mosaico SIN carátulas ya no se estima: se SABE. Desde que la caja plana tiene alto
   declarado (`--card-h` en `.game-grid.is-flat`, ver `_table.scss`), todas miden lo mismo, así que una
   fila son esos 12,6 rem —202 px— más el hueco de .6 rem que la celda deja debajo. Antes eran 175 px
   medidos sobre una caja que crecía con el título. */
const GRID_ROW_FLAT_ESTIMATE_PX = 212;
/* ANCHO MÍNIMO DE CUADRO, y por qué es una tabla y no un número. Es la perilla de la densidad —cuanto mayor,
   menos columnas y más sitio dentro de cada cuadro— y ahora la mueve quien mira, con el control de la cabecera
   (`useGridSize`). El paso de en medio es el de siempre: 205 px en escritorio, que es lo que hace falta para
   que la plataforma y el género quepan enteros (a 1440 px salen 6 columnas de 225).
   En un teléfono los mismos números darían una sola columna —un cuadro del ancho de la pantalla y más alto que
   ella—, así que allí la tabla es otra y el paso normal siguen siendo dos columnas.
   No hay ningún número que casar con el CSS: `.game-grid` solo parte el ancho en las columnas que le diga
   `--grid-cols`. */
const GRID_CARD_MIN_PX: Record<GridSize, number> = { sm: 150, md: 205, lg: 268 };
const GRID_CARD_MIN_NARROW_PX: Record<GridSize, number> = { sm: 104, md: 168, lg: 250 };
/* Y LA MISMA PERILLA, CORRIDA, CUANDO NO HAY CARÁTULAS. Sin el marco 3:4 la caja es mucho más baja, y a
   205 px de ancho lo que salía era un mosaico de piezas pequeñas y apretadas donde la plataforma y el
   género no tenían aire: la caja plana no tiene imagen que mirar, así que lo único que hay que leer son
   sus datos. El paso de en medio sube a 250 px —de 6 columnas a 5 en una pantalla de 1440—, y los otros
   dos lo acompañan.
   En un teléfono la tabla es otra, por lo mismo que la de las carátulas: con 250 px allí saldría UNA
   columna del ancho de la pantalla — y una caja de 372 px de ancho por 202 de alto es lo contrario de lo
   que se buscaba, media pieza en blanco por cada juego. El paso normal siguen siendo DOS columnas, con el
   mismo mínimo que usan las carátulas. */
const GRID_CARD_MIN_FLAT_PX: Record<GridSize, number> = { sm: 185, md: 250, lg: 320 };
const GRID_CARD_MIN_FLAT_NARROW_PX: Record<GridSize, number> = { sm: 118, md: 168, lg: 230 };
/* CUÁNTOS CHIPS CABEN EN UNA RANURA DE LA CAJA. Eran dos plataformas y un género FIJOS, medidos sobre la caja
   de 203 px útiles que había entonces. Luego fueron escalones por ancho, y se quedaban cortos: un escalón tiene
   que ir al peor caso —el género más largo del catálogo— así que a «PC · Switch», que ocupa un tercio de la
   ranura, le salía un «+1» con media ranura vacía al lado.
   Ahora se MIDE EL TEXTO, con la letra que ese tema le da al chip. Hubo un paso intermedio que lo estimaba por
   el número de letras (5,3 px cada una más 31 fijos, ajustado sobre cinco paletas) y funcionaba en casi todas;
   se cayó en «Inserte moneda», cuya Orbitron es bastante más ancha que la media, y metía en la ranura chips que
   no cabían. Un `canvas` mide la cadena exacta con la fuente exacta, así que el problema desaparece de raíz —y
   con él la diferencia entre una letra condensada y una ancha—.
   LA FUENTE SE LEE DEL PROPIO CHIP, una sola vez por render de la lista y no por caja: es la única manera de
   saber qué familia y qué tamaño le toca, porque eso lo decide el skin de cada tema. Mientras no hay ninguno en
   el DOM (el primer pintado) se usa la estimación de antes, que para entonces es lo bastante buena: en cuanto
   la lista existe, la siguiente vuelta ya mide. */
const CHIP_PX_POR_LETRA = 5.3;
const CHIP_PX_FIJO = 31;
/* Lo que la ranura le reserva al «+N» por CSS (`padding-right`), no lo que mide el chip: ahí va anclado. */
const CHIP_PX_MAS_N = 42;
const CHIP_GAP_PX = 6.4;
/* Relleno y filete del chip (`.chip`: .64 rem a cada lado más 1 px de borde), que es lo que hay que sumarle al
   texto medido. */
const CHIP_PX_MARCO = 22;

/** El `canvas` de medir, uno para toda la vida de la página: crear uno por medición es lo caro. */
let lienzoMedidor: CanvasRenderingContext2D | null = null;
/**
 * Lo que ocupa una cadena con la letra del tema. El ESPACIADO va aparte porque `measureText` NO lo cuenta:
 * varios skins separan las letras de sus chips (.04 em en «Cámara de pruebas» y en «Inserte moneda»), y ese
 * píxel por carácter era exactamente lo que hacía que un género largo asomara por el canto de su ranura.
 */
function anchoDelTexto(texto: string, fuente: string | null, espaciado = 0): number {
  if (!fuente) return texto.length * CHIP_PX_POR_LETRA + CHIP_PX_FIJO - CHIP_PX_MARCO;
  if (!lienzoMedidor) lienzoMedidor = document.createElement('canvas').getContext('2d');
  if (!lienzoMedidor) return texto.length * CHIP_PX_POR_LETRA + CHIP_PX_FIJO - CHIP_PX_MARCO;
  lienzoMedidor.font = fuente;
  return lienzoMedidor.measureText(texto).width + espaciado * texto.length;
}

/**
 * LA LETRA Y EL MARCO DEL CHIP tal y como los pinta el tema activo. Los dos se leen del DOM y no se suponen:
 * la familia la decide el skin (Orbitron en «Inserte moneda» es bastante más ancha que la media) y el relleno
 * también —las pegatinas de ese mismo tema y los carteles de «Plata y acero» llevan bastante más que el chip
 * de la casa—. Con el marco estimado a ojo, la cuenta metía en la ranura chips que no cabían, que es justo lo
 * que se veía cortado.
 * El marco se saca por diferencia: lo que mide el chip entero menos lo que mide su texto.
 */
function metricasDelChip(raiz: HTMLElement | null): { fuente: string; marco: number; espaciado: number } | null {
  const chip = raiz?.querySelector('.chip:not(.chip-more)');
  const texto = chip?.textContent?.trim();
  if (!chip || !texto) return null;
  const cs = getComputedStyle(chip);
  const fuente = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const espaciado = cs.letterSpacing.endsWith('px') ? parseFloat(cs.letterSpacing) : 0;
  /* El marco se saca por diferencia, y con el espaciado YA descontado: si se colase ahí, se aplicaría igual a
     un texto de cinco letras que a uno de veinticinco y el error crecería con la longitud. */
  const marco = chip.getBoundingClientRect().width - anchoDelTexto(texto, fuente, espaciado);
  /* Si la medida sale absurda (fuente aún sin cargar, chip oculto), se cae al marco de la casa. */
  return { fuente, espaciado, marco: marco > 4 && marco < 80 ? marco : CHIP_PX_MARCO };
}

function chipsQueCaben(
  valores: string[],
  ancho: number,
  metricas: { fuente: string; marco: number; espaciado: number } | null,
): { n: number; apretado: boolean } {
  if (!valores.length || ancho <= 0) return { n: 1, apretado: false };
  const marco = metricas?.marco ?? CHIP_PX_MARCO;
  /* UN SOLO VALOR TAMBIÉN SE MIDE. Antes salía de aquí sin mirar —«si solo hay uno, se pinta y ya»—, y eso
     dejaba sin marcar el caso más visible de todos: el juego que tiene un único género larguísimo
     («Coleccionista de criaturas») en una ranura que no le llega. No cabía, no había «+N» que lo avisara y
     tampoco se recortaba, así que el chip asomaba por el canto de la caja y se veía partido. */
  if (valores.length === 1) {
    return { n: 1, apretado: anchoDelTexto(valores[0], metricas?.fuente ?? null, metricas?.espaciado) + marco > ancho };
  }
  let usado = 0;
  let caben = 0;
  for (let i = 0; i < valores.length; i += 1) {
    const mide = anchoDelTexto(valores[i], metricas?.fuente ?? null, metricas?.espaciado) + marco + (i ? CHIP_GAP_PX : 0);
    /* Si después de éste todavía quedan, hay que reservarle sitio al «+N»: un contador que no se ve no
       cuenta nada, y era lo que se salía de la ranura en las cajas estrechas. */
    const reserva = i < valores.length - 1 ? CHIP_GAP_PX + CHIP_PX_MAS_N : 0;
    if (usado + mide + reserva > ancho) break;
    usado += mide;
    caben += 1;
  }
  /* SIEMPRE UNO, aunque no quepa: una ranura con solo el «+2» dentro no dice qué juego es. Pero entonces la
     ranura va APRETADA —«Coleccionista de criaturas» pide 172 px y en la densidad pequeña hay 157—, y ahí el
     único que puede ceder es el chip: se recorta con puntos suspensivos para que el «+N» siga viéndose. Es la
     excepción a que los chips no se encojan, y es al revés que el caso normal: aquí lo que sobra no es sitio,
     es texto. */
  return caben > 0 ? { n: caben, apretado: false } : { n: 1, apretado: true };
}
/** Los cuatro escalones del orden, de más a menos sitio. Ver el medidor de `GameTable`. */
type SortLayout = 'completo' | 'sin-rotulo' | 'apretado' | 'dos-lineas';

const GRID_GAP_PX = 10;
/* El mismo hueco, para la rejilla SIN carátulas: allí el `gap` sube a .9 rem (ver `_table.scss`), y esta
   cuenta tiene que usar el de verdad. Con los 10 px del otro, en los anchos justos salía una columna de
   más y las cajas quedaban por debajo de su mínimo — que es exactamente lo que este cálculo evita. */
const GRID_GAP_FLAT_PX = 14;

/** `tone`: tiñe cada píldora con el color que le toca a su nombre en la rampa categórica (`categoryTone`).
    Solo lo piden los géneros; el resto de categorías ya tienen un color con significado propio (la plataforma
    es neutra, los puntos fuertes verdes y los débiles rojos) y teñirlas rompería esa lectura. */
/**
 * ¿HAY QUE PEDIR CARÁTULA DE ESTE JUEGO? Devuelve su URL NORMAL —que es a la vez la que pide el mosaico y la
 * clave con la que se recuerda que un juego no tiene imagen— o `null` cuando no hay nada que pedir: porque la
 * preferencia está apagada, o porque en una visita anterior ya se supo que ese juego no tiene carátula. Lo
 * segundo es lo que evita repetir cada visita los mismos 404 —que no los cachea nadie, a propósito— por los
 * juegos que nunca van a tener imagen.
 *
 * Se pregunta SIEMPRE por la normal aunque luego se pida otro tamaño: la memoria se guarda por URL y el «no» de
 * un juego no depende de a qué resolución se le pida (si la normal dio 404, la ancha también lo dará).
 */
function coverBase(
  covers: boolean,
  game: GameItem,
  ampliado: boolean,
  plataformas: readonly string[],
): string | null {
  if (!covers) return null;
  const url = coverUrl(game.name, plataformas, ampliado);
  return sabemosQueNoTiene(url) ? null : url;
}

/** Cómo se pide la carátula de un juego en esta lista: la política de `coverPolicy`, ya traducida. */
interface PedidoDePortada {
  preferirConocidas: boolean;
  soloCache: boolean;
}

/**
 * CON QUÉ PLATAFORMAS SE PIDE LA CARÁTULA DE ESTE JUEGO, y si con la marca de «solo caché». Las suyas, salvo que
 * la lista pida reaprovechar lo ya descargado y de ese título conste una combinación anterior: entonces se usa
 * aquella, porque es la que tiene URL en la caché del navegador (ver `coverDone`). Se resuelve UNA vez por juego
 * y sirve para todos los tamaños.
 *
 * Un título conocido se pide además SIN `c=1` aunque la lista lo pida: lo resolvió el recorrido de tu propia
 * biblioteca, así que el servidor lo tiene y no hay nada que gastar, y la marca solo cambiaría la URL y obligaría
 * a descargar otra vez la misma imagen. Salvo en modo ampliado, que vive en otro espacio de claves y del que el
 * índice de conocidos no dice nada.
 */
function portadaDe(
  game: GameItem,
  ampliado: boolean,
  pedido: PedidoDePortada,
): { plataformas: readonly string[]; soloCache: boolean } {
  const conocidas = pedido.preferirConocidas ? plataformasYaPedidas(game.name) : null;
  return {
    plataformas: conocidas ?? game.platforms,
    soloCache: pedido.soloCache && !(conocidas && !ampliado),
  };
}

/**
 * Las dos URL que el mosaico ofrece juntas con `srcset` (ver `GameCover`), de UNA pasada: la de la ranura y la
 * de densidad doble.
 *
 * Que salgan juntas no es cosmético. Pedirlas por separado significaba llamar dos veces a una función que
 * construía DOS URL cada vez —la del tamaño y la normal para preguntar a la memoria—, o sea cuatro por caja y
 * por render; con las ~150 cajas que la rejilla mantiene montadas, son seiscientas en cada repintado del
 * listado. Aquí la normal se construye una vez y sirve para las dos cosas, y la de densidad doble ni se llega a
 * componer cuando ya se sabe que ese juego no tiene carátula.
 */
function coverDeCaja(
  covers: boolean,
  game: GameItem,
  ampliado: boolean,
  pedido: PedidoDePortada,
): { src: string | null; src2x: string | null } {
  const { plataformas, soloCache } = portadaDe(game, ampliado, pedido);
  const base = coverBase(covers, game, ampliado, plataformas);
  if (!base) return { src: null, src2x: null };
  return {
    // La normal sale ya compuesta de la memoria de «no tiene», que se guarda sin la marca: solo se rehace con ella.
    src: soloCache ? coverUrl(game.name, plataformas, ampliado, 'normal', true) : base,
    src2x: coverUrl(game.name, plataformas, ampliado, 'medio', soloCache),
  };
}

/** La del renglón: una sola, del tamaño con que se recorta la franja que cruza la fila. */
function coverDeRenglon(
  covers: boolean,
  game: GameItem,
  ampliado: boolean,
  grande: boolean,
  pedido: PedidoDePortada,
): string | null {
  const { plataformas, soloCache } = portadaDe(game, ampliado, pedido);
  if (!coverBase(covers, game, ampliado, plataformas)) return null;
  return coverUrl(game.name, plataformas, ampliado, grande ? 'ancho' : 'medio', soloCache);
}

function renderTags(values: string[], className: string, maxVisible?: number, tone = false) {
  /* EL HUECO CUANDO NO HAY DATO. Antes era un guion suelto, y en una rejilla de cajas eso se lee como un fallo;
     con clase propia el hueco se puede dejar TENUE y ocupando su sitio, que es lo que mantiene alineadas unas
     cajas con otras y unos renglones con otros aunque a un juego le falte la plataforma o el género. */
  if (!values.length) return <span className="chip-none" aria-hidden="true">—</span>;
  const overflow = maxVisible && values.length > maxVisible ? values.length - maxVisible : 0;
  const visible = overflow ? values.slice(0, maxVisible) : values;
  /* EL «+N» VA FUERA DEL GRUPO, no dentro. Es lo que permite que el desvanecido del final de la ranura —una
     máscara— se aplique SOLO a los chips: metido dentro, la máscara lo apagaba a él también, y el apaño de
     abrirle una ventana opaca al final resultó peor que la enfermedad, porque esa ventana atravesaba el chip
     que pasara por ahí y lo partía en seco. Fuera, la máscara no lo toca y no hay ventana que abrir. */
  return (
    <>
      <div className="chips">
        {visible.map((value) => (
          <span key={value} className={`chip ${className}`} style={tone ? categoryToneStyle(value) : undefined}>
            {value}
          </span>
        ))}
      </div>
      {overflow ? (
        <span className="chip chip-more" title={values.slice(maxVisible).join(', ')}>
          {UI_MESSAGES.table.moreCount(overflow)}
        </span>
      ) : null}
    </>
  );
}

/* Años del juego para pintar: siempre del más reciente al más antiguo, para que al quedarse con el primero
   —que es lo que hacen el renglón y la caja— salga el último completado y no el más viejo. */
function yearsDesc(years?: number[]) {
  return [...(years || [])].sort((a, b) => b - a).map(String);
}

const IMPORT_UI = UI_MESSAGES.import.integrations;

// Columnas ordenables: etiqueta de cabecera → clave de orden que entiende `sortGames`/`sortBy`.
// El resto de cabeceras (Puntos fuertes/débiles, Rejugar…) no son ordenables.
const SORT_COLUMN: Record<string, string> = {
  Juego: 'name',
  Año: 'years',
  Plataformas: 'platforms',
  Géneros: 'genres',
  Puntuación: 'score',
  Interés: 'score',
};

// `role="img"` NO es decorativo aquí, es lo que hace que la insignia se anuncie. Un `<span>` sin rol es
// `generic`, y ARIA PROHÍBE ponerle nombre: el `aria-label` se descartaba y estas celdas —la única
// presentación de "rejugar" y "otra oportunidad"— quedaban mudas para un lector de pantalla, con el icono
// `aria-hidden` dentro y nada más. Lo destapó la auditoría con axe sobre el render (`tests/e2e/a11y.test.ts`);
// el linter no puede verlo porque depende del rol que resulta al pintar, no del JSX.
function renderBooleanBadge(type: 'replayable' | 'retry', value: boolean) {
  if (type === 'replayable') {
    const label = value ? 'Rejugar: Sí' : 'Rejugar: No';
    return (
      <span className={value ? 'badge-rejugar-activo' : 'badge-rejugar-inactivo'} role="img" aria-label={label} title={label}>
        <Icon name={value ? COMMON_ICONS.starOliveBranches : COMMON_ICONS.lock} />
      </span>
    );
  }

  const label = value ? 'Dar otra oportunidad: Sí' : 'Dar otra oportunidad: No';
  return (
    <span className={value ? 'badge-opp-activo' : 'badge-opp-inactivo'} role="img" aria-label={label} title={label}>
      <Icon name={value ? COMMON_ICONS.refresh : COMMON_ICONS.lock} />
    </span>
  );
}

/* Cuántas filas nuevas como mucho se animan a la vez. Una o dos son "acabo de añadir un juego"; treinta son una
   importación o un cambio de filtro, y treinta filas deslizándose a la vez no es una confirmación, es un mareo. */
const MAX_ENTERING_ROWS = 4;
/* Lo que se tarda en olvidar que una fila era nueva. Un pelo más que la animación (`rowEnter`, 260 ms) para que
   no se corte si el navegador va justo de fotogramas. */
const ENTERING_CLEAR_MS = 400;

/**
 * Ids de los juegos que ACABAN DE LLEGAR a la lista que se está viendo.
 *
 * Se calcula comparando con los ids del render anterior, y no se pasa desde fuera, porque a un listado se llega
 * por muchas puertas —guardar en el formulario, graduar un importado, la ruleta, "añadir a próximos" desde el
 * perfil de otra persona, mover de lista— y todas acaban en lo mismo: un id que antes no estaba. Mirar el dato
 * las cubre todas sin que ninguna tenga que acordarse de avisar.
 *
 * NO SE ANIMA AL CAMBIAR DE PESTAÑA: ahí los ids son otros porque la lista es otra, no porque hayan llegado; de
 * eso se encarga la entrada de pantalla completa (`useScreenTransition`). Tampoco se anima una llegada masiva
 * (ver `MAX_ENTERING_ROWS`).
 *
 * Un cambio de FILTRO sí puede devolver a la lista juegos que ya estaban en la biblioteca (borrar una letra del
 * buscador), y esos se animan como llegadas. Es deliberado: para quien mira, esas filas acaban de aparecer.
 */
function useEnteringRows(games: GameItem[], currentTab: TabId): ReadonlySet<number> {
  const [entering, setEntering] = useState<ReadonlySet<number>>(() => new Set<number>());
  const previousRef = useRef<{ tab: TabId; ids: Set<number> } | null>(null);

  useEffect(() => {
    const ids = new Set(games.map((game) => game.id));
    const previous = previousRef.current;
    previousRef.current = { tab: currentTab, ids };

    // Primer pintado y cambio de pestaña: no hay "antes" con el que comparar (o el de antes era otra lista).
    if (!previous || previous.tab !== currentTab) return;

    const added = [...ids].filter((id) => !previous.ids.has(id));
    if (added.length === 0 || added.length > MAX_ENTERING_ROWS) return;

    setEntering(new Set(added));
    // Esto vuelve a disparar el efecto, pero en esa pasada `previousRef` ya tiene los mismos ids, así que no hay
    // ninguna llegada nueva y se sale por el `return` de arriba. No hay bucle.
    const temporizador = window.setTimeout(() => setEntering(new Set<number>()), ENTERING_CLEAR_MS);
    return () => window.clearTimeout(temporizador);
  }, [games, currentTab]);

  return entering;
}

export const GameTable = memo(function GameTable({
  games,
  currentTab,
  expandedId,
  onExpandedChange,
  onEdit,
  onDelete,
  onMigrate,
  onAddGame,
  onImportLibrary,
  inboxCount = 0,
  onOpenInbox,
  tabActions,
  readOnly = false,
  coverPolicy,
  sort,
  onSort,
  visibility,
  recentlyChangedId = null,
  removingId = null,
}: GameTableProps) {
  const enteringIds = useEnteringRows(games, currentTab);
  const showYears = visibility?.showYears ?? true;
  const showReplayable = visibility?.showReplayable ?? true;
  const showRetry = visibility?.showRetry ?? true;
  const showHours = visibility?.showHours ?? true;
  const showReview = visibility?.showReview ?? true;

  // ¿Tiene este juego una nota que mostrar? En la vergüenza la puntuación es OPT-IN (el check del formulario), y
  // los no puntuados se guardan con nota 0, así que basta con mirar la nota efectiva. Se comprueba así, y no por
  // el flag `scored`, porque los juegos guardados ANTES de que ese flag existiera tienen nota pero no flag: con
  // `scored` se les ocultaría una nota que sí pusieron.
  const hasScore = (game: GameItem) => resolveGrade(game) > 0;

  // La columna de puntuación de la vergüenza solo aparece si ALGÚN juego de la lista tiene nota. Como la
  // puntuación ahí es opcional, a quien no la use una columna permanentemente vacía le sobraría; y quien sí la
  // use la ve en cuanto puntúa el primero. Es el mismo patrón que `showYears`/`showReplayable`, pero decidido por
  // los datos en vez de por una preferencia.
  const showShameScore = useMemo(
    () => currentTab === 'v' && games.some((game) => resolveGrade(game) > 0),
    [currentTab, games],
  );

  /* QUÉ DATOS LLEVA ESTA LISTA, en el orden en el que se ven. Era la lista de cabeceras de la tabla, y de ahí
     los nombres; hoy la tabla no tiene cabeceras —ni columnas— y lo único que queda de aquello es esto: la
     fuente de la que salen los chips de ordenar. Se conserva la lista COMPLETA, con los datos que no se pueden
     ordenar («Puntos fuertes», «Rejugar»…), porque el filtro por `SORT_COLUMN` de más abajo es quien decide, y
     tenerlos aquí documenta qué enseña cada pestaña. */
  const getTableHeaders = (): string[] => {
    if (currentTab === 'c') {
      return [
        'Juego',
        ...(showYears ? ['Año'] : []),
        'Plataformas',
        'Géneros',
        'Puntos fuertes',
        'Puntos débiles',
        'Puntuación',
        ...(showReplayable ? ['Rejugar'] : []),
      ];
    }
    if (currentTab === 'v') {
      return [
        'Juego',
        'Plataformas',
        'Géneros',
        'Puntos fuertes',
        'Puntos débiles',
        ...(showShameScore ? ['Puntuación'] : []),
        ...(showRetry ? ['Dar otra oportunidad'] : []),
      ];
    }
    if (currentTab === 'e') return ['Juego', 'Plataformas', 'Géneros', 'Puntos fuertes', 'Puntos débiles'];
    return ['Juego', 'Plataformas', 'Géneros', 'Interés'];
  };

  const supportsReview = (tab: TabId) => tab !== 'p';

  // Por debajo de `COMPACT_TABLE_MAX_WIDTH` no cabe una fila de tabla, se pinte lo que se pinte. Se calcula
  // aquí y no con un listener propio porque este efecto ya escucha `resize` y observa el `<body>`: es
  // exactamente el momento en el que puede haber cambiado.
  const [narrowScreen, setNarrowScreen] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= COMPACT_TABLE_MAX_WIDTH,
  );

  /* LA FORMA DEL LISTADO (F5). La elige quien mira —renglones o mosaico— y se respeta en CUALQUIER pantalla;
     ya no hay un ancho por debajo del cual la app decide otra cosa por su cuenta. Lo que el ancho cambia es
     cuánto cabe dentro de cada pieza: el renglón apila sus dos líneas y los chips se topan antes con el «+N»,
     y el mosaico reparte menos columnas.
     Antes esto lo decidía SOLO el ancho, y en dos idiomas a la vez: este componente (para estimar la altura de
     la fila) y una media query de `_table.scss` (para ocultar las columnas). Ahora lo decide un sitio y el CSS
     obedece a la clase `is-cards`, que es lo que permite que la forma sea una preferencia y no un breakpoint. */
  const { shape, setShape } = useListShape();
  /* Apagada por defecto: sin encenderla, `src` va vacío, no se pide ninguna imagen y la caja se queda con su
     portada de casa. Es la preferencia la que autoriza a que el servidor consulte los títulos en IGDB.
     Y la preferencia solo decide DENTRO de lo que esta lista permite (ver `allowCovers`): en la biblioteca de
     otra persona hoy no se piden carátulas salvo para el rango que las tiene desbloqueadas, porque ahí cada
     perfil visitado es un catálogo nuevo que resolver. El día que se abra a todos, esta línea no cambia: basta
     con que quien monta la tabla deje de restringirlo y vuelve a mandar el check. */
  const { covers: coversPreferidas } = useCovers();
  const covers = coversPreferidas && (coverPolicy?.allowed ?? true);
  const pedidoDePortada: PedidoDePortada = {
    preferirConocidas: coverPolicy?.preferKnown ?? false,
    soloCache: coverPolicy?.cachedOnly ?? false,
  };
  /* TAMAÑO DE LOS CUADROS, elegido en la cabecera del listado. Solo cambia cuántas columnas caben; el contenido
     de cada cuadro es el mismo, que es lo que evita tener tres diseños que mantener. */
  const { size: gridSize, setSize: setGridSize } = useGridSize();
  /* Modo ampliado de las carátulas: solo la cuenta de administración. No es una mejora —admite DLC, packs y
     mods, que dan PEORES emparejamientos— sino una lente para ver qué hay en el catálogo. Su respuesta vive en
     un espacio de caché aparte, así que encenderla no le cambia la carátula a nadie más. */
  const coversAmpliadas = useIsAdmin();
  /* LA RESOLUCIÓN DE LA FRANJA, y por qué no es la misma para todo el mundo. La portada a 1080p pesa unos 150 kB
     por juego y la de 720, unos 80: recorrer una biblioteca de trescientos son 45 MB contra 24. Y la diferencia
     no se ve: se compararon las dos recortadas en la franja y con su velo encima, y a 151 px de alto con el 90 %
     de la superficie del tema delante, el detalle que aporta doblar los píxeles no llega a la pantalla. Así que
     la grande deja de ser lo normal y pasa a ser lo que se lleva MITHRIL, que es el rango que paga la factura de
     los privilegios (ver `PROFILE_TIER_*` en `constants/tiers`).
     Se resuelve con `useIsAdmin` y no leyendo el perfil porque hoy son lo mismo: `ADMIN_ONLY_TIER` es mithril y
     el panel solo ofrece ese rango en la fila del propio administrador. Leer el perfil aquí costaría una lectura
     de Firestore en el listado a todo el mundo, incluido quien no ha abierto el hub social en su vida. Si algún
     día mithril se le concede a alguien más, ESTA línea es la que hay que cambiar.
     Y como el modo ampliado: el tamaño viaja en la URL, así que se puede falsificar. Falsificarlo solo te cuesta
     bytes a ti, y el cupo por IP sigue acotando el gasto de resolver. */
  const franjaGrande = coversAmpliadas;
  /* El MOSAICO también vale en un teléfono: sus columnas salen del mismo mínimo de caja que en escritorio (a
     412 px caben dos), así que elegir «cajas» en el móvil ya no revierte a renglones sin avisar. */
  const cards = shape === 'list';
  /* COLUMNAS DEL MOSAICO. Se mide el contenedor y se divide, que es la misma cuenta que hará el `minmax` del
     CSS; hacerlo aquí es lo que permite que el virtualizador siga midiendo FILAS de verdad (una fila virtual =
     una fila de cajas) en vez de creer que cada caja va en su propio renglón, que es lo que descuadraría la
     barra de desplazamiento en una biblioteca de mil juegos. */
  const [gridWidth, setGridWidth] = useState(0);
  const cajaMin = (narrowScreen
    ? (covers ? GRID_CARD_MIN_NARROW_PX : GRID_CARD_MIN_FLAT_NARROW_PX)
    : (covers ? GRID_CARD_MIN_PX : GRID_CARD_MIN_FLAT_PX))[gridSize];
  const gridGap = covers ? GRID_GAP_PX : GRID_GAP_FLAT_PX;
  const gridColumns = Math.max(1, Math.floor((gridWidth + gridGap) / (cajaMin + gridGap)) || 1);
  /* EL ANCHO DE UNA CAJA, que es lo que decide cuántos chips caben en sus ranuras. Sale de la misma cuenta que
     las columnas —el ancho medido menos los huecos, partido entre las columnas— y no de medir una caja: medirla
     obligaría a leer el layout DESPUÉS de pintarlo, y el primer pintado saldría con el reparto equivocado.
     Se le descuenta el relleno del cuerpo (.95 rem a cada lado), porque el hueco donde de verdad entran los
     chips es el de dentro. */
  const anchoCaja = gridWidth > 0 ? (gridWidth - gridGap * (gridColumns - 1)) / gridColumns : 0;
  /* El hueco donde de verdad entran los chips: la caja menos el relleno del cuerpo (.95 rem a cada lado). */
  const anchoRanuraCaja = Math.max(0, anchoCaja - 30.4);
  /* ── LO QUE CABE EN CADA RANURA DEL RENGLÓN ──────────────────────────────────────────────────────────
     El renglón es UNO SOLO a cualquier ancho —misma cabecera, mismas ranuras— y lo único que cambia con el
     sitio disponible es CUÁNTOS chips caben antes del «+N». Antes había dos marcados distintos (la línea ancha
     y un meta compacto para el teléfono), y mantener dos versiones de lo mismo es lo que hacía que la lista y
     la app móvil se parecieran cada vez menos.

     Y lo que cabe se MIDE, igual que en la caja, en vez de toparse en un número: los topes tienen que ir al
     peor caso —el género más largo del catálogo— y por eso dejaban media ranura vacía en unas filas y se
     pasaban en otras, que es lo que se veía como chips partidos por la mitad.
     LOS PESOS SON LOS DEL CSS (`.row-cats` y `.row-notes` en `_table.scss`, sobre un total de 4,3 fr): es el
     único sitio donde este componente tiene números que casar con la hoja, y está así porque el reparto de esa
     rejilla no se puede conocer desde aquí sin leer el layout ya pintado. Si cambian allí, cambian aquí.
     En el TELÉFONO la rejilla es otra —el año mide 6,6 rem y el género ocupa su propia línea— así que las
     medidas también. ── */
  const anchoRenglon = Math.max(0, gridWidth - 35);
  const anchoCol = (peso: number) => anchoRenglon * (peso / 4.3) - 16;
  const anchoCatYear = narrowScreen ? 106 : anchoCol(1.1);
  const anchoCatPlat = narrowScreen ? Math.max(0, anchoRenglon - 120) : anchoCol(1);
  const anchoCatGenre = narrowScreen ? anchoRenglon : anchoCol(2.2);
  /* Los dos recuadros de la opinión, con el mismo criterio. Del ancho de su columna se descuentan el relleno
     del recuadro y su filete (unos 18 px). */
  const anchoNotaBuena = anchoCol(1.25) - 2;
  const anchoNotaMala = anchoCol(2.55) - 2;
  /* Próximos es la única lista sin opinión: todavía no se ha jugado a nada, así que el recuadro no existe en
     vez de salir con las dos mitades vacías. En la vergüenza el lado malo son los MOTIVOS de dejarlo. */
  const tieneOpinion = currentTab === 'c' || currentTab === 'v' || currentTab === 'e';

  // Create virtual rows (main + optionally detail rows)
  const virtualRows = useMemo(() => {
    const rows: VirtualRow[] = [];
    if (shape === 'grid') {
      /* MOSAICO: los juegos se reparten en filas de `gridColumns` cajas y cada fila es UNA fila virtual. El
         detalle abierto se cuela justo detrás de la fila que contiene su caja —no detrás de la caja—, que es
         donde el ojo lo espera: se despliega a lo ancho, debajo del renglón de cajas que se ha pulsado. */
      for (let i = 0; i < games.length; i += gridColumns) {
        const bloque = games.slice(i, i + gridColumns);
        rows.push({ type: 'grid', gameId: bloque[0].id, index: i, ids: bloque.map((g) => g.id) });
        const abierto = bloque.find((g) => g.id === expandedId);
        if (abierto) rows.push({ type: 'detail', gameId: abierto.id, index: i });
      }
      return rows;
    }
    games.forEach((game, index) => {
      rows.push({ type: 'main', gameId: game.id, index });
      if (expandedId === game.id) {
        rows.push({ type: 'detail', gameId: game.id, index });
      }
    });
    return rows;
  }, [games, expandedId, shape, gridColumns]);

  const parentRef = useRef<HTMLDivElement>(null);
  /* La letra y el relleno del chip en el tema activo, leídos del DOM UNA VEZ por render de la lista (no por
     caja). Se miran en cada vuelta a propósito: cambiar de paleta cambia las dos cosas, y ese cambio no pasa
     por este componente. */
  const metricasChip = metricasDelChip(parentRef.current);

  // QUIÉN SCROLLEA DE VERDAD. Hay dos virtualizadores y no son intercambiables: el de elemento necesita un
  // contenedor que scrollee, y apuntado a uno que no scrollea toma como viewport TODO el contenido y pinta todas
  // las filas (justo lo que se quería evitar).
  //
  // Se mide, no se deduce del CSS. Antes se leía `overflow-y === 'visible'` y eso daba dos falsos negativos:
  //  - en móvil/tablet `.table-wrap` es `overflow:visible` → se detectaba bien, pero el código renderizaba la
  //    tabla ENTERA a propósito (sin virtualizador de ventana): las bibliotecas grandes pintaban miles de filas
  //    precisamente en los dispositivos más lentos;
  //  - en escritorio es `overflow-y:auto` pero SIN altura acotada (es un `flex:1 1 auto` cuyo padre no limita la
  //    altura), así que su `clientHeight` es la tabla completa y tampoco scrollea nunca. Se detectaba como
  //    "scrollea el contenedor" y el virtualizador de elemento se quedaba sin efecto: también pintaba todo.
  // Resultado: la virtualización no estaba haciendo nada en ninguno de los dos casos. `scrollHeight >
  // clientHeight` distingue el caso real y sigue valiendo si algún día se acota la altura por CSS.
  const [pageScrolls, setPageScrolls] = useState(true);
  // Desplazamiento del inicio de la tabla dentro del documento: el virtualizador de ventana trabaja en
  // coordenadas de página, así que sin esto sus posiciones vendrían corridas por la altura de lo que hay encima
  // (barra de pestañas, toolbar, filtros abiertos…).
  const [scrollMargin, setScrollMargin] = useState(0);
  /* Ver el observador de abajo: un cambio de paleta cambia la letra de los chips y hay que rehacer la cuenta. */
  const [, setPaletaTick] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      setNarrowScreen(window.innerWidth <= COMPACT_TABLE_MAX_WIDTH);
      const el = parentRef.current;
      if (!el) return;
      setGridWidth(el.clientWidth);
      setPageScrolls(el.scrollHeight <= el.clientHeight + 1);
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };
    update();
    window.addEventListener('resize', update);
    // La toolbar y el panel de filtros cambian de alto sin que la tabla se entere (abrir filtros, envolver
    // chips): eso mueve el inicio de la tabla, así que hay que recalcular el margen cuando el layout cambia.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(document.body);
    /* CAMBIAR DE PALETA CAMBIA LA LETRA, y con ella cuántos chips caben en una ranura (`chipsQueCaben` mide el
       texto con la fuente del tema). Ese cambio es un atributo en el `<html>` y no pasa por este componente,
       así que sin esto la lista se quedaba con el reparto de la letra ANTERIOR hasta el siguiente render: al
       pasar de una condensada a una ancha —de «Forja y temple» a «Inserte moneda»— se quedaban catorce chips
       sobresaliendo de su ranura. `paletaTick` solo existe para forzar la vuelta. */
    const skinObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => setPaletaTick((n) => n + 1))
      : null;
    skinObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
      skinObserver?.disconnect();
    };
  }, []);

  // Por debajo de este número de filas se pinta la tabla entera aunque scrollee la página: virtualizar tiene su
  // propio coste (medición, spacers, re-render al scrollear) y con pocas filas no compensa. También mantiene el
  // comportamiento exacto de siempre en listas cortas, que son la mayoría.
  const WINDOW_VIRTUALIZE_MIN_ROWS = 120;

  // Clave ESTABLE por fila lógica (tipo + id), no por índice: al expandir/plegar el detalle se inserta/quita una
  // fila y TODOS los índices posteriores se desplazan. Sin clave estable, el virtualizador reasigna las alturas
  // cacheadas por índice a filas distintas (una fila normal ~50px hereda la altura de un detalle ~320px, o al
  // revés) → el tamaño total se infla, aparecen huecos y filas inalcanzables al final. Con la clave, cada fila
  // conserva su medida al cambiar de posición. Compartida por los dos virtualizadores.
  const getItemKey = useCallback(
    (index: number) => {
      const row = virtualRows[index];
      return row ? `${row.type}-${row.gameId}` : index;
    },
    [virtualRows],
  );
  // ESTIMACIÓN DE ALTURA. Solo la usa el virtualizador para las filas que todavía no ha medido, pero de ella
  // depende el tamaño total que declara: con la estimación equivocada la barra de desplazamiento nace corta y se
  // recalibra a saltos mientras el usuario baja, y `measureElement` remide sin parar (199 ms de reflujo forzado
  // en el arranque con una biblioteca de 1.500 juegos).
  //
  // El valor de siempre —50— era el de la fila de tabla de ESCRITORIO, y se aplicaba también en móvil, donde la
  // fila es una tarjeta de unos 74 px: el total salía un 14 % corto. Por eso ahora depende de `compactRows`.
  const estimateSize = useCallback(
    (index: number) =>
      virtualRows[index]?.type === 'detail'
        ? DETAIL_ROW_ESTIMATE_PX
        : virtualRows[index]?.type === 'grid'
          ? (covers ? GRID_ROW_ESTIMATE_PX[gridSize] : GRID_ROW_FLAT_ESTIMATE_PX)
          : narrowScreen
            ? COMPACT_ROW_ESTIMATE_PX
            : MAIN_ROW_ESTIMATE_PX,
    [virtualRows, narrowScreen, covers, gridSize],
  );
  const measureElement = useCallback((element: Element) => element.getBoundingClientRect().height, []);

  const elementVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => parentRef.current,
    measureElement,
    getItemKey,
    estimateSize,
    overscan: 5,
  });

  const windowVirtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    measureElement,
    getItemKey,
    estimateSize,
    scrollMargin,
    overscan: 5,
  });

  // Al cruzar el umbral compacto cambia la altura de TODAS las filas a la vez (de fila de tabla a tarjeta), así
  // que las medidas ya guardadas dejan de valer. Sin este reinicio el virtualizador conserva el tamaño total del
  // ancho anterior —cambiar `estimateSize` no invalida lo ya calculado— y la barra de desplazamiento se queda
  // descuadrada hasta recargar. Solo pasa al redimensionar la ventana cruzando el umbral: quien entra desde un
  // móvil ya arranca con la estimación correcta.
  // La guarda NO es defensiva de más: `measure()` tira las medidas ya tomadas, y en el montaje eso llega justo
  // después de que se midan las primeras filas. El resultado era un reinicio gratuito con la lista ya pintada
  // (CLS de 0,10 en una biblioteca de 1.500 juegos). Aquí solo interesa el CAMBIO de umbral, nunca el arranque.
  /* Lo mismo vale para la preferencia de CARÁTULAS: encenderla o apagarla con el mosaico abierto cambia la
     altura de todas las cajas a la vez (la ranura 3:4 aparece o desaparece), y las medidas ya tomadas dejan de
     valer igual que al cruzar el umbral compacto. */
  const lastCompactRef = useRef(`${narrowScreen}-${covers}-${gridSize}`);
  useLayoutEffect(() => {
    const ahora = `${narrowScreen}-${covers}-${gridSize}`;
    if (lastCompactRef.current === ahora) return;
    lastCompactRef.current = ahora;
    elementVirtualizer.measure();
    windowVirtualizer.measure();
  }, [narrowScreen, covers, gridSize, elementVirtualizer, windowVirtualizer]);

  const useWindowScroller = pageScrolls && virtualRows.length >= WINDOW_VIRTUALIZE_MIN_ROWS;
  const virtualize = !pageScrolls || useWindowScroller;
  const virtualizer = useWindowScroller ? windowVirtualizer : elementVirtualizer;
  // El virtualizador de ventana devuelve posiciones ABSOLUTAS del documento; los spacers son relativos al inicio
  // de la tabla, así que hay que descontar el margen. El de elemento ya trabaja en coordenadas del contenedor.
  const originOffset = useWindowScroller ? scrollMargin : 0;

  const virtualRowEntries = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const topSpacerHeight = virtualRowEntries.length > 0 ? virtualRowEntries[0].start - originOffset : 0;
  const bottomSpacerHeight =
    virtualRowEntries.length > 0 ? totalSize - (virtualRowEntries[virtualRowEntries.length - 1].end - originOffset) : 0;
  // Red de seguridad: si el virtualizador elegido no devuelve nada habiendo filas (medidas degeneradas, entorno
  // sin layout), se pinta todo antes que dejar la tabla vacía.
  const fallbackToFullRender =
    !virtualize || (games.length > 0 && virtualRows.length > 0 && virtualRowEntries.length === 0);
  const rowIndexesToRender = fallbackToFullRender
    ? virtualRows.map((_, index) => index)
    : virtualRowEntries.map((entry) => entry.index);

  const gameMap = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const tableHeaders = getTableHeaders();

  // ¿Esta lista tiene COLUMNA de puntuación? Mismo criterio que las cabeceras de escritorio: Completados y
  // Próximos siempre, la vergüenza solo si algún juego está puntuado, En curso nunca. En la vista de tarjeta
  // decide dos cosas del meta compacto: si se reserva la columna de la nota —se reserva aunque un juego
  // concreto no la tenga, o las filas de la misma lista dejarían de estar alineadas entre sí— y, cuando no la
  // hay, que su sitio lo ocupen los puntos fuertes.
  const hasScoreColumn = currentTab === 'c' || currentTab === 'p' || (currentTab === 'v' && showShameScore);
  // La escala (F2) cambia el ANCHO de esa columna: cinco estrellas ocupan bastante más que el aro de la nota.
  const scoreScale = useScoreScale();
  const tableClass = [
    `list-${currentTab}`,
    // La FORMA, decidida arriba: con `is-cards` cada fila es una tarjeta y las columnas desaparecen; con
    // `is-grid`, cada fila es un renglón de cajas.
    shape === 'grid' ? 'is-grid' : '',
    cards ? 'is-cards' : '',
    /* ¿Esta lista pinta la ranura del año? Lo necesita el CSS para darle su columna en el reparto: si la
       reservara siempre, Próximos y En curso empezarían con un hueco vacío del ancho de tres años. */
    currentTab === 'c' && showYears ? 'has-year' : '',
    hasScoreColumn ? 'meta-score' : '',
    scoreScale === 'grade' ? 'meta-grade' : '',
  ].filter(Boolean).join(' ');

  /* EL ORDEN, fuera de las cabeceras. En las formas nuevas no hay fila de cabeceras que pulsar —es justo lo
     que las hacía parecer una hoja de cálculo—, así que el orden se dice con palabras: qué columna y en qué
     sentido. Se pinta solo si esta lista se puede ordenar (el listado del hub social llega sin `onSort`). */
  const sortableColumns = tableHeaders
    .map((header) => ({ header, key: SORT_COLUMN[header] }))
    .filter((c): c is { header: string; key: string } => Boolean(c.key));
  /**
   * EL ORDEN, SIN CARRIL QUE ARRASTRAR. Las cinco columnas no caben en un teléfono y hasta ahora sobraba
   * desplazándolas de lado: en la práctica eso esconde opciones —nadie arrastra una fila que no parece
   * arrastrable— y deja «Puntuación» partida por el canto, que se lee como un fallo de pintado.
   *
   * ASÍ QUE SE CEDE POR ORDEN DE IMPORTANCIA, como hace la barra inferior con sus rótulos:
   *   · primero se va la palabra «Ordenar», que es la única que no es una opción: el grupo ya se anuncia con
   *     ese mismo nombre (`aria-label`), así que quien lo oye no pierde nada y quien lo ve tampoco —cinco
   *     columnas en fila, con una en el color del acento, se leen como un orden sin que nadie lo diga—;
   *   · si aún no caben, los chips bajan un punto de cuerpo;
   *   · y si tampoco —de 360 px para abajo no hay manera—, se PARTEN EN DOS LÍNEAS. Es la única salida que
   *     sigue enseñándolas todas; cuesta un renglón de alto en las pantallas más estrechas y a cambio no
   *     esconde ninguna opción detrás de un arrastre que nadie adivina.
   *
   * SE MIDE, NO SE ESTIMA, y por el mismo motivo que allí: lo que ocupan cinco palabras cambia con el idioma,
   * con la letra del tema y con el ajuste de mayúsculas. Cada pasada mide lo que HAY PINTADO y solo decide el
   * escalón siguiente; los anchos que hacen falta para volver a subir se guardan cuando se han podido medir de
   * verdad, que es la única forma de que el escalón no sea un pestillo de un solo sentido.
   */
  const sortRef = useRef<HTMLDivElement>(null);
  const [sortLayout, setSortLayout] = useState<SortLayout>('completo');
  const sortLayoutRef = useRef<SortLayout>('completo');
  /** Lo que pide cada escalón cuando se ha podido medir con sus piezas a la vista y en una sola línea. */
  const sortNeedsRef = useRef({ rotulo: 0, chips: 0, apretado: 0 });

  useLayoutEffect(() => {
    const nodo = sortRef.current;
    if (!nodo) return;

    const aplicar = (siguiente: SortLayout) => {
      sortLayoutRef.current = siguiente;
      setSortLayout(siguiente);
    };

    const medir = () => {
      const carril = nodo.querySelector<HTMLElement>('.list-sort-chips');
      if (!carril) return;
      // Sin medidas reales (jsdom, o aún sin pintar) se deja como está: mejor entero que recortado a ciegas.
      const disponible = nodo.clientWidth;
      if (!disponible) return;

      // El escalón que de verdad está pintado, leído de las clases: `aplicar` solo PIDE el cambio.
      const pintado: SortLayout = nodo.classList.contains('is-en-dos-lineas')
        ? 'dos-lineas'
        : nodo.classList.contains('is-apretado')
          ? 'apretado'
          : nodo.classList.contains('is-sin-rotulo') ? 'sin-rotulo' : 'completo';
      if (pintado !== sortLayoutRef.current) {
        requestAnimationFrame(medir);
        return;
      }

      const rotulo = nodo.querySelector<HTMLElement>('.list-sort-label');
      const hueco = parseFloat(getComputedStyle(nodo).columnGap) || 0;
      if (pintado === 'completo' && rotulo) sortNeedsRef.current.rotulo = rotulo.offsetWidth + hueco;
      // Los anchos solo valen medidos EN UNA LÍNEA: en `dos-lineas` el carril envuelve y su `scrollWidth` ya
      // no dice lo que pide el contenido, sino lo que mide la caja.
      if (pintado === 'completo' || pintado === 'sin-rotulo') sortNeedsRef.current.chips = carril.scrollWidth;
      if (pintado === 'apretado') sortNeedsRef.current.apretado = carril.scrollWidth;

      const desborda = carril.scrollWidth > carril.clientWidth + 1;
      if (desborda) {
        if (pintado === 'completo') { aplicar('sin-rotulo'); requestAnimationFrame(medir); return; }
        if (pintado === 'sin-rotulo') { aplicar('apretado'); requestAnimationFrame(medir); return; }
        if (pintado === 'apretado') { aplicar('dos-lineas'); requestAnimationFrame(medir); return; }
        return; // ya está partido en dos líneas: no queda nada que ceder.
      }

      // Y SE PUEDE VOLVER A SUBIR al ensanchar la ventana, con el ancho guardado del escalón de arriba.
      const sobra = carril.clientWidth - carril.scrollWidth;
      if (pintado === 'dos-lineas') {
        if (sortNeedsRef.current.apretado && carril.clientWidth >= sortNeedsRef.current.apretado) {
          aplicar('apretado');
          requestAnimationFrame(medir);
        }
        return;
      }
      if (pintado === 'apretado' && sortNeedsRef.current.chips && carril.clientWidth >= sortNeedsRef.current.chips) {
        aplicar('sin-rotulo');
        requestAnimationFrame(medir);
        return;
      }
      if (pintado === 'sin-rotulo' && sobra >= sortNeedsRef.current.rotulo) {
        aplicar('completo');
        requestAnimationFrame(medir);
      }
    };

    medir();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => medir()) : null;
    if (observer) observer.observe(nodo);
    else window.addEventListener('resize', medir);
    // La letra del tema llega tarde y cambia lo que miden las palabras: cuando llega, se vuelve a decidir.
    const alCargarLaLetra = () => { aplicar('completo'); requestAnimationFrame(medir); };
    document.fonts?.addEventListener?.('loadingdone', alCargarLaLetra);

    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', medir);
      document.fonts?.removeEventListener?.('loadingdone', alCargarLaLetra);
    };
  }, [sortableColumns.length]);

  const showSortBar = Boolean(onSort) && sortableColumns.length > 0 && (cards || shape === 'grid');

  return (
    <div className="table-wrap" ref={parentRef}>
      {/* LA CABECERA DEL LISTADO. Antes eran dos controles sueltos y en dos sitios distintos: el conmutador de
          forma metido entre los filtros —donde parecía un filtro más— y el orden colgando encima de la primera
          fila. Ahora son UNA pieza, la que abre la lista: a la izquierda qué se está viendo (el recuento, que
          es el resultado de los filtros de arriba) y por dónde está ordenado; a la derecha, cómo se ve. Lleva
          la misma superficie y el mismo canto que las filas, así que se lee como parte del listado y no como
          algo apoyado encima. */}
      {showSortBar ? (
        <div className="list-head">
          <span className="list-head-count">{UI_MESSAGES.toolbar.listCount(games.length)}</span>
          {/* EL ORDEN, EN CHIPS. Era un desplegable del sistema con un botón de flecha al lado: dos controles
              ajenos al resto de la interfaz para una sola decisión, y había que abrir el uno para saber por
              qué estaba ordenada la lista. Ahora las opciones están A LA VISTA, en las mismas píldoras que ya
              usa todo lo demás; la activa se rellena con el acento y lleva la punta que dice el sentido, y
              volver a pulsarla lo invierte. */}
          <div
            className={`list-sort${sortLayout !== 'completo' ? ' is-sin-rotulo' : ''}${sortLayout === 'apretado' || sortLayout === 'dos-lineas' ? ' is-apretado' : ''}${sortLayout === 'dos-lineas' ? ' is-en-dos-lineas' : ''}`}
            role="group"
            aria-label={UI_MESSAGES.toolbar.sortLabel}
            ref={sortRef}
          >
            {/* El rótulo no se borra: se aparta de la vista. Sigue en el DOM para poder MEDIRLO cuando haya
                sitio otra vez —si se quitara, no habría con qué decidir volver a enseñarlo—. */}
            <span className="list-sort-label" aria-hidden="true">{UI_MESSAGES.toolbar.sortLabel}</span>
            <div className="list-sort-chips">
            {sortableColumns.map(({ header, key }) => {
              const activa = (sort?.col ?? sortableColumns[0].key) === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`list-sort-chip${activa ? ' is-on' : ''}${activa && sort?.asc ? ' is-asc' : ''}`}
                  // La activa se anuncia con el sentido incluido («Puntuación. De mayor a menor…»), que es lo
                  // que decía el botón de dirección que había aquí antes; el resto, con qué haría pulsarla.
                  aria-pressed={activa}
                  aria-label={activa ? `${header}. ${UI_MESSAGES.toolbar.sortDirection(Boolean(sort?.asc))}` : UI_MESSAGES.table.sortHeaderTip(header)}
                  title={activa ? UI_MESSAGES.toolbar.sortDirection(Boolean(sort?.asc)) : UI_MESSAGES.table.sortHeaderTip(header)}
                  onClick={() => onSort?.(currentTab, key)}
                >
                  <span>{header}</span>
                  {activa ? <span className="list-sort-caret" aria-hidden="true" /> : null}
                </button>
              );
            })}
            </div>
          </div>
          {/* EL TAMAÑO DE LOS CUADROS, solo cuando se están viendo. Un deslizador de TRES POSICIONES en forma de
              CUÑA —fina a la izquierda, gruesa a la derecha—, que es la figura con la que cualquiera ha subido
              un volumen alguna vez: se entiende sin rótulo y dice de un vistazo cuántos pasos hay y en cuál se
              está. Dos botones de más y menos contaban lo mismo y no contaban esto.
              Es un `<input type="range">` de verdad y no una barra dibujada: trae gratis el teclado (flechas,
              inicio/fin), el arrastre con el dedo y el papel de deslizador para un lector de pantalla. Lo único
              que hay que añadirle es `aria-valuetext`, porque «2 de 3» no dice nada y «Normales» sí. */}
          {/* LOS DOS CONTROLES DE VISTA, EN UNA PIEZA. Deciden lo mismo —cómo se mira la colección— y se usan
              seguidos: primero la forma, y si son cuadros, cuánto miden. Sueltos se leían como dos ajustes sin
              relación, y cada tema los dejaba en el acabado de la casa aunque el resto de la barra fuera suya.
              El envoltorio es lo que permite que CADA SKIN los dibuje como una sola pieza de su mundo: la placa
              de latón del cogitador, el cartel de contrato, el frontal de la recreativa.
              Sin deslizador —en la vista de lista— la pieza se queda solo con el conmutador, y las cajas de los
              temas lo contemplan: se aprietan con `:has()` en vez de dejar el hueco de algo que no está. */}
          <div className="view-controls">
          {shape === 'grid' ? (
            /* `--grid-size-pos` es la posición actual (0..2) en el DOM: de ella salen el relleno de la cuña y
               nada más. Va en línea porque es un DATO de este momento, no una decisión de diseño. */
            <div className="grid-size" style={{ '--grid-size-pos': String(Math.max(0, GRID_SIZES.indexOf(gridSize))) } as CSSProperties}>
              <input
                type="range"
                className="grid-size-range"
                min={0}
                max={GRID_SIZES.length - 1}
                step={1}
                value={Math.max(0, GRID_SIZES.indexOf(gridSize))}
                aria-label={UI_MESSAGES.toolbar.gridSizeAria}
                aria-valuetext={UI_MESSAGES.toolbar.gridSizeName(gridSize)}
                title={`${UI_MESSAGES.toolbar.gridSizeAria}: ${UI_MESSAGES.toolbar.gridSizeName(gridSize)}`}
                onChange={(event) => setGridSize(GRID_SIZES[Number(event.target.value)] ?? 'md')}
              />
            </div>
          ) : null}
          {/* LA FORMA, aquí y no en Ajustes: se cambia a menudo —según si buscas un juego concreto o paseas por
              la colección—, y una decisión de cada rato escondida en otra pantalla no la usa nadie. Estaba en
              la caja de filtros, donde se leía como un filtro más; su sitio es al lado de lo que cambia. */}
          <div className="shape-switch" role="group" aria-label={UI_MESSAGES.toolbar.shapeAria}>
            {([
              ['list', COMMON_ICONS.viewList, UI_MESSAGES.toolbar.shapeList],
              ['grid', COMMON_ICONS.viewGrid, UI_MESSAGES.toolbar.shapeGrid],
            ] as const).map(([valor, icono, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className={`shape-switch-btn${shape === valor ? ' is-on' : ''}`}
                // `aria-pressed` y no `radio`: son dos botones que encienden o apagan una forma, y es lo que un
                // lector de pantalla sabe leer sin que haya que montar un grupo de radios con navegación propia.
                aria-pressed={shape === valor}
                title={etiqueta}
                aria-label={etiqueta}
                onClick={() => setShape(valor)}
              >
                <Icon name={icono} />
              </button>
            ))}
          </div>
          </div>
        </div>
      ) : null}
      {/* SIGUE SIENDO UNA TABLA, con UNA columna. Y no es una rareza que haya sobrevivido a un refactor: es lo
          que permite que el virtualizador mida FILAS de verdad —cada renglón, cada fila de tarjetas y cada
          detalle desplegado son un `<tr>` que se mide— mientras el CSS pinta piezas sueltas. Lo que sí se fue
          con las columnas es su cabecera: `<thead>` y `<colgroup>` estaban ahí para repartir un ancho entre 6-8
          columnas que hoy no existen, y sus botones de ordenar llevaban tiempo sin poder pulsarse (el orden se
          dice con los chips de la cabecera del listado). */}
      <table className={tableClass}>
        {/* A11y-4: la tabla no se anunciaba con ningún nombre, así que en la lista de tablas de un lector de
            pantalla aparecía como "tabla" sin más. Con varias listas (completados, vergüenza, en curso…) el
            nombre es lo único que las distingue. */}
        <caption className="sr-only">{UI_MESSAGES.table.caption(TAB_TITLES[currentTab], games.length)}</caption>
        <tbody>
          {!games.length ? (
            <tr>
              <td className="table-empty-cell">
                <div className="table-empty">
                  <svg className="table-empty-icon" aria-hidden="true">
                    <use href={`#icon-${TAB_ICONS[currentTab]}`} />
                  </svg>
                  <p className="table-empty-title">{UI_MESSAGES.table.emptyTitle}</p>
                  {/* Empezar de cero a mano es el camino largo: junto a "añadir" se ofrece la importación,
                      que es lo que de verdad llena una lista vacía de golpe. El selector de archivo se abre
                      AQUÍ (antes esto era un enlace a `/integraciones`, que ya no existe), y si quedan juegos
                      sin clasificar de una importación anterior se ofrece también la bandeja.
                      Solo clases globales: esta tabla no carga la hoja del flujo de importación. */}
                  {!readOnly && (onAddGame || onImportLibrary) ? (
                    <div className="table-empty-actions">
                      {onAddGame ? (
                        <button type="button" className="btn btn-primary" onClick={onAddGame}>
                          <Icon name={COMMON_ICONS.plus} />
                          <span>{UI_MESSAGES.table.emptyCta}</span>
                        </button>
                      ) : null}
                      {onImportLibrary ? (
                        <FilePickerButton
                          id="import-library-empty"
                          className="btn btn-secondary"
                          label={IMPORT_UI.importBtn}
                          ariaLabel={IMPORT_UI.importAria}
                          accept=".json,application/json"
                          onPick={onImportLibrary}
                        />
                      ) : null}
                      {onOpenInbox && inboxCount > 0 ? (
                        <button type="button" className="btn btn-secondary btn-accent" onClick={onOpenInbox}>
                          <Icon name={COMMON_ICONS.download} />
                          <span>{IMPORT_UI.viewInbox(inboxCount)}</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : (
            <>
              {topSpacerHeight > 0 && !fallbackToFullRender ? (
                <tr aria-hidden="true">
                  <td className="table-spacer" style={{ height: `${topSpacerHeight}px` }} />
                </tr>
              ) : null}
              {rowIndexesToRender.map((rowIndex) => {
                const row = virtualRows[rowIndex];
                const game = gameMap.get(row.gameId);
                if (!game) return null;

                if (row.type === 'grid') {
                  /* UNA FILA DEL MOSAICO. Va dentro de una celda con `colSpan`, así que la tabla sigue siendo
                     una tabla —y el virtualizador sigue midiendo filas— mientras que lo que se ve es una
                     rejilla. Las cajas se reparten con el mismo mínimo que usa la cuenta de columnas. */
                  const bloque = (row.ids ?? []).map((id) => gameMap.get(id)).filter(Boolean) as GameItem[];
                  return (
                    <tr
                      key={`grid-${row.gameId}`}
                      data-index={rowIndex}
                      ref={virtualize ? virtualizer.measureElement : undefined}
                      className="grid-row"
                    >
                      <td>
                        {/* `is-flat` en la REJILLA y no solo en cada caja: el alto de fila y el hueco
                            entre cajas son propiedades de la rejilla, y quien sabe si hay carátulas es
                            esta vista, no la pieza. */}
                        <div
                          className={`game-grid${covers ? '' : ' is-flat'}`}
                          style={{ '--grid-cols': gridColumns } as CSSProperties}
                        >
                          {bloque.map((game) => {
                            const expanded = expandedId === game.id;
                            /* Cuántos chips enseña ESTE juego: lo decide lo que ocupa su texto en el ancho de
                               la caja, no un número igual para todos (ver `chipsQueCaben`). */
                            const capsPlat = chipsQueCaben(game.platforms, anchoRanuraCaja, metricasChip);
                            const capsGenero = chipsQueCaben(game.genres, anchoRanuraCaja, metricasChip);
                            const nota = (currentTab === 'c' || currentTab === 'p') || (showShameScore && hasScore(game)) ? (
                              <span className="game-card-score"><ScoreDisplay game={game} /></span>
                            ) : null;
                            const insignia = currentTab === 'c' && showReplayable
                              ? <span className="game-card-badge">{renderBooleanBadge('replayable', Boolean(game.replayable))}</span>
                              : currentTab === 'v' && showRetry
                                ? <span className="game-card-badge">{renderBooleanBadge('retry', Boolean(game.retry))}</span>
                                : null;
                            return (
                              <article
                                key={game.id}
                                className={`game-card${covers ? '' : ' is-flat'}${expanded ? ' is-open' : ''}${game.id === recentlyChangedId ? ' just-changed' : ''}${game.id === removingId ? ' is-leaving' : ''}`}
                              >
                                {/* Toda la caja abre el detalle; el botón cubre su superficie y se queda con el
                                    foco y el nombre accesible, igual que en el bloque de reseñas del hub. */}
                                <button
                                  type="button"
                                  className="game-card-open"
                                  aria-expanded={expanded}
                                  aria-controls={`game-detail-${game.id}`}
                                  onClick={() => onExpandedChange(expanded ? null : game.id)}
                                  onDoubleClick={() => { if (!readOnly) onEdit(currentTab, game.id); }}
                                >
                                  <span className="sr-only">{game.name}</span>
                                </button>
                                {/* LA RANURA DE LA CARÁTULA SOLO EXISTE SI HAY CARÁTULAS. Con la preferencia
                                    apagada —que es como viene la app— reservar el marco 3:4 son trescientos
                                    píxeles de alto por caja para no enseñar ninguna imagen: el mosaico se leía
                                    como una parrilla de azulejos de color con el nombre repetido dentro y
                                    debajo. Sin ella, la caja se queda en lo que tiene que decir.
                                    La decide la PREFERENCIA y no el juego: si dependiera de que cada carátula
                                    llegue, dentro de la misma fila unas cajas tendrían marco y otras no. Cuando
                                    las carátulas están encendidas, el marco se reserva siempre y el juego que
                                    no tenga imagen enseña su portada de casa. */}
                                {covers ? (
                                  <div className="game-card-art">
                                    <GameCover name={game.name} {...coverDeCaja(covers, game, coversAmpliadas, pedidoDePortada)} />
                                    {/* La nota, flotando sobre el canto de la carátula: en el mosaico es lo
                                        primero que se busca, y ahí está siempre en el mismo punto de cada caja
                                        en vez de bailar según lo que ocupe el nombre. */}
                                    {nota}
                                    {/* La insignia también flota sobre la lámina, en el canto de abajo. Estaba
                                        dentro del cuerpo, a la derecha de las etiquetas, y ahí le quitaba a los
                                        chips el ancho que necesitan: en una caja de 190 px eso es la diferencia
                                        entre leer «RogueLike» y leer «Rog…». */}
                                    {insignia}
                                  </div>
                                ) : null}
                                <div className="game-card-body">
                                  {/* Sin carátula sobre la que flotar, la nota y la insignia encabezan la caja
                                      en la MISMA línea: siguen siendo las dos señales que se buscan y siguen
                                      estando en el mismo punto de todas las cajas, que es lo que importaba. */}
                                  {!covers && (nota || insignia) ? (
                                    <div className="game-card-head">{nota}{insignia}</div>
                                  ) : null}
                                  <h3 className="game-card-name" title={game.name}>{game.name}</h3>
                                  {/* RANURAS FIJAS (plan §3.2): siempre las mismas dos líneas —plataformas y
                                      géneros—, en el mismo sitio y tenga el juego lo que tenga. Cuando le falta
                                      el dato queda el hueco tenue del `renderTags` vacío, no una caja con menos
                                      cosas: unas con dos chips y otras con cuatro se leían como descuido.
                                      SIN AÑO: se le daba una ranura a un dato de cuatro cifras que en el mosaico
                                      no se busca —para eso está el renglón, y el detalle los tiene todos— y se
                                      comía el ancho que plataforma y género necesitan para verse enteros. */}
                                  <div className="game-card-tags">
                                    <div className={`game-card-slot${capsPlat.apretado ? ' is-apretado' : ''}`}>
                                      {renderTags(game.platforms, 'chip-plat', capsPlat.n)}
                                    </div>
                                    <div className={`game-card-slot${capsGenero.apretado ? ' is-apretado' : ''}`}>
                                      {renderTags(game.genres, 'chip-genre', capsGenero.n, true)}
                                    </div>
                                  </div>
                                </div>
                                {/* EL MEDIDOR DEL PIE. La misma nota que el aro, dicha como una barra que cruza
                                    la caja de lado a lado: de un vistazo, y sin leer ni una cifra, la fila de
                                    cajas se ordena sola. Usa el mismo tono rojo→verde del aro (`--score-hue`),
                                    así que también dice algo cuando la escala elegida son estrellas. */}
                                {hasScoreColumn && hasScore(game) ? (
                                  <span
                                    className="game-card-meter"
                                    aria-hidden="true"
                                    style={{
                                      '--score-pct': String(Math.round(resolveGrade(game))),
                                      '--score-hue': String(hueFromGrade(resolveGrade(game))),
                                    } as CSSProperties}
                                  />
                                ) : null}
                              </article>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (row.type === 'main') {
                  const expanded = expandedId === game.id;
                  const detailId = `game-detail-${game.id}`;
                  /* LA CARÁTULA, DE FONDO. En el renglón la imagen no es un dato que leer sino el ambiente de la
                     pieza: va detrás, a tamaño de portada, y encima cae un velo de la superficie del tema con
                     desenfoque para que el texto siga contrastando en las seis paletas. Va como fondo de CSS y
                     no como `<img>` porque aquí no se mira: no necesita alt, ni hueco reservado, ni participar
                     en la medición de la fila. Sin preferencia de carátulas encendida —o sin imagen para ese
                     juego— la pieza se queda en su superficie plana, que es la maqueta §2. */
                  const rowCover = coverDeRenglon(covers, game, coversAmpliadas, franjaGrande, pedidoDePortada);
                  /* El lado malo del renglón: en la vergüenza son los MOTIVOS de dejarlo, no los defectos. */
                  const malos = (currentTab === 'v' ? game.reasons : game.weaknesses) || [];
                  /* Cuántos chips enseña ESTE juego en cada ranura, medidos con el ancho de su columna. */
                  const anos = yearsDesc(game.years);
                  const capsAno = chipsQueCaben(anos, anchoCatYear, metricasChip);
                  const capsPlatFila = chipsQueCaben(game.platforms, anchoCatPlat, metricasChip);
                  const capsGeneroFila = chipsQueCaben(game.genres, anchoCatGenre, metricasChip);
                  return (
                    <tr
                      key={`main-${game.id}`}
                      data-index={rowIndex}
                      ref={virtualize ? virtualizer.measureElement : undefined}
                      style={rowCover ? ({ '--row-cover': `url("${rowCover}")` } as CSSProperties) : undefined}
                      className={`main-row ${rowCover ? 'has-cover' : ''} ${row.index % 2 === 0 ? 'striped' : ''} ${game.id === recentlyChangedId ? 'just-changed' : ''} ${enteringIds.has(game.id) ? 'is-entering' : ''} ${game.id === removingId ? 'is-leaving' : ''}`.replace(/\s+/g, ' ').trim()}
                      // A11y-2: el disparador accesible es el botón de la 1ª celda (anunciado como botón + aria-controls).
                      // La fila conserva click/doble-click como atajos de RATÓN, pero ya no es un control focusable.
                      onClick={() => onExpandedChange(expanded ? null : game.id)}
                      onDoubleClick={() => {
                        if (!readOnly) {
                          onEdit(currentTab, game.id);
                        }
                      }}
                    >
                      <td>
                        <button
                          type="button"
                          className="row-toggle"
                          aria-expanded={expanded}
                          aria-controls={detailId}
                          // A11y-4: SIN `aria-label`. El nombre accesible sale del CONTENIDO del botón, y eso
                          // importa por lo que pasa en móvil: ahí todas las celdas de datos son `display:none`
                          // (así que no están en el árbol de accesibilidad) y el meta compacto de abajo es la
                          // ÚNICA presentación de puntuación, plataformas, géneros y año. Como un `aria-label`
                          // GANA sobre el contenido, con él un lector de pantalla en el móvil solo oía el nombre
                          // del juego: el resto de la fila era invisible para él. Sin etiqueta explícita, el
                          // nombre accesible sigue a lo que se ve en cada breakpoint (en escritorio, solo el
                          // nombre, porque ahí el meta es el que está oculto y los datos están en sus columnas).
                          // El estado plegado/desplegado ya lo anuncia `aria-expanded`, que es para lo que existe.
                          onClick={(event) => {
                            event.stopPropagation();
                            onExpandedChange(expanded ? null : game.id);
                          }}
                        >
                          <span className="row-chevron" aria-hidden="true" />
                          <span className="row-toggle-body">
                            {/* LA CABECERA DEL RENGLÓN: el nombre a la izquierda y, pegadas al canto derecho, la
                                nota y la insignia. Las dos cosas que se buscan de un vistazo al recorrer una
                                lista están SIEMPRE en el mismo sitio, y la nota deja de viajar al final de una
                                línea de chips cuya longitud cambia en cada fila. */}
                            <span className="row-head">
                              <strong className="row-name">{game.name}</strong>
                              <span className="row-actions">
                                {/* La ranura de la nota se reserva aunque ESTE juego no la tenga (`meta-score`
                                    dice si la lista la usa): si no, la insignia de al lado se correría de sitio
                                    en unas filas sí y en otras no, que es justo la desalineación que el renglón
                                    viene a quitar. */}
                                {hasScoreColumn ? (
                                  <span className="row-score">{hasScore(game) || currentTab !== 'v' ? <ScoreDisplay game={game} /> : null}</span>
                                ) : null}
                                {currentTab === 'c' && showReplayable ? renderBooleanBadge('replayable', Boolean(game.replayable)) : null}
                                {currentTab === 'v' && showRetry ? renderBooleanBadge('retry', Boolean(game.retry)) : null}
                              </span>
                            </span>
                            {/* LAS COLUMNAS INVISIBLES (plan §3.1). Cada categoría tiene su RANURA fija —año,
                                plataformas, géneros—, así que el género de una fila cae debajo del género de la
                                siguiente sin dibujar ni una línea ni una cabecera. Es el mismo remedio que ya
                                llevaba el meta de móvil y por el mismo motivo: sin alineación vertical, y sin
                                cabeceras que digan qué es cada cosa, los chips se leen «ahí a lo loco». */}
                            <span className="row-cats">
                              {currentTab === 'c' && showYears ? (
                                /* Varios años con su «+N», del más reciente al más antiguo: en una lista de
                                   completados, «lo jugué en 2019 y lo rejugué en 2026» es un dato, no un
                                   detalle. Su ranura se dimensiona para que quepan tres sin partirse. */
                                <span className={`row-cat row-cat-year${capsAno.apretado ? ' is-apretado' : ''}`}>
                                  {renderTags(anos, 'chip-generic', capsAno.n)}
                                </span>
                              ) : null}
                              <span className={`row-cat row-cat-plat${capsPlatFila.apretado ? ' is-apretado' : ''}`}>
                                {renderTags(game.platforms, 'chip-plat', capsPlatFila.n)}
                              </span>
                              <span className={`row-cat row-cat-genre${capsGeneroFila.apretado ? ' is-apretado' : ''}`}>
                                {renderTags(game.genres, 'chip-genre', capsGeneroFila.n, true)}
                              </span>
                            </span>
                            {/* LO QUE SE PENSÓ DEL JUEGO, en el renglón de abajo y en DOS recuadros hundidos e
                                independientes: uno para lo bueno y otro para lo malo. Hubo una versión con un
                                solo recuadro partido en dos mitades y se leía como una tabla de dos celdas;
                                separados, cada grupo es una cosa y se ve dónde empieza y dónde acaba.
                                El recuadro es lo que los separa de las categorías de arriba sin necesidad de
                                rótulos; cuál es cuál lo dicen el color —verde a favor, rojo en contra, los
                                mismos de toda la app— y el sitio, porque el de lo malo arranca siempre en el
                                mismo píxel, fila tras fila.
                                Un grupo vacío no deja un recuadro con un guion dentro: no se pinta, y su hueco
                                lo sigue reservando la rejilla.
                                No viajan al teléfono: allí no caben sin recortarlos a una palabra, y una palabra
                                suelta sin su rótulo no se entiende. Están enteros en el detalle. */}
                            {tieneOpinion ? (
                              <span className="row-notes">
                                {game.strengths?.length ? (
                                  <span className="row-note row-note-good">
                                    {renderTags(game.strengths, 'chip-pf', chipsQueCaben(game.strengths, anchoNotaBuena, metricasChip).n)}
                                  </span>
                                ) : null}
                                {malos.length ? (
                                  <span className="row-note row-note-bad">
                                    {renderTags(malos, 'chip-pd', chipsQueCaben(malos, anchoNotaMala, metricasChip).n)}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={`detail-${game.id}`} id={`game-detail-${game.id}`} data-index={rowIndex} ref={virtualize ? virtualizer.measureElement : undefined} className={`detail-row open ${game.id === removingId ? 'is-leaving' : ''}`.trim()}>
                    <td>
                      <div className="detail-content">
                        <div className="detail-box">
                          <span className="detail-label">{UI_MESSAGES.detail.platforms}</span>
                          <div className="chips">
                            {renderTags(game.platforms, 'chip-plat')}
                            {game.steamDeck && (
                              <span className="chip chip-deck">
                                <Icon name={COMMON_ICONS.steamDeck} />
                                <span>{UI_MESSAGES.detail.steamDeck}</span>
                              </span>
                            )}
                          </div>
                          {game.platforms.length === 0 && !game.steamDeck && <span>—</span>}
                        </div>
                        <div className="detail-box">
                          <span className="detail-label">{UI_MESSAGES.detail.genres}</span>
                          <div>{renderTags(game.genres, 'chip-genre', undefined, true)}</div>
                        </div>
                        {currentTab === 'c' && showYears && game.years && game.years.length > 0 && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.yearsCompleted}</span>
                            <div>{renderTags(yearsDesc(game.years), 'chip-generic')}</div>
                          </div>
                        )}
                        {/* 0 horas es un hueco, no un dato: se oculta igual que cuando no hay horas anotadas (mismo
                            criterio que `hoursOf` en core/achievements/metrics.ts). */}
                        {(currentTab === 'c' || currentTab === 'v') && showHours && (game.hours ?? 0) > 0 && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.playtime}</span>
                            <div>{UI_MESSAGES.detail.hoursSuffix(String(game.hours).replace('.', ','))}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'v' || currentTab === 'e') && game.strengths && game.strengths.length > 0 && (
                          <div className="detail-box detail-strong">
                            <span className="detail-label">{UI_MESSAGES.detail.strengths}</span>
                            <div>{renderTags(game.strengths, 'chip-pf')}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'e') && game.weaknesses && game.weaknesses.length > 0 && (
                          <div className="detail-box detail-weak">
                            <span className="detail-label">{UI_MESSAGES.detail.weaknesses}</span>
                            <div>{renderTags(game.weaknesses, 'chip-pd')}</div>
                          </div>
                        )}
                        {currentTab === 'v' && game.reasons && game.reasons.length > 0 && (
                          <div className="detail-box detail-weak">
                            <span className="detail-label">{UI_MESSAGES.detail.weaknesses}</span>
                            <div>{renderTags(game.reasons, 'chip-pd')}</div>
                          </div>
                        )}
                        {(currentTab === 'c' || currentTab === 'p' || (currentTab === 'v' && game.scored)) && game.score !== null && (
                          <div className="detail-box">
                            <span className="detail-label">{currentTab === 'p' ? UI_MESSAGES.detail.interest : UI_MESSAGES.detail.score}</span>
                            <div>
                              <ScoreDisplay game={game} />
                            </div>
                          </div>
                        )}
                        {currentTab === 'c' && showReplayable && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.replayability}</span>
                            <div>{renderBooleanBadge('replayable', Boolean(game.replayable))}</div>
                          </div>
                        )}
                        {currentTab === 'v' && showRetry && (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.retry}</span>
                            <div>{renderBooleanBadge('retry', Boolean(game.retry))}</div>
                          </div>
                        )}
                        {/* EL ANÁLISIS NO SE VUELCA AQUÍ: se va a leer a su pantalla. Volcado ocupaba el detalle
                            entero —hay reseñas de veinte mil caracteres— y empujaba fuera de la vista todo lo
                            demás, que es lo que se abre el detalle para ver. El enlace lleva a
                            `/stats/resenas/:id`, donde ya se lee con su ancho de lectura y su medallón.
                            Es un ENLACE y no un botón porque es navegación: así se puede abrir en otra pestaña,
                            copiar la dirección o volver con el botón de atrás. Y ocupa una celda de la rejilla
                            del detalle, no la fila entera (`is-wide`), que es de donde sale el sitio. */}
                        {showReview && supportsReview(currentTab) && game.review ? (
                          <div className="detail-box">
                            <span className="detail-label">{UI_MESSAGES.detail.review}</span>
                            <div>
                              <Link
                                className="btn btn-secondary"
                                to={`/stats/resenas/${game.id}`}
                                /* DE DÓNDE SE VIENE, para que el botón de volver de aquella pantalla devuelva
                                   AQUÍ y no al listado de reseñas, que es de donde se llega normalmente. El
                                   panel ya usaba este mismo estado para distinguir sus dos orígenes; esta es la
                                   tercera puerta. */
                                state={{ backTo: TAB_ROUTE[currentTab] }}
                                aria-label={UI_MESSAGES.detail.reviewLinkAria(game.name)}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Icon name={COMMON_ICONS.arrowsToEye} />
                                <span>{UI_MESSAGES.detail.reviewLink}</span>
                              </Link>
                            </div>
                          </div>
                        ) : null}
                        {!readOnly ? (
                          <div className="detail-actions">
                            {tabActions.map((action) => (
                              <button
                                key={`${game.id}-${action.target}`}
                                className={`btn ${action.btnCls}`}
                                type="button"
                                title={UI_MESSAGES.table.actionAria(action.label, game.name)}
                                aria-label={UI_MESSAGES.table.actionAria(action.label, game.name)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onMigrate(currentTab, game.id, action.target);
                                }}
                              >
                                <Icon name={action.icon} />
                                <span>{action.label}</span>
                              </button>
                            ))}
                            <button
                              className="btn btn-secondary"
                              type="button"
                              title={UI_MESSAGES.table.editAria(game.name)}
                              aria-label={UI_MESSAGES.table.editAria(game.name)}
                              onClick={(event) => {
                                event.stopPropagation();
                                onEdit(currentTab, game.id);
                              }}
                            >
                              <Icon name={COMMON_ICONS.edit} />
                              <span>{UI_MESSAGES.table.edit}</span>
                            </button>
                            <button
                              className="btn btn-danger"
                              type="button"
                              title={UI_MESSAGES.table.deleteAria(game.name)}
                              aria-label={UI_MESSAGES.table.deleteAria(game.name)}
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete(currentTab, game.id);
                              }}
                            >
                              <Icon name={COMMON_ICONS.trash} />
                              <span>{UI_MESSAGES.table.delete}</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {bottomSpacerHeight > 0 && !fallbackToFullRender ? (
                <tr aria-hidden="true">
                  <td className="table-spacer" style={{ height: `${bottomSpacerHeight}px` }} />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
});
