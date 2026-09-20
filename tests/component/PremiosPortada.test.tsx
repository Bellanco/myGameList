import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PremiosPortada, type PremiosPortadaProps } from '../../src/view/components/premios/PremiosPortada';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosVotingConfig } from '../../src/model/types/premios';

const L = PREMIOS_UI.portada;

const config: PremiosVotingConfig = {
  isOpen: true,
  season: 2026,
  seasonName: 'El reto del jugador 2026',
  opensAtMillis: Date.now() - 86_400_000,
  closesAtMillis: Date.now() + 86_400_000,
  resultsAtMillis: null,
};

/** La portada en el caso normal: edición abierta, sesión iniciada y cuenta social de bronce. */
const base: PremiosPortadaProps = {
  config,
  votingOpen: true,
  hasResults: false,
  hasBallot: false,
  canEdit: false,
  votedCount: 0,
  total: 8,
  signedIn: true,
  signingIn: false,
  signInError: '',
  onSignIn: () => {},
  opportunities: 5,
  remainingOpportunities: 5,
  hasSocialAccount: true,
};

const pintar = (props: Partial<PremiosPortadaProps> = {}) =>
  render(
    <MemoryRouter>
      <PremiosPortada {...base} {...props} />
    </MemoryRouter>,
  );

describe('PremiosPortada — la puerta de la sección', () => {
  it('con sesión y votación abierta se empieza a votar', () => {
    pintar();
    expect(screen.getByRole('link', { name: L.start })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: L.signIn })).not.toBeInTheDocument();
  });

  // EL REQUISITO: sin cuenta de Google no se vota, se entra. Y se entra desde aquí mismo, no desde otra pantalla.
  it('sin sesión ofrece identificarse en el sitio del botón de votar', async () => {
    const onSignIn = vi.fn();
    pintar({ signedIn: false, onSignIn });

    expect(screen.queryByRole('link', { name: L.start })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: L.signIn }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  // Los resultados publicados se ven SIN cuenta: es lo que hace que el enlace compartido sirva para algo.
  it('sin sesión se siguen pudiendo ver los resultados publicados', () => {
    pintar({ signedIn: false, hasResults: true });
    expect(screen.getByRole('link', { name: L.seeResults })).toBeInTheDocument();
  });

  it('dice el cupo de oportunidades de esta cuenta', () => {
    pintar({ opportunities: 15 });
    expect(screen.getByText(L.opportunities(15))).toBeInTheDocument();
  });

  it('a quien ya votó le dice las que le quedan', () => {
    pintar({ hasBallot: true, canEdit: true, remainingOpportunities: 3 });
    expect(screen.getByText(L.opportunitiesLeft(3))).toBeInTheDocument();
  });

  // Quien vota con cuenta ligera tiene una sola oportunidad: es el único sitio donde enterarse sirve de algo,
  // porque es antes de gastarla.
  it('a quien no tiene cuenta social le cuenta qué se gana con ella', () => {
    pintar({ hasSocialAccount: false, opportunities: 1 });
    expect(screen.getByText(L.opportunities(1))).toBeInTheDocument();
    expect(screen.getByText(L.moreWithSocial)).toBeInTheDocument();
  });

  it('con cuenta social no se le ofrece nada', () => {
    pintar();
    expect(screen.queryByText(L.moreWithSocial)).not.toBeInTheDocument();
  });

  it('el fallo al entrar se dice y deja reintentar', () => {
    pintar({ signedIn: false, signInError: L.signInFailed });
    expect(screen.getByRole('alert')).toHaveTextContent(L.signInFailed);
    expect(screen.getByRole('button', { name: L.signIn })).toBeEnabled();
  });

  // Sin edición en marcha ni resultados no hay nada que compartir: el enlace llevaría a una pantalla vacía.
  it('no ofrece compartir cuando no hay nada en marcha', () => {
    pintar({ votingOpen: false, hasResults: false });
    expect(screen.queryByRole('button', { name: new RegExp(PREMIOS_UI.compartir.copy, 'i') })).not.toBeInTheDocument();
  });
});
