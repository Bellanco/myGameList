import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { joinFromPremios } from '../../src/core/onboarding/joinFromPremios';
import { offeredTour, parseTourState, type TourState } from '../../src/core/onboarding/tourState';
import { onboardingStore, saveTourState } from '../../src/model/repository/onboardingStore';
import { usePremiosJoinInvite } from '../../src/viewmodel/premios/usePremiosJoinInvite';

/**
 * LA INVITACIÓN A QUEDARSE AL TERMINAR DE VOTAR: una vez por edición, y aceptarla pone en marcha la guía de
 * primeros pasos desde el primer juego —sin la tarjeta de bienvenida, porque el sí ya está dado—.
 */
afterEach(() => {
  localStorage.clear();
});

describe('joinFromPremios', () => {
  it('sin guía, arranca la guía entera por el primer juego', () => {
    expect(joinFromPremios(null)).toMatchObject({ status: 'active', mission: 'first-game', step: 0, single: false });
  });

  it('sobre la bienvenida o una guía cerrada, también; y el primer juego vuelve a estar pendiente', () => {
    expect(joinFromPremios(offeredTour())).toMatchObject({ status: 'active', mission: 'first-game' });
    const cerrada: TourState = { ...offeredTour(), status: 'dismissed', completed: ['first-game'], skipped: ['cloud'] };
    expect(joinFromPremios(cerrada)).toMatchObject({ status: 'active', mission: 'first-game', completed: [], skipped: ['cloud'] });
  });

  it('con una guía en marcha no toca nada', () => {
    for (const status of ['active', 'paused', 'menu', 'finale'] as const) {
      expect(joinFromPremios({ ...offeredTour(), status, mission: 'cloud' })).toBeNull();
    }
  });
});

describe('usePremiosJoinInvite', () => {
  it('solo sale a quien puede recibirla y con la edición conocida', () => {
    expect(renderHook(() => usePremiosJoinInvite('2026', false)).result.current.show).toBe(false);
    expect(renderHook(() => usePremiosJoinInvite('', true)).result.current.show).toBe(false);
    expect(renderHook(() => usePremiosJoinInvite('2026', true)).result.current.show).toBe(true);
  });

  it('«Ahora no» la quita en esta edición, y vuelve en la siguiente', () => {
    const { result } = renderHook(() => usePremiosJoinInvite('2026', true));
    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);

    expect(renderHook(() => usePremiosJoinInvite('2026', true)).result.current.show).toBe(false);
    expect(renderHook(() => usePremiosJoinInvite('2027', true)).result.current.show).toBe(true);
  });

  it('aceptar pone en marcha la guía y tampoco se vuelve a ofrecer en la edición', () => {
    const { result } = renderHook(() => usePremiosJoinInvite('2026', true));
    act(() => result.current.accept());

    expect(parseTourState(onboardingStore.get())).toMatchObject({ status: 'active', mission: 'first-game' });
    expect(result.current.show).toBe(false);
  });

  it('aceptar con una guía en marcha la deja como estaba', () => {
    saveTourState({ ...offeredTour(), status: 'paused', mission: 'cloud' });
    const { result } = renderHook(() => usePremiosJoinInvite('2026', true));
    act(() => result.current.accept());

    expect(parseTourState(onboardingStore.get())).toMatchObject({ status: 'paused', mission: 'cloud' });
  });
});
