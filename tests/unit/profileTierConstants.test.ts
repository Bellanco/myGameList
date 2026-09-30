import { describe, expect, it } from 'vitest';
import rulesFile from '../../firestore.rules?raw';
import {
  ADMIN_ONLY_TIER,
  DEFAULT_PROFILE_TIER,
  PROFILE_TIER,
  PROFILE_TIER_LABELS,
  PROFILE_TIERS,
} from '../../src/core/constants/tiers';

/**
 * LOS RANGOS CON NOMBRE (`PROFILE_TIER`) y todo lo que sale de ellos. El valor es el que se guarda en Firestore,
 * así que estas pruebas fijan también que no se renombre ninguno: dejaría sin rango a los perfiles que ya lo tienen.
 */
describe('constantes de rango', () => {
  it('los valores son los que ya hay guardados en Firestore', () => {
    expect(PROFILE_TIER).toEqual({ bronze: 'bronze', silver: 'silver', gold: 'gold', mithril: 'mithril' });
  });

  it('la lista ordenada tiene todos, de menor a mayor, y ninguno más', () => {
    expect(PROFILE_TIERS).toEqual([PROFILE_TIER.bronze, PROFILE_TIER.silver, PROFILE_TIER.gold, PROFILE_TIER.mithril]);
    expect(new Set(PROFILE_TIERS)).toEqual(new Set(Object.values(PROFILE_TIER)));
  });

  it('bronce por defecto y mithril reservado al administrador', () => {
    expect(DEFAULT_PROFILE_TIER).toBe(PROFILE_TIER.bronze);
    expect(ADMIN_ONLY_TIER).toBe(PROFILE_TIER.mithril);
  });

  it('cada rango tiene su nombre visible', () => {
    for (const tier of PROFILE_TIERS) {
      expect(PROFILE_TIER_LABELS[tier]).toBeTruthy();
    }
  });

  // PAR con `firestore.rules`: su lenguaje no puede importar estas constantes, así que repite los nombres a mano
  // en los topes por rango. Un rango nuevo que no llegue allí caería al tope de bronce sin avisar.
  it('las reglas de Firestore conocen todos los rangos por encima del de por defecto', () => {
    for (const tier of PROFILE_TIERS.filter((value) => value !== DEFAULT_PROFILE_TIER)) {
      expect(rulesFile, tier).toContain(`tier == '${tier}'`);
    }
  });
});
