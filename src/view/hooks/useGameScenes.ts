import { useCallback } from 'react';
import { gameScenesPreference } from './preferences';
import { usePreference } from './usePreference';

/** ¿Pinta cada tema su escena al empezar y al cerrar un juego? Ver `gameScenesPreference`. */
export function useGameScenes(): { gameScenes: boolean; setGameScenes: (on: boolean) => void } {
  const gameScenes = usePreference(gameScenesPreference);
  const setGameScenes = useCallback((on: boolean) => gameScenesPreference.set(on), []);
  return { gameScenes, setGameScenes };
}
