import { memo, type ReactNode } from 'react';

/**
 * Pie de una figura: lo que la figura NO puede pintar de la parte señalada (el porcentaje, la nota media, el
 * nombre completo de un punto).
 *
 * Está SIEMPRE presente, con un texto de reposo cuando no hay nada señalado: si apareciera y desapareciera, la
 * tarjeta daría un salto cada vez que el puntero cruza una porción, y con las tarjetas en rejilla el salto se
 * propaga a la de al lado.
 *
 * Va `aria-hidden` a propósito: cada parte señalable ya se anuncia con su propio dato al enfocarla (ver
 * `useChartFocus`), y una región viva repitiéndolo convertiría un paseo por la figura en una cháchara.
 */
export const ChartDetail = memo(function ChartDetail({ children }: { children: ReactNode }) {
  return (
    <p className="chart-detail" aria-hidden="true">
      {children}
    </p>
  );
});

/** Texto de reposo del pie: el mismo tono apagado en todas las figuras. */
export const ChartDetailHint = memo(function ChartDetailHint({ children }: { children: ReactNode }) {
  return <span className="chart-detail-hint">{children}</span>;
});
