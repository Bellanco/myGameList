import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialRequestsScreen } from '../../src/view/components/socialhub/SocialRequestsScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';

const baseProps = {
  SOCIAL_UI,
  loading: false,
  busyUid: '',
  onAccept: vi.fn(),
  onReject: vi.fn(),
  onBack: vi.fn(),
  status: '',
  statusKind: 'ok',
};

const ADA = { docId: 'a__me', otherUid: 'a', name: 'Ada', photo: '' };

describe('SocialRequestsScreen', () => {
  // Solo lo que te piden a ti (09-10-2026): las enviadas y los amigos ya están en «Perfiles».
  it('enseña solo las recibidas: ni enviadas ni lista de amigos', () => {
    render(<SocialRequestsScreen {...baseProps} incomingRequests={[ADA]} />);

    expect(screen.getByText(SOCIAL_UI.requests.incomingTitle)).toBeInTheDocument();
    expect(screen.queryByText('Enviadas')).not.toBeInTheDocument();
    expect(screen.queryByText('Amigos')).not.toBeInTheDocument();
    expect(screen.queryByText(SOCIAL_UI.requests.empty)).not.toBeInTheDocument();
  });

  // Contestar la última no te saca de la pantalla: se queda el aviso y el botón de volver.
  it('sin peticiones, avisa de que no hay ninguna y deja volver', () => {
    const onBack = vi.fn();
    render(<SocialRequestsScreen {...baseProps} onBack={onBack} incomingRequests={[]} />);

    expect(screen.getByText(SOCIAL_UI.requests.empty)).toBeInTheDocument();
    expect(screen.queryByText(SOCIAL_UI.requests.incomingTitle)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(SOCIAL_UI.requests.back) }));
    expect(onBack).toHaveBeenCalled();
  });

  it('mientras carga no dice que no hay ninguna', () => {
    render(<SocialRequestsScreen {...baseProps} loading incomingRequests={[]} />);

    expect(screen.queryByText(SOCIAL_UI.requests.empty)).not.toBeInTheDocument();
  });

  it('acepta y rechaza una petición recibida con el uid correcto', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<SocialRequestsScreen {...baseProps} onAccept={onAccept} onReject={onReject} incomingRequests={[ADA]} />);

    expect(screen.getByText('Ada')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(SOCIAL_UI.requests.acceptAria('Ada')));
    fireEvent.click(screen.getByLabelText(SOCIAL_UI.requests.rejectAria('Ada')));
    expect(onAccept).toHaveBeenCalledWith('a');
    expect(onReject).toHaveBeenCalledWith('a');
  });

  it('deshabilita los botones del uid en curso', () => {
    const onAccept = vi.fn();
    render(<SocialRequestsScreen {...baseProps} onAccept={onAccept} busyUid="a" incomingRequests={[ADA]} />);

    const accept = screen.getByLabelText(SOCIAL_UI.requests.acceptAria('Ada'));
    expect(accept).toBeDisabled();
    fireEvent.click(accept);
    expect(onAccept).not.toHaveBeenCalled();
  });

  // Antes de la amistad no hay perfil que abrir: ni siquiera se enseña la cara.
  it('no hace pulsable la tarjeta de una petición', () => {
    const { container } = render(<SocialRequestsScreen {...baseProps} incomingRequests={[ADA]} />);

    expect(container.querySelector('.hub-user-card.is-clickable')).not.toBeInTheDocument();
  });

  // El rango solo se conoce de quien está en el directorio; al resto no se le inventa un bronce.
  it('pinta el punto de rango solo cuando la fila lo trae', () => {
    const { container } = render(
      <SocialRequestsScreen
        {...baseProps}
        showTiers
        incomingRequests={[{ ...ADA, tier: 'mithril' }, { docId: 'z__me', otherUid: 'z', name: 'Zoe', photo: '' }]}
      />,
    );

    expect(container.querySelectorAll('.hub-tier-notch')).toHaveLength(1);
    expect(container.querySelector('.hub-tier-notch.tier-mithril')).toBeInTheDocument();
  });

  // De cara al usuario los rangos no se nombran: solo la administración ve la muesca (`showTiers`).
  it('sin showTiers no pinta el rango aunque la fila lo traiga', () => {
    const { container } = render(<SocialRequestsScreen {...baseProps} incomingRequests={[{ ...ADA, tier: 'mithril' }]} />);

    expect(container.querySelector('.hub-tier-notch')).toBeNull();
  });
});
