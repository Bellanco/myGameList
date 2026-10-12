import { memo, useEffect } from 'react';
import { APPEARANCE_UI } from '../../../core/constants/labels';
import { useTheme } from '../../hooks/useTheme';
import { useUppercase } from '../../hooks/useUppercase';
import { useShowSteamButton } from '../../hooks/useShowSteamButton';
import { useEffects } from '../../hooks/useEffects';
import { useCovers } from '../../hooks/useCovers';
import { useGameScenes } from '../../hooks/useGameScenes';
import { useOwnTier } from '../../../viewmodel/useOwnTier';
import { canUseGameScenes } from '../../../core/constants/tiers';
import { useShowWishlist } from '../../hooks/useShowWishlist';

const A = APPEARANCE_UI;

/**
 * LAS SIETE PREFERENCIAS DE DOS RESPUESTAS: claro u oscuro, versales o no, el botón de Steam Deck, los efectos,
 * las escenas de empezar y cerrar un juego (de plata para arriba), las carátulas y la pestaña de la lista de deseos. Todas viven en este dispositivo (`localStorage`) y solo se copian a la nube si hay sesión,
 * así que ninguna depende de tener cuenta.
 *
 * Cada una va en su caja: puestas en fila, cinco rótulos con su par de botones se leían como una tira de diez
 * botones sueltos y no se veía dónde acababa una opción y empezaba la siguiente.
 */
export const AppearanceToggles = memo(function AppearanceToggles() {
  const { theme, toggle } = useTheme();
  const { uppercase, setUppercase } = useUppercase();
  const { showSteamButton, setShowSteamButton } = useShowSteamButton();
  const { effects, setEffects } = useEffects();
  const { covers, setCovers } = useCovers();
  const { gameScenes, setGameScenes } = useGameScenes();
  // Las escenas son de plata para arriba (`PROFILE_TIER_GAME_SCENES`). Mientras no se sabe el rango no se pinta la
  // casilla: enseñarla y quitarla al llegar la respuesta sería peor que esperar.
  const ownTier = useOwnTier();
  const scenesAllowed = ownTier !== null && canUseGameScenes(ownTier);
  // Quien las encendió y ya no tiene el rango las pierde aquí, al entrar en Diseño: sin la casilla no podría
  // apagarlas. Se apagan con la preferencia, así que viaja a sus otros aparatos.
  useEffect(() => {
    if (ownTier !== null && !canUseGameScenes(ownTier) && gameScenes) setGameScenes(false);
  }, [ownTier, gameScenes, setGameScenes]);
  const { showWishlist, setShowWishlist } = useShowWishlist();

  return (
      <div className="appearance-grid">
      <div className="appearance-field">
      <p className="settings-card-sub">{A.modeLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.groupAria}>
        <button
          type="button"
          className={`btn btn-toggle${theme === 'dark' ? ' active' : ''}`}
          aria-pressed={theme === 'dark'}
          onClick={() => { if (theme !== 'dark') toggle(); }}
        >
          <span>{A.dark}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${theme === 'light' ? ' active' : ''}`}
          aria-pressed={theme === 'light'}
          onClick={() => { if (theme !== 'light') toggle(); }}
        >
          <span>{A.light}</span>
        </button>
      </div>

      </div>

      <div className="appearance-field">
      <p className="settings-card-sub">{A.caseLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.caseAria}>
        <button
          type="button"
          className={`btn btn-toggle${!uppercase ? ' active' : ''}`}
          aria-pressed={!uppercase}
          onClick={() => { if (uppercase) setUppercase(false); }}
        >
          <span>{A.caseNormal}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${uppercase ? ' active' : ''}`}
          aria-pressed={uppercase}
          onClick={() => { if (!uppercase) setUppercase(true); }}
        >
          <span>{A.caseUpper}</span>
        </button>
      </div>

      </div>

      <div className="appearance-field">
      <p className="settings-card-sub">{A.steamLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.steamAria}>
        <button
          type="button"
          className={`btn btn-toggle${showSteamButton ? ' active' : ''}`}
          aria-pressed={showSteamButton}
          onClick={() => { if (!showSteamButton) setShowSteamButton(true); }}
        >
          <span>{A.steamShow}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!showSteamButton ? ' active' : ''}`}
          aria-pressed={!showSteamButton}
          onClick={() => { if (showSteamButton) setShowSteamButton(false); }}
        >
          <span>{A.steamHide}</span>
        </button>
      </div>

      </div>

      <div className="appearance-field">
      <p className="settings-card-sub">{A.effectsLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.effectsAria}>
        <button
          type="button"
          className={`btn btn-toggle${effects ? ' active' : ''}`}
          aria-pressed={effects}
          onClick={() => { if (!effects) setEffects(true); }}
        >
          <span>{A.effectsOn}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!effects ? ' active' : ''}`}
          aria-pressed={!effects}
          onClick={() => { if (effects) setEffects(false); }}
        >
          <span>{A.effectsOff}</span>
        </button>
      </div>

      </div>

      {/* Las escenas de empezar y cerrar un juego. Van detrás de los efectos porque cuelgan de ellos: con los
          efectos apagados no salen aunque estén encendidas. Solo de plata para arriba, y sin decir por qué. */}
      {scenesAllowed && (
      <div className="appearance-field">
      <p className="settings-card-sub">{A.gameScenesLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.gameScenesAria}>
        <button
          type="button"
          className={`btn btn-toggle${gameScenes ? ' active' : ''}`}
          aria-pressed={gameScenes}
          onClick={() => { if (!gameScenes) setGameScenes(true); }}
        >
          <span>{A.gameScenesOn}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!gameScenes ? ' active' : ''}`}
          aria-pressed={!gameScenes}
          onClick={() => { if (gameScenes) setGameScenes(false); }}
        >
          <span>{A.gameScenesOff}</span>
        </button>
      </div>
      </div>
      )}

      {/* Carátulas. Lleva explicación y las demás no, a propósito: es la única de esta pantalla que hace que
          salgan peticiones a la red, así que quien la enciende tiene que saber qué está encendiendo. */}
      <div className="appearance-field">
      <p className="settings-card-sub">{A.coversLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.coversAria}>
        <button
          type="button"
          className={`btn btn-toggle${covers ? ' active' : ''}`}
          aria-pressed={covers}
          onClick={() => { if (!covers) setCovers(true); }}
        >
          <span>{A.coversOn}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!covers ? ' active' : ''}`}
          aria-pressed={!covers}
          onClick={() => { if (covers) setCovers(false); }}
        >
          <span>{A.coversOff}</span>
        </button>
      </div>
      </div>

      {/* La lista de deseos: esconde la pestaña, no sus juegos ni lo que ven los demás (eso es el perfil social). */}
      <div className="appearance-field">
      <p className="settings-card-sub">{A.wishlistLabel}</p>
      <div className="theme-mode-row" role="group" aria-label={A.wishlistAria}>
        <button
          type="button"
          className={`btn btn-toggle${showWishlist ? ' active' : ''}`}
          aria-pressed={showWishlist}
          onClick={() => { if (!showWishlist) setShowWishlist(true); }}
        >
          <span>{A.wishlistShow}</span>
        </button>
        <button
          type="button"
          className={`btn btn-toggle${!showWishlist ? ' active' : ''}`}
          aria-pressed={!showWishlist}
          onClick={() => { if (showWishlist) setShowWishlist(false); }}
        >
          <span>{A.wishlistHide}</span>
        </button>
      </div>
      </div>
      </div>
  );
});
