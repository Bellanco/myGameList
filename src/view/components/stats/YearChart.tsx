import { memo, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { STATS_UI } from '../../../core/constants/statsLabels';
import { useStatsLabels } from './statsVoice';
import type { YearBucket } from '../../../core/stats/types';
import type { YearMetric } from '../../../viewmodel/useStatsViewModel';
import type { ScoreScale } from '../../../core/utils/scoreScale';
import { formatCount, formatHours } from './format';

/** Cuántos años rotula el eje como mucho: más que esto es una reja, no una guía. De ahí solo se caen los que
 *  además no quepan (ver `useFittingLabels`). */
const AXIS_LABELS = 8;
/** Altura del lienzo en unidades del `viewBox`; el ancho es 100. */
const H = 100;
/** Aire por arriba, para que el punto más alto no se coma el borde ni su rótulo. */
const TOP_ROOM = 12;
/** Aire mínimo entre dos rótulos vecinos, en píxeles: por debajo de esto se leen como si fueran uno solo. */
const LABEL_GAP = 6;
/** Lo que sube un rótulo fijo cuando no cabe donde le toca, en proporción a su propia altura. */
const LABEL_LIFT = 1.15;
/** Y lo que baja si tampoco cabe arriba: al otro lado de su punto. Las dos medidas van con el CSS de la mano. */
const LABEL_DROP = 2.15;

interface LabelBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Alto propio: la unidad con la que se aparta el rótulo si hay que moverlo (ver `LABEL_LIFT`/`LABEL_DROP`). */
  alto: number;
  /** Los fijos no se caen nunca: el récord y el último año. */
  pinned: boolean;
}

