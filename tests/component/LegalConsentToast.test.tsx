import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGAL_CONSENT_SEALED_EVENT, LEGAL_VERSION } from '../../src/core/constants/legal';
import { LEGAL_NOTICE_UI } from '../../src/core/constants/legalNoticeLabels';
import { LEGAL_NOTICE_TOLD_KEY } from '../../src/core/constants/storageKeys';

// LA CÁPSULA DEL AVISO LEGAL (docs/plan-feed-sin-vacio.md, Fase 6).
//
// Sin la aceptación de las condiciones vigentes no sale nada del dispositivo (Fase 2), y quien no abre el hub no se
// entera de que tiene algo pendiente: su actividad deja de llegar a sus amigos. La cápsula del carril se lo dice una
// vez por versión y le lleva a la pantalla de aceptación.

const meta = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getLocalMeta: vi.fn(async () => meta.value),
}));

const { LegalConsentToast } = await import('../../src/view/components/LegalConsentToast');
const { useLegalConsentNotice } = await import('../../src/view/hooks/useLegalConsentNotice');

const sello = (version: string) => ({ legalConsent: { uid: 'uid-1', version, checkedAt: Date.now() } });

beforeEach(() => {
  localStorage.clear();
  meta.value = null;
});

describe('useLegalConsentNotice', () => {
  it('sale con el social dado de alta y una versión vieja sellada', async () => {
    meta.value = sello('2020-01-01');
    const { result } = renderHook(() => useLegalConsentNotice(true));
    await waitFor(() => expect(result.current.show).toBe(true));
  });

  it('no sale con la versión vigente aceptada', async () => {
    meta.value = sello(LEGAL_VERSION);
    const { result } = renderHook(() => useLegalConsentNotice(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.show).toBe(false);
  });

  it('no sale sin el social dado de alta en este dispositivo', async () => {
    meta.value = sello('2020-01-01');
    const { result } = renderHook(() => useLegalConsentNotice(false));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.show).toBe(false);
  });

  it('sin nada comprobado todavía no sale: no se sabe', async () => {
    const { result } = renderHook(() => useLegalConsentNotice(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.show).toBe(false);
  });

  it('una vez por versión: dada por dicha, no vuelve', async () => {
    meta.value = sello('2020-01-01');
    localStorage.setItem(LEGAL_NOTICE_TOLD_KEY, LEGAL_VERSION);
    const { result } = renderHook(() => useLegalConsentNotice(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.show).toBe(false);
  });

  it('al montarse se apunta como dada, y al cerrarla se retira', async () => {
    meta.value = sello('2020-01-01');
    const { result } = renderHook(() => useLegalConsentNotice(true));
    await waitFor(() => expect(result.current.show).toBe(true));

    act(() => result.current.markShown());
    expect(localStorage.getItem(LEGAL_NOTICE_TOLD_KEY)).toBe(LEGAL_VERSION);
    act(() => result.current.dismiss());
    expect(result.current.show).toBe(false);
  });

  it('se entera en cuanto la puerta sella (sin esperar a otra apertura), y se retira al aceptar', async () => {
    const { result } = renderHook(() => useLegalConsentNotice(true));
    meta.value = sello('2020-01-01');
    act(() => { window.dispatchEvent(new Event(LEGAL_CONSENT_SEALED_EVENT)); });
    await waitFor(() => expect(result.current.show).toBe(true));

    meta.value = sello(LEGAL_VERSION);
    act(() => { window.dispatchEvent(new Event(LEGAL_CONSENT_SEALED_EVENT)); });
    await waitFor(() => expect(result.current.show).toBe(false));
  });
});

describe('useLegalConsentNotice · el espacio social', () => {
  // Dentro del hub ya sale la pantalla de aceptar: entrar cuenta como dicho. Si no, al volver a las listas sin
  // aceptar, la cápsula reaparecía en la misma sesión aunque es «una vez por versión».
  it('dentro del espacio social no sale, y entrar en él la da por dicha', async () => {
    meta.value = sello('2020-01-01');
    const { result, rerender } = renderHook(({ inSocial }) => useLegalConsentNotice(true, inSocial), { initialProps: { inSocial: false } });
    await waitFor(() => expect(result.current.show).toBe(true));

    rerender({ inSocial: true });
    await waitFor(() => expect(result.current.show).toBe(false));
    expect(localStorage.getItem(LEGAL_NOTICE_TOLD_KEY)).toBe(LEGAL_VERSION);

    rerender({ inSocial: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.show).toBe(false);
  });
});

describe('LegalConsentToast', () => {
  it('dice lo que pasa y, al pulsarla, lleva al hub y se cierra', async () => {
    const onShown = vi.fn();
    const onDone = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LegalConsentToast onShown={onShown} onDone={onDone} />} />
          <Route path="/social" element={<p>hub</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(onShown).toHaveBeenCalledTimes(1);
    const boton = screen.getByRole('button', { name: LEGAL_NOTICE_UI.aria });
    expect(boton.textContent).toContain(LEGAL_NOTICE_UI.title);
    fireEvent.click(boton);

    expect(onDone).toHaveBeenCalled();
    expect(await screen.findByText('hub')).toBeTruthy();
  });

  it('se anuncia en su región viva', async () => {
    render(
      <MemoryRouter>
        <LegalConsentToast />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(LEGAL_NOTICE_UI.announce));
  });
});
