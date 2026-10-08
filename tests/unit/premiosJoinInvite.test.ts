import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isGuideShowing, joinFromPremios } from '../../src/core/onboarding/joinFromPremios';
import { offeredTour, parseTourState, type TourState } from '../../src/core/onboarding/tourState';
import { onboardingStore, saveTourState } from '../../src/model/repository/onboardingStore';
import { usePremiosJoinInvite } from '../../src/viewmodel/premios/usePremiosJoinInvite';

/**
 * LA INVITACIÓN AL RESTO DE LA APLICACIÓN, al terminar de votar y en el histórico: una vez por edición —la misma
 * respuesta para los dos sitios—, y aceptarla pone en marcha la guía de primeros pasos sin la tarjeta de bienvenida,
 * porque el sí ya está dado. Sin juegos, la guía entera; con la lista ya hecha, solo lo social.
 */
afterEach(() => {
  localStorage.clear();
});

describe('joinFromPremios', () => {
  it('sin guía, arranca la guía entera por el primer juego', () => {
    expect(joinFromPremios(null)).toMatchObject({ status: 'active', mission: 'first-game', step: 0, single: false });
  });

  it('a quien ya lleva su lista, solo el modo cooperativo', () => {
    expect(joinFromPremios(null, 'social')).toMatchObject({ status: 'active', mission: 'coop', step: 0, single: true });
    const hecha: TourState = { ...offeredTour(), status: 'done', completed: ['first-game', 'coop'] };
    expect(joinFromPremios(hecha, 'social')).toMatchObject({ mission: 'coop', completed: ['first-game'] });
  });

  it('sobre la bienvenida o una guía cerrada, también; y el primer juego vuelve a estar pendiente', () => {
    expect(joinFromPremios(offeredTour())).toMatchObject({ status: 'active', mission: 'first-game' });
    const cerrada: TourState = { ...offeredTour(), status: 'dismissed', completed: ['first-game'], skipped: ['cloud'] };
    expect(joinFromPremios(cerrada)).toMatchObject({ status: 'active', mission: 'first-game', completed: [], skipped: ['cloud'] });
  });

  it('con una guía en marcha no toca nada', () => {
    for (const status of ['active', 'paused', 'menu', 'finale'] as const) {
      expect(joinFromPremios({ ...offeredTour(), status, mission: 'cloud' })).toBeNull();
      expect(joinFromPremios({ ...offeredTour(), status, mission: 'cloud' }, 'social')).toBeNull();
    }
  });
});

describe('isGuideShowing', () => {
  it('la guía manda mientras pinta algo, la bienvenida incluida', () => {
    for (const status of ['offer', 'active', 'paused', 'menu', 'finale'] as const) {
      expect(isGuideShowing({ ...offeredTour(), status })).toBe(true);
    }
  });

  it('sin guía, cerrada, hecha o con un ofrecimiento de otra pantalla, no', () => {
    expect(isGuideShowing(null)).toBe(false);
    for (const status of ['dismissed', 'done', 'hint'] as const) {
      expect(isGuideShowing({ ...offeredTour(), status })).toBe(false);
    }
  });
});

describe('usePremiosJoinInvite', () => {
  it('solo sale a quien puede recibirla y con la edición conocida', () => {
    expect(renderHook(() => usePremiosJoinInvite('2026', null)).result.current.show).toBe(false);
    expect(renderHook(() => usePremiosJoinInvite('', 'list')).result.current.show).toBe(false);
    expect(renderHook(() => usePremiosJoinInvite('2026', 'list')).result.current.show).toBe(true);
    expect(renderHook(() => usePremiosJoinInvite('2026', 'social')).result.current.show).toBe(true);
  });

  it('«Ahora no» la quita en esta edición, y vuelve en la siguiente', () => {
    const { result } = renderHook(() => usePremiosJoinInvite('2026', 'list'));
    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);

    expect(renderHook(() => usePremiosJoinInvite('2026', 'list')).result.current.show).toBe(false);
    expect(renderHook(() => usePremiosJoinInvite('2027', 'list')).result.current.show).toBe(true);
  });

  // Al votar y en el histórico es la misma invitación: quien la aparta en un sitio no se la encuentra en el otro,
  // aunque entretanto haya empezado su lista y ahora se le invitara a otra cosa.
  it('la respuesta vale para la edición, se le invite a lo que se le invite', () => {
    const { result } = renderHook(() => usePremiosJoinInvite('2026', 'list'));
    act(() => result.current.dismiss());
    expect(renderHook(() => usePremiosJoinInvite('2026', 'social')).result.current.show).toBe(false);
  });

  it('aceptar pone en marcha la guía y tampoco se vuelve a ofrecer en la edición', () => {
    const { result } = renderHook(() => usePremiosJoinInvite('2026', 'list'));
    act(() => result.current.accept());

    expect(parseTourState(onboardingStore.get())).toMatchObject({ status: 'active', mission: 'first-game' });
    expect(result.current.show).toBe(false);
  });

  it('aceptar la de lo social arranca solo el modo cooperativo', () => {
    const { result } = renderHook(() => usePremiosJoinInvite('2026', 'social'));
    act(() => result.current.accept());

    expect(parseTourState(onboardingStore.get())).toMatchObject({ status: 'active', mission: 'coop', single: true });
  });

  it('con la guía en pantalla se calla, y vuelve cuando la guía se cierra', () => {
    saveTourState({ ...offeredTour(), status: 'paused', mission: 'cloud' });
    const { result } = renderHook(() => usePremiosJoinInvite('2026', 'list'));
    expect(result.current.show).toBe(false);

    act(() => saveTourState({ ...offeredTour(), status: 'dismissed' }));
    expect(result.current.show).toBe(true);
  });

  it('aceptar con una guía en marcha la deja como estaba', () => {
    saveTourState({ ...offeredTour(), status: 'paused', mission: 'cloud' });
    const { result } = renderHook(() => usePremiosJoinInvite('2026', 'list'));
    act(() => result.current.accept());

    expect(parseTourState(onboardingStore.get())).toMatchObject({ status: 'paused', mission: 'cloud' });
  });
});
