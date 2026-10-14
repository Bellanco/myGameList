import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { FormModal } from '../../src/view/modals/FormModal';
import type { GameDraft } from '../../src/viewmodel/useGameListViewModel';

function makeDraft(over: Partial<GameDraft> = {}): GameDraft {
  return {
    name: '', genres: [], platforms: [], steamDeck: false, score: 0, years: [], strengths: [], weaknesses: [],
    reasons: [], replayable: false, retry: false, hours: null, scored: false, review: '', ...over,
  };
}
const NO_LOOKUPS = { genres: [], platforms: [], strengths: [], weaknesses: [] };
const EMPTY = makeDraft();
const GAME = makeDraft({ id: 1, name: 'Hollow Knight', genres: ['RPG'], platforms: ['PC'], score: 5, years: [2024], review: 'Base' });

afterEach(() => vi.restoreAllMocks());

/**
 * Reabrir tras guardar: el modal sigue montado (useMountedOnceOpen) con el borrador local que dejó el cierre
 * (EMPTY_DRAFT). El `<dialog>` NO debe abrirse (showModal) con ese borrador rancio: en Chromium una pulsación
 * puede entrar entre la apertura y la re-siembra y lo tecleado se pierde.
 */
describe('FormModal — reabrir tras guardar', () => {
  it('abre el diálogo con el borrador del juego ya pintado, no con el del cierre anterior', () => {
    const vistos: Array<{ review: string | undefined; name: string | undefined; title: string | null | undefined }> = [];
    const original = HTMLDialogElement.prototype.showModal;
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      vistos.push({
        review: this.querySelector<HTMLTextAreaElement>('#draft-review')?.value,
        name: this.querySelector<HTMLInputElement>('#draft-name')?.value,
        title: this.querySelector('.modal-title')?.textContent,
      });
      original.call(this);
    });
    const props = { currentTab: 'c' as const, lookups: NO_LOOKUPS, findDuplicate: () => null, onClose: vi.fn(), onSave: vi.fn() };

    // 1) Primera apertura (monta con el borrador del juego) y 2) cierre tras guardar: el VM deja EMPTY_DRAFT.
    const { rerender } = render(<FormModal open draft={GAME} {...props} />);
    rerender(<FormModal open={false} draft={EMPTY} {...props} />);
    // 3) Reabrir el mismo juego: el VM pone el borrador y abre en el MISMO render (openEditGame).
    rerender(<FormModal open draft={{ ...GAME }} {...props} />);

    expect(vistos).toHaveLength(2);
    expect(vistos[1]).toEqual({ review: 'Base', name: 'Hollow Knight', title: 'Editar juego' });
  });

  it('tras cancelar un juego, abrir otro no enseña el que se canceló', () => {
    // Cancelar NO vacía el borrador del VM (`handleCloseFormModal` solo cierra): se queda con el juego A. Si el
    // diálogo de B se abriera con el de A, lo tecleado en el hueco iría sobre A, con su id y su nombre.
    const otro = makeDraft({ id: 2, name: 'Celeste', genres: ['Plataformas'], platforms: ['Switch'], score: 4, years: [2023], review: 'Otra' });
    const vistos: Array<{ review: string | undefined; name: string | undefined }> = [];
    const original = HTMLDialogElement.prototype.showModal;
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      vistos.push({
        review: this.querySelector<HTMLTextAreaElement>('#draft-review')?.value,
        name: this.querySelector<HTMLInputElement>('#draft-name')?.value,
      });
      original.call(this);
    });
    const props = { currentTab: 'c' as const, lookups: NO_LOOKUPS, findDuplicate: () => null, onClose: vi.fn(), onSave: vi.fn() };

    const { rerender } = render(<FormModal open draft={GAME} {...props} />);
    rerender(<FormModal open={false} draft={GAME} {...props} />);
    rerender(<FormModal open draft={otro} {...props} />);

    expect(vistos).toHaveLength(2);
    expect(vistos[1]).toEqual({ review: 'Otra', name: 'Celeste' });
  });
});
