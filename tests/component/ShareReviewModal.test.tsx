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
