import { describe, expect, it } from 'vitest';
import { resolveSyncBadge } from '../../src/viewmodel/syncBadge';
import { SYNC_BADGE_TEXT } from '../../src/core/constants/labels';

/**
 * La línea de estado de Ajustes decía «Sincronizado» en cuanto un ciclo terminaba bien, aunque justo después se
 * hubiera guardado algo que seguía sin salir del dispositivo. Aquí se fija qué gana a qué.
 */
describe('texto del estado de sincronización', () => {
  it('avisa de lo que queda sin subir en vez de decir que todo está sincronizado', () => {
    expect(resolveSyncBadge('ok', true)).toBe(SYNC_BADGE_TEXT.pending);
    expect(resolveSyncBadge('ok', false)).toBe(SYNC_BADGE_TEXT.ok);
  });

  it('un error manda sobre todo lo demás', () => {
    expect(resolveSyncBadge('error', true)).toBe(SYNC_BADGE_TEXT.error);
  });

  it('mientras sube, «subiendo» informa más que «sin subir»', () => {
    expect(resolveSyncBadge('syncing', true)).toBe(SYNC_BADGE_TEXT.syncing);
  });

  it('sin sincronización configurada sigue diciendo que no la hay', () => {
    // `pendingUpload` ya llega en falso en ese caso (ver `useSyncViewModel`), pero el orden no debe depender
    // de que quien llama se acuerde.
    expect(resolveSyncBadge('idle', false)).toBe(SYNC_BADGE_TEXT.idle);
  });
});
