import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialRequestsScreen } from '../../src/view/components/socialhub/SocialRequestsScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';

const baseProps = {
  SOCIAL_UI,
  friendsList: [],
  loading: false,
  busyUid: '',
  onAccept: vi.fn(),
  onReject: vi.fn(),
  onCancel: vi.fn(),
  onRemove: vi.fn(),
  onBack: vi.fn(),
  status: '',
  statusKind: 'ok',
};

describe('SocialRequestsScreen', () => {
  // Sin peticiones no se dice que no las hay: el bloque entero desaparece. Lo normal es no tener ninguna, y esta
  // pantalla no debería ser dos frases anunciando la nada. El de AMIGOS sí se queda: ahí el vacío explica dónde
  // se piden.
  it('oculta los bloques de peticiones cuando no hay ninguna, y conserva el de amigos', () => {
    render(<SocialRequestsScreen {...baseProps} incomingRequests={[]} outgoingRequests={[]} />);

    expect(screen.queryByText(SOCIAL_UI.requests.incomingTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(SOCIAL_UI.requests.outgoingTitle)).not.toBeInTheDocument();
    expect(screen.getByText(SOCIAL_UI.requests.friendsEmpty)).toBeInTheDocument();
  });

  it('lista los amigos y permite eliminarlos (gestión independiente del directorio)', () => {
    const onRemove = vi.fn();
    render(
      <SocialRequestsScreen
        {...baseProps}
        onRemove={onRemove}
        incomingRequests={[]}
        outgoingRequests={[]}
        friendsList={[{ docId: 'ada__me', otherUid: 'ada', name: 'Ada', photo: '' }]}
      />,
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(SOCIAL_UI.requests.removeAria('Ada')));
    expect(onRemove).toHaveBeenCalledWith('ada');
  });

  it('acepta y rechaza una petición recibida con el uid correcto', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <SocialRequestsScreen
        {...baseProps}
        onAccept={onAccept}
        onReject={onReject}
        incomingRequests={[{ docId: 'a__me', otherUid: 'a', name: 'Ada', photo: '' }]}
        outgoingRequests={[]}
      />,
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(SOCIAL_UI.requests.acceptAria('Ada')));
    fireEvent.click(screen.getByLabelText(SOCIAL_UI.requests.rejectAria('Ada')));
    expect(onAccept).toHaveBeenCalledWith('a');
    expect(onReject).toHaveBeenCalledWith('a');
  });

  // Solo hay perfil que abrir donde ya hay amistad: en recibidas y enviadas ni siquiera se enseña la cara.
  describe('abrir el perfil desde la bandeja', () => {
    it('abre el perfil al pulsar la tarjeta de un amigo', () => {
      const onOpenProfile = vi.fn();
      render(
        <SocialRequestsScreen
          {...baseProps}
          onOpenProfile={onOpenProfile}
          incomingRequests={[]}
          outgoingRequests={[]}
          friendsList={[{ docId: 'ada__me', otherUid: 'ada', name: 'Ada', photo: '', profileId: 'perfil-ada' }]}
        />,
      );

      fireEvent.click(screen.getByLabelText(SOCIAL_UI.requests.openFriendAria('Ada')));
      expect(onOpenProfile).toHaveBeenCalledWith('perfil-ada');
    });

    it('no hace pulsable la tarjeta de una petición pendiente', () => {
      const onOpenProfile = vi.fn();
      const { container } = render(
        <SocialRequestsScreen
          {...baseProps}
          onOpenProfile={onOpenProfile}
          incomingRequests={[{ docId: 'a__me', otherUid: 'a', name: 'Ada', photo: '', profileId: 'perfil-ada' }]}
          outgoingRequests={[]}
        />,
      );

      expect(container.querySelector('.hub-user-card.is-clickable')).not.toBeInTheDocument();
    });

    // Un amigo puede no estar en el directorio (fuera del tope, o con el espacio social cerrado): sin ficha no
    // hay perfil que abrir, y la tarjeta se queda de solo lectura en vez de llevar a ninguna parte.
    it('deja de solo lectura al amigo que no tiene ficha en el directorio', () => {
      const { container } = render(
        <SocialRequestsScreen
          {...baseProps}
          onOpenProfile={vi.fn()}
          incomingRequests={[]}
          outgoingRequests={[]}
          friendsList={[{ docId: 'ada__me', otherUid: 'ada', name: 'Ada', photo: '' }]}
        />,
      );

      expect(container.querySelector('.hub-user-card.is-clickable')).not.toBeInTheDocument();
    });
  });

  // El rango solo se conoce de quien está en el directorio; al resto no se le inventa un bronce.
  it('pinta el punto de rango solo cuando la fila lo trae', () => {
    const { container } = render(
      <SocialRequestsScreen
        {...baseProps}
        incomingRequests={[{ docId: 'a__me', otherUid: 'a', name: 'Ada', photo: '', tier: 'mithril' }]}
        outgoingRequests={[]}
        friendsList={[{ docId: 'zoe__me', otherUid: 'zoe', name: 'Zoe', photo: '' }]}
      />,
    );

    expect(container.querySelectorAll('.hub-tier-notch')).toHaveLength(1);
    expect(container.querySelector('.hub-tier-notch.tier-mithril')).toBeInTheDocument();
  });

  it('cancela una petición enviada y deshabilita el botón del uid en curso', () => {
    const onCancel = vi.fn();
    render(
      <SocialRequestsScreen
        {...baseProps}
        onCancel={onCancel}
        busyUid="z"
        incomingRequests={[]}
        outgoingRequests={[{ docId: 'me__z', otherUid: 'z', name: 'Zoe', photo: '' }]}
      />,
    );
    const cancelBtn = screen.getByLabelText(SOCIAL_UI.requests.cancelAria('Zoe'));
    expect(cancelBtn).toBeDisabled();
    fireEvent.click(cancelBtn);
    expect(onCancel).not.toHaveBeenCalled(); // deshabilitado → sin efecto
  });
});
