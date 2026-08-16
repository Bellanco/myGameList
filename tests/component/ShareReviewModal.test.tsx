import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShareReviewModal } from '../../src/view/modals/ShareReviewModal';
import { SHARE_UI } from '../../src/core/constants/labels';

const props = {
  open: true,
  gameName: 'The Witcher III',
  quota: { maxActive: 3, ttlDays: 30 },
  nick: 'Nick',
  nickIsAccountName: false,
  publishing: false,
  error: '',
  errorHint: '',
  publishedUrl: '',
  renewed: false,
  expiresAt: 0,
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

/**
 * El diálogo cuelga de <body>, no del sitio donde se declara.
 *
 * No es un capricho de implementación: el botón que lo abre vive en la barra de acciones del detalle
 * (`.hub-screen-actions`), que en móvil aprieta sus botones a 44×44 con `font-size: 0` para dejarlos en icono.
 * Cuando el diálogo era hermano suyo, esa regla alcanzaba a los botones DE DENTRO y salían como cajas mudas.
 */
describe('ShareReviewModal — montaje fuera de la barra de acciones', () => {
  it('cuelga de <body> aunque se declare dentro de la barra de acciones', () => {
    const { container } = render(
      <div className="hub-screen-actions hub-screen-actions-split">
        <div className="hub-screen-actions-right">
          <button className="btn btn-secondary" type="button">
            <span>{SHARE_UI.action}</span>
          </button>
          <ShareReviewModal {...props} />
        </div>
      </div>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement).toBe(document.body);
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('los botones de acción conservan su rótulo', () => {
    render(<ShareReviewModal {...props} />);
    expect(screen.getByRole('button', { name: SHARE_UI.cancel })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SHARE_UI.confirm })).toBeInTheDocument();
  });
});

/**
 * Reseña YA compartida: el diálogo entra directamente en el enlace que existe.
 *
 * El requisito de producto es evitar que quien vuelve a pulsar "Compartir" acabe creando otro enlace: se le
 * enseña el suyo, con la opción de renovarlo. Renovar reescribe sobre el mismo token —lo hace el servidor—, así
 * que el enlace que ya circula por un chat sigue vivo.
 */
describe('ShareReviewModal — reseña ya compartida', () => {
  const compartida = {
    ...props,
    publishedUrl: 'https://mygamelist.pages.dev/r/TOKEN1234567890abcd',
    expiresAt: Date.now() + 3 * 86_400_000,
    onRenew: vi.fn(),
  };

  it('enseña el enlace actual y cuándo caduca, sin pedir publicar', () => {
    render(<ShareReviewModal {...compartida} />);

    expect(screen.getByText(compartida.publishedUrl)).toBeInTheDocument();
    expect(screen.getByText(SHARE_UI.expiresIn(3))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SHARE_UI.confirm })).toBeNull();
  });

  it('ofrece renovar, y renovar no es publicar', () => {
    const onRenew = vi.fn();
    render(<ShareReviewModal {...compartida} onRenew={onRenew} />);

    screen.getByRole('button', { name: SHARE_UI.renew }).click();
    expect(onRenew).toHaveBeenCalledTimes(1);
    expect(compartida.onConfirm).not.toHaveBeenCalled();
  });

  it('no ofrece renovar cuando el enlace se acaba de crear', () => {
    render(<ShareReviewModal {...compartida} onRenew={undefined} renewed />);

    expect(screen.queryByRole('button', { name: SHARE_UI.renew })).toBeNull();
    expect(screen.getByText(SHARE_UI.renewed)).toBeInTheDocument();
  });
});
