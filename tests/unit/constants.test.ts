import { describe, expect, it } from 'vitest';
import { TAB_IDS } from '../../src/model/types/game';
import { TAB_ORDER } from '../../src/core/constants/labels';

/**
 * Guards the Phase 6 consolidation: TAB_IDS (in model/types/game) is the single source
 * of truth for the tab ids, and everything else (labels.TAB_ORDER, the repositories,
 * the viewmodels, TabBar, etc.) derives from it. These assertions catch drift if someone
 * re-hardcodes a different tab list anywhere.
 */
describe('tab id constants', () => {
  it('TAB_IDS holds the four canonical tabs in order', () => {
    expect([...TAB_IDS]).toEqual(['c', 'v', 'e', 'p']);
  });

  it('labels.TAB_ORDER stays in sync with TAB_IDS (no duplicated literal)', () => {
    expect(TAB_ORDER).toEqual([...TAB_IDS]);
  });
});
