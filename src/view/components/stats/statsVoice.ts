import { createContext, useContext } from 'react';
import { type StatsLabels } from '../../../core/constants/labels';
import { STATS_UI } from '../../../core/constants/statsLabels';
import { STATS_LABELS_OTHER } from '../../../core/constants/statsOtherLabels';

/**
 * DE QUIÉN habla el panel. Es lo único que distingue tu panel del de otra persona en cuanto a textos: la
 * pantalla, los bloques y el cálculo son los mismos (ver `StatsPanel`).
 *
 * Va por contexto y no por props porque los textos con voz no están solo en las cabeceras de los bloques: viven
 * dentro de las piezas (el «su media» de las filas de géneros, el «El resto de su top» del podio, el vacío de
 * cada gráfico). Pasarlo a mano obligaría a enhebrar una prop por toda la profundidad del árbol para que al
 * final la lea una etiqueta suelta.
 */
export type StatsVoice = 'own' | 'other';

export const STATS_LABELS: Record<StatsVoice, StatsLabels> = {
  own: STATS_UI,
  other: STATS_LABELS_OTHER,
};

/** Por defecto se habla de TI: es el panel propio, y así una pieza montada fuera del panel no se queda muda. */
const StatsLabelsContext = createContext<StatsLabels>(STATS_LABELS.own);

export const StatsLabelsProvider = StatsLabelsContext.Provider;

/** Los textos del panel en la voz que toque. Sustituye al `STATS_UI` de nivel de módulo. */
export function useStatsLabels(): StatsLabels {
  return useContext(StatsLabelsContext);
}
