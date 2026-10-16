import { categoryToneStyle } from '../../core/constants/categoryTone';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';

/**
 * LAS PIEZAS DEL DETALLE DE UN JUEGO, compartidas por la tabla (renglón, caja y detalle desplegado) y por la ficha
 * del juego (`view/components/gameSheet`). Vivían dentro de `GameTable`; salieron cuando la ficha empezó a pintar
 * los mismos chips e insignias, para que las dos se vean igual en todos los temas (los skins visten estas clases).
 */

export function renderTags(values: string[], className: string, maxVisible?: number, tone = false) {
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
          // `data-text`: el texto otra vez, para los temas que pintan una copia encima (el glitch de «Sin futuro»
          // la enciende y apaga en el compositor en vez de animar `text-shadow`; ver `cyberpunk.scss`).
          <span key={value} className={`chip ${className}`} style={tone ? categoryToneStyle(value) : undefined} data-text={value}>
            {/* El texto va en su propio span para que los puntos suspensivos recorten SOLO el texto: con el
                `overflow` en el chip se cortaba también lo que el tema le pinta por fuera (el papel y el lacre
                de Witcher, las sombras duras de las pegatinas). */}
            <span className="chip-text">{value}</span>
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
export function yearsDesc(years?: number[]) {
  return [...(years || [])].sort((a, b) => b - a).map(String);
}

// `role="img"` NO es decorativo aquí, es lo que hace que la insignia se anuncie. Un `<span>` sin rol es
// `generic`, y ARIA PROHÍBE ponerle nombre: el `aria-label` se descartaba y estas celdas —la única
// presentación de "rejugar" y "otra oportunidad"— quedaban mudas para un lector de pantalla, con el icono
// `aria-hidden` dentro y nada más. Lo destapó la auditoría con axe sobre el render (`tests/e2e/a11y.test.ts`);
// el linter no puede verlo porque depende del rol que resulta al pintar, no del JSX.
export function renderBooleanBadge(type: 'replayable' | 'retry', value: boolean) {
  if (type === 'replayable') {
    const label = UI_MESSAGES.table.replayBadge(value);
    return (
      <span className={value ? 'badge-rejugar-activo' : 'badge-rejugar-inactivo'} role="img" aria-label={label} title={label}>
        <Icon name={value ? COMMON_ICONS.starOliveBranches : COMMON_ICONS.lock} />
      </span>
    );
  }

  const label = UI_MESSAGES.table.retryBadge(value);
  return (
    <span className={value ? 'badge-opp-activo' : 'badge-opp-inactivo'} role="img" aria-label={label} title={label}>
      <Icon name={value ? COMMON_ICONS.refresh : COMMON_ICONS.lock} />
    </span>
  );
}
