import { useCallback } from 'react';
import { postComposerPreference } from '../../model/repository/postComposerPreference';
import { usePreference } from './usePreference';

/** ¿Enseña la actividad social el cuadro para publicar? Ver `postComposerPreference`. */
export function useShowPostComposer(): { showPostComposer: boolean; setShowPostComposer: (on: boolean) => void } {
  const showPostComposer = usePreference(postComposerPreference);
  const setShowPostComposer = useCallback((on: boolean) => postComposerPreference.set(on), []);

  return { showPostComposer, setShowPostComposer };
}
