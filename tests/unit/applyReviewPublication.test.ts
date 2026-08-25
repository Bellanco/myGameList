import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El EFECTO de la decisión de publicar reseña: qué se llama, con qué id, y qué pasa cuando falla.
 *
 * Esto vivía dentro de `handleSaveDraft`, en `App.tsx`, y era el bloque más grande sin cubrir del fichero (líneas
 * 491–582). Medida la cobertura V8 real de los e2e sobre `App.tsx`, el recorrido interactivo completo aportaba DOS
 * sentencias sobre el simple arranque: los manejadores no se ejecutan, así que ningún test —ni unitario ni e2e—
 * pasaba por aquí. Y es justo donde se colocó el bug del id.
 *
 * Lo que estos casos protegen, en concreto: que el id que llega al canal social sea el del juego guardado, que no
 * se escriba en el canal cuando no hay nada que publicar, y que un fallo —de GitHub o del propio import dinámico—
 * quede marcado para la reconciliación en vez de perderse sin rastro.
 */

const publishReviewActivity = vi.fn(async (_input: unknown) => {});
const unpublishReviewActivity = vi.fn(async (_input: unknown) => {});
const patchLocalMeta = vi.fn(async (_patch: unknown) => {});

vi.mock('../../src/model/repository/socialPublishRepository', () => ({
  publishReviewActivity,
  unpublishReviewActivity,
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  patchLocalMeta: (patch: unknown) => patchLocalMeta(patch),
}));

import { applyReviewPublication } from '../../src/viewmodel/applyReviewPublication';
import type { ReviewPublication } from '../../src/core/social/reviewPublication';

const PAYLOAD = { name: 'Hollow Knight', review: 'Una obra maestra.', score: 5, grade: 96, reviewChanged: true };
const publicar: ReviewPublication = { kind: 'publish', payload: PAYLOAD };
const retirar: ReviewPublication = { kind: 'unpublish' };
const nada: ReviewPublication = { kind: 'none' };

beforeEach(() => {
  publishReviewActivity.mockClear();
  unpublishReviewActivity.mockClear();
  patchLocalMeta.mockClear();
  publishReviewActivity.mockResolvedValue(undefined);
  unpublishReviewActivity.mockResolvedValue(undefined);
  patchLocalMeta.mockResolvedValue(undefined);
});

describe('applyReviewPublication — qué se llama', () => {
  // Que el import sea PEREZOSO no se comprueba aquí: un contador de cargas del módulo simulado solo daría cero
  // porque este caso corre primero, y en cuanto otro test lo importase pasaría en vacío. La prueba de verdad está
  // en el build, que emite `socialPublishRepository` como su propio chunk (~23 kB) en vez de meterlo en el
  // arranque; si alguien lo importara de forma estática, el presupuesto de `ci-validate` rompería el build.
  it('«nada» no toca el canal social', async () => {
    const onDeferred = vi.fn();
    await applyReviewPublication({ id: 7, publication: nada, onDeferred });

    expect(publishReviewActivity).not.toHaveBeenCalled();
    expect(unpublishReviewActivity).not.toHaveBeenCalled();
    expect(onDeferred).not.toHaveBeenCalled();
  });

  it('«retirar» llama a unpublish con el id del juego guardado, y a nada más', async () => {
    const onDeferred = vi.fn();
    await applyReviewPublication({ id: 42, publication: retirar, onDeferred });

    expect(unpublishReviewActivity).toHaveBeenCalledExactlyOnceWith({ id: 42 });
    expect(publishReviewActivity).not.toHaveBeenCalled();
    expect(onDeferred).not.toHaveBeenCalled();
  });

  it('«publicar» llama a publish con el id MÁS el contenido de la decisión', async () => {
    const onDeferred = vi.fn();
    await applyReviewPublication({ id: 13, publication: publicar, onDeferred });

    // El id y el contenido llegan juntos y sin perder ningún campo: era la forma del bug (publicar sobre otro id).
    expect(publishReviewActivity).toHaveBeenCalledExactlyOnceWith({ id: 13, ...PAYLOAD });
    expect(unpublishReviewActivity).not.toHaveBeenCalled();
    expect(onDeferred).not.toHaveBeenCalled();
  });

  it('el id se pasa TAL CUAL, sin reinterpretarlo (un id alto no se confunde con un índice)', async () => {
    await applyReviewPublication({ id: 999_001, publication: publicar, onDeferred: vi.fn() });
    expect(publishReviewActivity.mock.calls[0][0]).toMatchObject({ id: 999_001 });
  });
});

describe('applyReviewPublication — cuando falla', () => {
  it('un fallo al publicar (403 de GitHub, 5xx) marca el reintento y avisa', async () => {
    publishReviewActivity.mockRejectedValueOnce(new Error('403 rate limit'));
    const onDeferred = vi.fn();

    await applyReviewPublication({ id: 7, publication: publicar, onDeferred });

    expect(patchLocalMeta).toHaveBeenCalledExactlyOnceWith({ pendingSocialActivity: true });
    expect(onDeferred).toHaveBeenCalledOnce();
  });

  it('un fallo al retirar también se marca: la entrada fantasma sigue en el feed hasta reconciliar', async () => {
    unpublishReviewActivity.mockRejectedValueOnce(new Error('offline'));
    const onDeferred = vi.fn();

    await applyReviewPublication({ id: 7, publication: retirar, onDeferred });

    expect(patchLocalMeta).toHaveBeenCalledExactlyOnceWith({ pendingSocialActivity: true });
    expect(onDeferred).toHaveBeenCalledOnce();
  });

  it('NO lanza nunca: el juego ya está guardado y esto no puede tumbar el guardado', async () => {
    publishReviewActivity.mockRejectedValueOnce(new Error('lo que sea'));
    await expect(
      applyReviewPublication({ id: 7, publication: publicar, onDeferred: vi.fn() }),
    ).resolves.toBeUndefined();
  });

  /**
   * El caso que motivó marcar el pendiente escribiendo en IndexedDB DIRECTAMENTE y no vía
   * `socialActivityReconcile`: si lo que ha fallado es el import dinámico, pedirle ayuda al módulo que no ha
   * cargado tampoco funcionaría.
   */
  it('si además falla el marcado, no se propaga: sigue avisando al usuario', async () => {
    publishReviewActivity.mockRejectedValueOnce(new Error('403'));
    patchLocalMeta.mockRejectedValueOnce(new Error('IndexedDB no disponible'));
    const onDeferred = vi.fn();

    await expect(
      applyReviewPublication({ id: 7, publication: publicar, onDeferred }),
    ).resolves.toBeUndefined();
    expect(onDeferred).toHaveBeenCalledOnce();
  });

  it('un fallo NO marca el pendiente cuando no había nada que publicar', async () => {
    await applyReviewPublication({ id: 7, publication: nada, onDeferred: vi.fn() });
    expect(patchLocalMeta).not.toHaveBeenCalled();
  });
});
