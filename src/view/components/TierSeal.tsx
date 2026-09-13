import { memo } from 'react';
import { PROFILE_TIER_LABELS, normalizeTier } from '../../core/constants/tiers';
import type { ProfileTier } from '../../core/constants/tiers';

interface TierSealProps {
  /** Lo que venga del perfil; un valor desconocido cae a bronce (`normalizeTier`). */
  tier?: ProfileTier | string | null;
  className?: string;
}

/**
 * EL SELLO DE RANGO: el rango del perfil, dicho con color Y con la palabra.
 *
 * El rango existía ya en dos sitios y en los dos solo como COLOR —la muesca de la tarjeta de persona y el borde
 * del selector del panel de administración—, que es lo que pide una rejilla donde se recorre y se compara. En una
 * página de perfil no hay nada con lo que comparar: ahí el color solo no dice «oro», así que el sello lo escribe.
 * Es también lo que lo hace legible para quien no distingue esos cuatro metales.
 *
 * FORMA DELIBERADAMENTE DISTINTA DE LA MEDALLA. En el hero del perfil este sello convive con la tira de logros,
 * que son discos en penumbra con el filo templado en cobre, plata y oro; dos juegos de metales pegados se
 * confunden (lo avisa `docs/logros/receta-medalla.md`). Por eso el rango es una píldora con un disco pequeño y
 * plano, una forma que la medalla no usa nunca.
 *
 * No dice lo que el rango DA (frescura del feed, longitud de las publicaciones, cuotas de los enlaces
 * compartidos): eso vive donde se usa, y aquí sería un párrafo en una esquina.
 */
export const TierSeal = memo(function TierSeal({ tier, className = '' }: TierSealProps) {
  if (!tier) return null;
  const rank = normalizeTier(tier);
  const label = PROFILE_TIER_LABELS[rank];

  return (
    <span className={`tier-seal tier-${rank} ${className}`.trim()} title={label}>
      <span className="tier-seal-disc" aria-hidden="true" />
      {label}
    </span>
  );
});