/** ¿Se pisan dos rótulos? En las DOS direcciones: vecinos en horizontal pueden estar a alturas muy distintas. */
function overlap(a: LabelBox, b: LabelBox): boolean {
  return a.x0 - LABEL_GAP < b.x1 && b.x0 - LABEL_GAP < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** El mismo rótulo, corrido un renglón: arriba (`LABEL_LIFT`) o al otro lado de su punto (`LABEL_DROP`). */
function moved(box: LabelBox, saltos: number): LabelBox {
  const salto = box.alto * saltos;
  return { ...box, y0: box.y0 + salto, y1: box.y1 + salto };
}

/**
 * Qué rótulos de una fila CABEN, y dónde se pintan: `0` donde les toca, `1` un renglón más arriba, `2` al otro
 * lado de su punto y `-1` fuera.
 *
 * Se miden en el navegador en vez de contar dígitos: la familia tipográfica la pone cada tema
 * (`themes/*.scss` cambia la del documento entero), así que una cuenta hecha a ojo sobra rótulos en una paleta
 * y los tira de más en otra. Y se miden de verdad, en píxeles, porque el ancho útil del lienzo no se deduce del
 * de la ventana: el mismo móvil da una caja distinta según lo que la tarjeta tenga alrededor.
 *
 * EN LAS DOS DIRECCIONES, que es la clave de cuántos números sobreviven: las cifras cuelgan de su punto, así
 * que dos vecinas en horizontal suelen estar a alturas muy distintas y no se estorban. Mirando solo la
 * horizontal se caían a pares en cuanto la serie pasaba de veinte años —y con ella la cifra del año en curso,
 * que quedaba debajo de la píldora del récord sin llegar a tocarla—.
 *
 * Sustituye a la regla de CSS que escondía UNO DE CADA DOS por debajo de 34 rem. Aquella tapaba números que
 * cabían de sobra —con ocho años en un móvil se perdían tres, el último incluido— y a la vez dejaba pasar los
 * choques de verdad, porque la píldora del récord es mucho más ancha que una cifra suelta.
 *
 * Los que no caben se quedan en el DOM con `visibility: hidden`: siguen midiendo, que es lo que permite
 * recalcular al girar el aparato. No le esconden el dato a nadie —la figura entera va `aria-hidden` y los años
 * están en la tabla de abajo—, solo despejan la imagen.
 *
 * Los marcados `data-fit="pin"` no se caen: son los que dan sentido a la fila —el récord y el borde de la
 * serie—. Si les pilla el sitio ocupado prueban a apartarse un renglón, arriba primero y debajo de su punto
 * después, y solo entonces desalojan al vecino. Apartarse es el último recurso y no el reparto normal: una fila
 * de números a varias alturas se lee peor que una fila con huecos.
 *
 * Y UN FIJO NUNCA DESALOJA A OTRO FIJO. El récord y el año en curso caen pegados en cuanto el mejor año es
 * reciente, y ahí el desalojo sin más convertía un problema en el contrario: aparecía el año en curso y
 * desaparecía la píldora del récord, que es la cifra que más se mira de toda la figura.
 */
function useFittingLabels(row: RefObject<HTMLElement | null>, signature: string): (index: number) => number {
  // `null` es "todavía sin medir" —o sin `ResizeObserver`, como en las pruebas—: se pintan todos, que es el
  // estado degradado correcto; sobrar rótulos se lee, y esconderlos sin saber si caben, no.
  const [levels, setLevels] = useState<ReadonlyMap<number, number> | null>(null);

  useLayoutEffect(() => {
    const node = row.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }
    let vivo = true;
    const measure = () => {
      const labels = Array.from(node.querySelectorAll<HTMLElement>('[data-fit]'));
      if (!vivo || node.clientWidth === 0 || labels.length === 0) {
        return;
      }
      /* Cajas relativas al lienzo, DESHACIENDO el apartado que lleve puesto cada rótulo (`data-shift`).
         Medir la caja tal y como está pintada parece lo natural y es justo lo que no se puede hacer: un rótulo
         ya apartado se mide donde no estorba, la medición lo devuelve a su sitio, allí vuelve a estorbar y se
         aparta otra vez — un vaivén que cada navegador resolvía de una manera. El reparto se calcula siempre
         sobre el sitio de origen, que es el único dato que no depende del reparto anterior. */
      const base = node.getBoundingClientRect();
      const boxes: LabelBox[] = labels.map((label) => {
        const caja = label.getBoundingClientRect();
        const shift = Number(label.dataset.shift ?? 0);
        const vuelta = (shift === 1 ? LABEL_LIFT : shift === 2 ? -LABEL_DROP : 0) * caja.height;
        return {
          x0: caja.left - base.left,
          x1: caja.right - base.left,
          y0: caja.top - base.top + vuelta,
          y1: caja.bottom - base.top + vuelta,
          alto: caja.height,
          pinned: label.dataset.fit === 'pin',
        };
      });

      const puestos: Array<{ index: number; box: LabelBox }> = [];
      const reparto = new Map<number, number>();
      const libre = (box: LabelBox) => puestos.every((puesto) => !overlap(box, puesto.box));
      boxes.forEach((box, index) => {
        if (libre(box)) {
          puestos.push({ index, box });
          reparto.set(index, 0);
          return;
        }
        if (!box.pinned) {
          reparto.set(index, -1);
          return;
        }
        // Apartarse un renglón —arriba si hay techo, debajo de su punto si no— para convivir con el vecino en
        // vez de llevárselo por delante. Es lo que deja ver a la vez el récord y el año en curso.
        const arriba = moved(box, -LABEL_LIFT);
        const abajo = moved(box, LABEL_DROP);
        const hueco = [
          { nivel: 1, box: arriba, cabe: arriba.y0 >= 0 },
          { nivel: 2, box: abajo, cabe: abajo.y1 <= node.clientHeight },
        ].find((sitio) => sitio.cabe && libre(sitio.box));
        if (hueco) {
          puestos.push({ index, box: hueco.box });
          reparto.set(index, hueco.nivel);
          return;
        }
        // Sin sitio propio, desaloja —pero solo a los que no son fijos—. Contra otro fijo se calla: perder la
        // píldora del récord para enseñar el año en curso es cambiar un agujero por otro peor.
        const estorban = puestos.filter((puesto) => overlap(box, puesto.box));
        if (estorban.some((puesto) => boxes[puesto.index].pinned)) {
          reparto.set(index, -1);
          return;
        }
        estorban.forEach((puesto) => {
          reparto.set(puesto.index, -1);
          puestos.splice(puestos.indexOf(puesto), 1);
        });
        puestos.push({ index, box });
        reparto.set(index, 0);
      });

      // Mismo reparto, mismo objeto: sin esta comparación cada medición dispararía otro render.
      setLevels((previous) => (
        previous && previous.size === reparto.size && [...reparto].every(([index, nivel]) => previous.get(index) === nivel)
          ? previous
          : reparto
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    /* Y CADA RÓTULO, no solo el lienzo. Media docena de temas traen su tipografía de la red, y hasta que entra,
       las cifras se pintan con la de reserva y miden otra cosa; cuando llega la buena, el lienzo NO cambia de
       tamaño, así que observarlo solo a él deja el reparto hecho con anchos que ya no son los suyos —en «Sin
       salida» eso dejaba la cifra del año en curso encima de la del récord—. Vigilando los rótulos, el cambio
       de letra dispara la medición él solo, sin depender de los eventos de `document.fonts`, que no todos los
       navegadores dan a tiempo. Esconder o apartar un rótulo no cambia su caja, así que esto no se realimenta. */
    node.querySelectorAll<HTMLElement>('[data-fit]').forEach((label) => observer.observe(label));
    return () => {
      vivo = false;
      observer.disconnect();
    };
  }, [row, signature]);

  return (index: number) => levels?.get(index) ?? 0;
}

interface YearChartProps {
  years: YearBucket[];
  metric: YearMetric;
  onMetricChange: (metric: YearMetric) => void;
  /**
   * ¿Se puede cambiar de métrica? En el panel de un amigo no: las horas no viajan por el canal social, así que
   * el conmutador solo llevaría a un gráfico vacío.
   */
  switchable?: boolean;
  /**
   * Abrir el resumen de un año al pinchar su punto. Es un ATAJO al selector de arriba, no su sustituto: quien
   * está mirando la curva y ve un año que le llama la atención lo abre desde ahí mismo. Sin este callback los
   * puntos son adorno y no se anuncian como pulsables.
   */
  onSelectYear?: (year: number) => void;
  /** Escala de la cuenta: decide si los extremos de la tira se rotulan en estrellas o sobre 100. */
  scale?: ScoreScale;
}

function valueOf(bucket: YearBucket, metric: YearMetric): number {
  return metric === 'hours' ? bucket.hours : bucket.completed;
}

/**
 * Los tramos de la tira, de arriba abajo: 5★ arriba y 1★ abajo, como una escala de verdad. Cada nivel tiene su
 * propio color de la rampa de puntuación (ver `stats.scss`).
 *
 * Los completados SIN nota no pintan: un juego terminado lleva su puntuación, y reservarles un trozo gris en
 * cada barra metía en la escala algo que no es una nota. El dato no se pierde —sigue en la tabla de abajo—,
 * simplemente no ocupa sitio en una figura que habla de notas.
 */
const BANDS = [5, 4, 3, 2, 1].map((stars) => ({
  key: `s${stars}`,
  // Las estrellas de la tira no tienen voz —son una escala, no una frase—, así que este rótulo no depende de si
  // el panel habla de ti o de otra persona y puede quedarse a nivel de módulo.
  label: STATS_UI.years.quality.stars(stars),
  of: (bucket: YearBucket) => bucket.stars[stars - 1],
}));

/**
 * Curva suave por los puntos de la serie. Las bézier se apoyan en el punto medio horizontal entre cada par, que
 * es el suavizado que no se pasa de frenada: nunca inventa un pico por encima del año más alto ni un valle por
 * debajo del más bajo, cosa que sí hace un Catmull-Rom con tensión alta.
 */
function curveThrough(points: Array<{ x: number; y: number }>): string {
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    const midX = (points[i - 1].x + points[i].x) / 2;
    d += ` C ${midX.toFixed(2)} ${points[i - 1].y.toFixed(2)} ${midX.toFixed(2)} ${points[i].y.toFixed(2)} ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  return d;
}

/**
 * Evolución por años: una CURVA con el total del año y, debajo, una TIRA con el reparto por nota de ese año,
 * columna a columna y alineada con la curva.
 *
 * Por qué una curva y no las columnas de antes: veinte años en columnas obligaban a desplazar el gráfico a lo
 * ancho y a leer veinte valores sueltos; la línea enseña la forma —cuándo jugaste más y cuándo paraste— de un
 * vistazo y cabe entera. Y por qué la tira aparte y no una curva apilada por nota: son dos preguntas distintas
 * (cuánto y qué tal) y cada una merece su escala; apilada, las capas de arriba son ilegibles.
 *
 * A11y: la figura va `aria-hidden` y los datos se exponen en una tabla `sr-only` que ahora incluye también el
 * reparto por nota, que es lo que la tira añade. La animación de entrada la gobierna la tarjeta
 * (`useRevealOnScroll` la mantiene en pausa hasta que se llega a ella) y desaparece con `prefers-reduced-motion`.
 */
export const YearChart = memo(function YearChart({ years, metric, onMetricChange, switchable = true, onSelectYear, scale = 'stars' }: YearChartProps) {
  const L = useStatsLabels().years;
  const grade = scale === 'grade';
  // Un id por instancia: el degradado del área es un `<defs>` y en el panel de un amigo hay otro gráfico igual.
  const fillId = useId();
  // Las dos filas de rótulos se miden por separado —cifras arriba, años abajo— porque no ocupan lo mismo.
  const plotRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);

  // La serie va de más antiguo a más reciente (el tiempo avanza a la derecha), al revés que los cubos, que
  // llegan del más reciente al más antiguo. El cajón "sin año" no es un punto del eje: sale a un chip aparte.
  const undated = years.find((bucket) => bucket.year === null) || null;
  const series = years.filter((bucket) => bucket.year !== null).slice().reverse();

  const max = series.reduce((top, bucket) => Math.max(top, valueOf(bucket, metric)), 0) || 1;
  const span = series.length - 1 || 1;
  const format = metric === 'hours' ? formatHours : formatCount;
  const points = series.map((bucket, index) => ({
    bucket,
    x: (index / span) * 100,
    y: H - (valueOf(bucket, metric) / max) * (H - TOP_ROOM),
  }));
  const values = points.map((point) => format(valueOf(point.bucket, metric)));
  const peakIndex = points.reduce((best, point, index) => (
    valueOf(point.bucket, metric) > valueOf(points[best].bucket, metric) ? index : best
  ), 0);
  const axisStep = Math.max(1, Math.ceil(series.length / AXIS_LABELS));
  const axisMarks = points.filter((_point, index) => index % axisStep === 0 || index === points.length - 1);

  /* Los dos cálculos de sitio, ANTES del atajo de la serie vacía: los hooks se llaman siempre o no se llaman
     nunca. La firma es lo que hay escrito en la fila —cambiar de métrica cambia el ancho de las cifras—, que es
     justo cuando hay que volver a medir. */
  const valueLevel = useFittingLabels(plotRef, `${metric}|${values.join('|')}`);
  const axisLevel = useFittingLabels(axisRef, axisMarks.map((point) => point.bucket.year).join('|'));

  if (points.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const line = curveThrough(points);
  const area = `${line} L 100 ${H} L 0 ${H} Z`;
  const peak = points[peakIndex];
  const metricName = metric === 'hours' ? L.metricHours.toLowerCase() : L.metricGames.toLowerCase();
  // Tres marcas en la escala: el máximo, la mitad y cero. Más líneas en un lienzo de 13 rem es reja, no guía.
  const ticks = [max, max / 2, 0];

  return (
    <>
      {switchable ? (
      <div className="stats-metric-switch" role="group" aria-label={L.metricAria}>
        <button
          type="button"
          className={`btn btn-toggle${metric === 'games' ? ' active' : ''}`}
          aria-pressed={metric === 'games'}
          onClick={() => onMetricChange('games')}
        >
          <span>{L.metricGames}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${metric === 'hours' ? ' active' : ''}`}
          aria-pressed={metric === 'hours'}
          onClick={() => onMetricChange('hours')}
        >
          <span>{L.metricHours}</span>
        </button>
      </div>
      ) : null}

      <div className="year-trend" aria-hidden="true">
        <div className="year-trend-canvas">
          {/* Solo la marca de arriba lleva la unidad: dice de qué va la escala sin repetirla tres veces. */}
          <div className="year-trend-scale">
            {ticks.map((value, index) => (
              <span key={value} style={{ top: `${((H - (value / max) * (H - TOP_ROOM)) / H) * 100}%` } as CSSProperties}>
                {format(value)}{index === 0 ? <em>{metricName}</em> : null}
              </span>
            ))}
          </div>

          <div className="year-trend-plot" ref={plotRef}>
            {/* `preserveAspectRatio="none"`: el lienzo se estira con la tarjeta y la curva con él. Por eso los
                puntos, los rótulos y la escala son HTML —dentro del SVG saldrían deformados. */}
            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" focusable="false">
              <defs>
                <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
                  <stop className="year-fill-top" offset="0%" />
                  <stop className="year-fill-bottom" offset="100%" />
                </linearGradient>
              </defs>
              <g className="year-grid">
                {ticks.map((value) => {
                  const y = H - (value / max) * (H - TOP_ROOM);
                  return <line key={value} x1="0" x2="100" y1={y} y2={y} />;
                })}
              </g>
              <path className="year-area" d={area} fill={`url(#${fillId})`} />
              <path className="year-line" d={line} />
            </svg>

            {points.map((point, index) => {
              const year = point.bucket.year as number;
              const summary = `${year}: ${format(valueOf(point.bucket, metric))} ${metricName}`;
              const style = { left: `${point.x}%`, top: `${point.y}%`, '--i': index } as CSSProperties;
              const className = `year-node${index === peakIndex ? ' is-peak' : ''}`;

              // Con callback, el punto es un ATAJO para abrir ese año con el ratón o el dedo. Va fuera del
              // recorrido de teclado (`tabIndex={-1}`) a propósito: toda la figura está en `aria-hidden`, y un
              // control enfocable dentro de una región oculta es una trampa para un lector de pantalla. Quien
              // navega con teclado tiene el mismo atajo —y todos los años— en el selector de arriba.
              return onSelectYear ? (
                <button
                  key={year}
                  type="button"
                  tabIndex={-1}
                  className={`${className} is-link`}
                  style={style}
                  title={summary}
                  onClick={() => onSelectYear(year)}
                />
              ) : (
                // El dato exacto al pasar por encima; la vía principal sigue siendo la tabla de abajo.
                <span key={year} className={className} style={style} title={summary} />
              );
            })}

            {/* La cifra va ENCIMA de su punto, no al lado: a un lado se montaba sobre la propia línea y había
                tramos donde la curva desaparecía detrás del rótulo. El récord va marcado. */}
            {points.map((point, index) => {
              // Dos rótulos fijos: el RÉCORD y el ÚLTIMO AÑO. El récord porque es la cifra que se busca; el
              // último porque es dónde estás ahora, y justo esos dos caen seguidos en cuanto el mejor año es
              // reciente —era el número que faltaba—.
              const fixed = index === peakIndex || index === points.length - 1;
              const level = valueLevel(index);
              return (
                <span
                  key={point.bucket.year}
                  data-fit={fixed ? 'pin' : ''}
                  data-shift={level}
                  className={`year-value${index === peakIndex ? ' is-peak' : ''}${level === 1 ? ' is-lifted' : ''}${level === 2 ? ' is-below' : ''}${level < 0 ? ' is-crowded' : ''}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, '--i': index } as CSSProperties}
                >
                  {values[index]}
                </span>
              );
            })}
          </div>
        </div>

        {/* El eje empieza por una cadencia —como mucho `AXIS_LABELS` años, para no convertirlo en una reja— y
            de ahí solo se caen los que además CHOCARÍAN. El último año es el rótulo fijo: es el borde de la
            serie, y sin él la curva no dice hasta dónde llega. */}
        <div className="year-axis" ref={axisRef}>
          {axisMarks.map((point, index) => (
            <span
              key={point.bucket.year}
              data-fit={index === axisMarks.length - 1 ? 'pin' : ''}
              className={axisLevel(index) < 0 ? 'is-crowded' : undefined}
              style={{ left: `${point.x}%` } as CSSProperties}
            >
              {point.bucket.year}
            </span>
          ))}
        </div>

        {/* Tira de calidad: comparte la proyección de la curva —cada columna centrada en la x de su año— para
            que se puedan leer juntas sin buscar la correspondencia. Los dos extremos de la escala van
            rotulados en la calle de la izquierda: es todo lo que hace falta para saber leerla. */}
        <div className="year-strip">
          {points.map((point, index) => {
            const bucket = point.bucket;
            return (
              <div
                key={bucket.year}
                className="year-strip-col"
                // El tope de ancho no es capricho: media barra de las de los extremos vuela fuera del lienzo,
                // y solo cabe en el margen de la tarjeta si la barra es estrecha.
                style={{ left: `${point.x}%`, width: `${Math.min((100 / span) * 0.52, 3.2)}%`, '--i': index } as CSSProperties}
              >
                {BANDS.map((band) => {
                  const count = band.of(bucket);
                  if (count === 0) return null;
                  return (
                    <span
                      key={band.key}
                      className={`year-strip-seg is-${band.key}`}
                      style={{ flexGrow: count } as CSSProperties}
                      title={L.quality.cell(String(bucket.year), band.label, count, bucket.completed)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bajo la tira, solo la escala de color: los mismos cinco pasos que se apilan en cada barra. La frase que
            había aquí explicaba lo que la propia regleta ya dice. */}
        <div className="year-strip-foot">
          <p className="year-scale">
            <span>{L.quality.low(grade)}</span>
            <i className="year-scale-ramp" />
            <span>{L.quality.high(grade)}</span>
          </p>
        </div>
      </div>

      {/* La alternativa textual va envuelta en un `div.sr-only`: la clase sobre la propia `<table>` no la oculta
          —en una tabla, `height` es un MÍNIMO y `overflow` no la recorta—, así que con series largas la tabla
          crecía de verdad y añadía miles de píxeles de scroll invisible a la página. */}
      <div className="sr-only">
        <table>
          <caption>{L.chartAria(metric === 'hours' ? L.metricHours : L.metricGames)}</caption>
          <thead>
            <tr>
              <th scope="col">{L.colYear}</th>
              <th scope="col">{L.colGames}</th>
              <th scope="col">{L.colHours}</th>
              {BANDS.map((band) => <th key={band.key} scope="col">{band.label}</th>)}
              {/* La tabla sí conserva los completados sin nota: la figura no los pinta, pero el dato existe y
                  aquí es donde se puede consultar todo. */}
              <th scope="col">{L.quality.unscored}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((bucket) => (
              <tr key={bucket.year === null ? 'sin-anyo' : bucket.year}>
                <th scope="row">{bucket.year === null ? L.noYear : bucket.year}</th>
                <td>{formatCount(bucket.completed)}</td>
                <td>{formatHours(bucket.hours)}</td>
                {BANDS.map((band) => <td key={band.key}>{formatCount(band.of(bucket))}</td>)}
                <td>{formatCount(bucket.unscored)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="stats-note">
        {L.peak(peak.bucket.year as number, format(valueOf(peak.bucket, metric)), metricName)}
        {undated ? ` · ${L.noYearChip(format(valueOf(undated, metric)), metricName)}` : ''}
      </p>
    </>
  );
});
