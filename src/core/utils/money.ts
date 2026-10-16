import { APP_LOCALE } from '../constants/locale';

const FORMATOS = new Map<string, Intl.NumberFormat>();

/**
 * Un importe con su moneda, como se lee en España: «11,99 €». Los precios de IsThereAnyDeal llegan en euros (P0.3),
 * pero la moneda viaja con el importe por si algún día no. Los formateadores se guardan por moneda: crear uno es lo
 * caro, y una lista de deseos pinta cientos de precios.
 */
export function formatPrice(amount: number, currency = 'EUR'): string {
  let formato = FORMATOS.get(currency);
  if (!formato) {
    formato = new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency });
    FORMATOS.set(currency, formato);
  }
  return formato.format(amount);
}
