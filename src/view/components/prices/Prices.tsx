import type { ReactElement } from 'react';
import { PRICES_UI as P } from '../../../core/constants/pricesLabels';
import { APP_LOCALE } from '../../../core/constants/locale';
import { isHistoricLow, matchedOtherTitle } from '../../../core/prices/priceDisplay';
import { formatPrice } from '../../../core/utils/money';
import type { PrecioItad } from '../../../model/types/prices';
// La hoja de los precios viaja con este chunk, que solo se pide con el interruptor encendido (P3).
import '../../../styles/prices.scss';

/* LOS PRECIOS DE ISTHEREANYDEAL, PINTADOS (P3 del plan de la ficha y los precios). Todo en un chunk perezoso: lo
   piden Deseados y la ficha solo con el interruptor encendido, así que quien no lo usa no lo descarga. Sin precio
   —sin red, sin emparejamiento o sin cupo— no se pinta nada: ni «—» ni un error (memoria `degradacion-servicios`). */

const ITAD_HOME = 'https://isthereanydeal.com/';
const HASTA = new Intl.DateTimeFormat(APP_LOCALE, { day: 'numeric', month: 'long' });
const MES_Y_ANIO = new Intl.DateTimeFormat(APP_LOCALE, { month: 'short', year: 'numeric' });

/** Una fecha ISO de ITAD con el formato dado, o `null` si no se entiende. */
function fecha(iso: string | null, formato: Intl.DateTimeFormat): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formato.format(date);
}

/**
 * EL PRECIO EN EL RENGLÓN Y EN LA CAJA DEL MOSAICO: «11,99 € · −60 %» y la marca «Mínimo» si iguala el histórico. Si
 * ITAD acertó con otro título, lo dice al pasar por encima; el recuadro de la ficha lo dice a la vista.
 */
export function PriceTag({ precio, name }: { precio: PrecioItad | null | undefined; name: string }): ReactElement | null {
  const mejor = precio?.mejor;
  if (!precio || !mejor) return null;
  const otro = matchedOtherTitle(precio, name);
  return (
    <span className="price-tag" title={otro ? P.matchedAs(otro) : undefined}>
      <span className="price-tag-now">{formatPrice(mejor.precio)}</span>
      {mejor.descuento > 0 ? <span className="price-tag-cut">−{mejor.descuento} %</span> : null}
      {isHistoricLow(precio) ? <span className="price-tag-low">{P.lowShort}</span> : null}
    </span>
  );
}

/**
 * EL RECUADRO DE LA FICHA, repartido en diagonal (F0.15): precio, descuento y precio normal arriba a la izquierda; el
 * sello «Mínimo histórico» arriba a la derecha; hasta cuándo dura la oferta (la tienda la dice el botón); los mínimos
 * en una fila, sin repetir cifra; las dos tiendas siguientes; «Ver en *tienda*» abajo a la izquierda y el crédito de
 * ITAD abajo a la derecha. Las `url` van tal cual
 * las da ITAD (sus condiciones lo piden). Solo se monta con un mejor precio (`precio.mejor`).
 */
export function PriceBox({ precio, name }: { precio: PrecioItad; name: string }): ReactElement | null {
  const mejor = precio.mejor;
  if (!mejor) return null;
  const otro = matchedOtherTitle(precio, name);
  const hasta = fecha(mejor.hasta, HASTA);
  const historico = precio.minimos.historico;
  /* LOS MÍNIMOS, SIN REPETIRSE (16-10-2026): el del último año y el de 3 meses solo si dicen algo que no diga el de
     antes. Tres veces la misma cifra es una fila entera que no informa. */
  const minimos: Array<[string, number, string | null]> = [];
  let anterior: number | null = null;
  for (const [etiqueta, valor, cuando] of [
    [P.lows.historic, historico?.precio, fecha(historico?.fecha ?? null, MES_Y_ANIO)],
    [P.lows.year, precio.minimos.anio, null],
    [P.lows.months3, precio.minimos.tresMeses, null],
  ] as const) {
    if (typeof valor !== 'number' || valor === anterior) continue;
    minimos.push([etiqueta, valor, cuando]);
    anterior = valor;
  }
  return (
    <section className="gs-price" aria-label={P.boxAria}>
      <div className="gs-price-arriba">
        <div className="gs-price-main">
          <span className="gs-price-now">{formatPrice(mejor.precio)}</span>
          {mejor.descuento > 0 ? <span className="gs-price-cut">−{mejor.descuento} %</span> : null}
          {mejor.descuento > 0 && typeof mejor.normal === 'number' ? <span className="gs-price-regular">{formatPrice(mejor.normal)}</span> : null}
        </div>
        {isHistoricLow(precio) ? <span className="gs-price-low">{P.historicLow}</span> : null}
      </div>
      {mejor.descuento > 0 && !hasta ? null : <p className="gs-price-donde">{mejor.descuento > 0 && hasta ? P.until(hasta) : P.noOffer}</p>}
      {otro ? <p className="gs-price-match">{P.matchedAs(otro)}</p> : null}
      {minimos.length ? (
        <dl className="gs-price-minimos" aria-label={P.lowsAria}>
          {minimos.map(([etiqueta, valor, cuando]) => (
            <div key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>
                {formatPrice(valor)}
                {cuando ? <small>{cuando}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {precio.otras.length ? (
        <ul className="gs-price-otras" aria-label={P.otherStoresAria}>
          {precio.otras.slice(0, 2).map((oferta) => (
            <li key={oferta.tienda}>
              <span>{oferta.tienda}</span>
              <span className="gs-price-otras-precio">
                {formatPrice(oferta.precio)}
                {oferta.descuento > 0 ? <small> −{oferta.descuento} %</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="gs-price-actions">
        <a className="btn btn-primary" href={mejor.url} target="_blank" rel="noopener">
          {P.seeIn(mejor.tienda)}
        </a>
        <a className="gs-price-credit" href={precio.urlFicha ?? ITAD_HOME} target="_blank" rel="noopener">
          {P.credit}
        </a>
      </div>
    </section>
  );
}

/** La atribución al pie de Deseados (P3), discreta y con enlace. */
export function PricesCredit(): ReactElement | null {
  return (
    <p className="prices-credit">
      <a href={ITAD_HOME} target="_blank" rel="noopener">
        {P.credit}
      </a>
    </p>
  );
}
