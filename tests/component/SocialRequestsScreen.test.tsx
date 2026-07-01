import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialRequestsScreen } from '../../src/view/components/socialhub/SocialRequestsScreen';
import { SOCIAL_UI } from '../../src/core/constants/labels';

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
  it('muestra estados vacíos cuando no hay solicitudes', () => {
    render(<SocialRequestsScreen {...baseProps} incomingRequests={[]} outgoingRequests={[]} />);
    expect(screen.getByText(SOCIAL_UI.requests.incomingEmpty)).toBeInTheDocument();
    expect(screen.getByText(SOCIAL_UI.requests.outgoingEmpty)).toBeInTheDocument();
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
