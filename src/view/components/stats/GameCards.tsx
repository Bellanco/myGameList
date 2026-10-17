import { memo, type CSSProperties } from 'react';
import { ScoreDisplay } from '../ScoreDisplay';
import { hueFromGrade } from '../../../core/utils/scoreScale';
import { GAME_SHEET_UI } from '../../../core/constants/gameSheetLabels';
import type { GameRef } from '../../../core/stats/types';

/**
 * El listado largo de un año, en CAJAS en vez de en filas.
 *
 * Cuarenta juegos en filas a ancho completo son cuarenta renglones de pantalla para decir un nombre y una nota;
 * repartidos en una rejilla que se llena sola, ocupan una cuarta parte y se recorren de un vistazo. Cada caja
 * lleva el mínimo que hace falta —puesto, nombre y nota— y un filo lateral teñido por esa nota, que es el que
 * deja leer la caída del año sin mirar una sola cifra.
 *
 * No repiten la receta de las fichas del top —caja con borde, número al fondo y barra al pie—: aquí la caja no
 * tiene contorno, el puesto va en línea y el color vive en el canto. Son dos listas distintas y se nota.
 *
 * Con `onOpenGame`, cada caja abre la ficha del juego: un botón invisible la cubre entera, como en las fichas del top.
 */
export const GameCards = memo(function GameCards({ games, ranked = false, onOpenGame }: {
  games: GameRef[];
  ranked?: boolean;
  onOpenGame?: (name: string) => void;
}) {
  return (
    <ol className="game-cards">
      {games.map((game, index) => (
        <li key={game.id} style={{ '--i': index, '--dot-hue': String(hueFromGrade(game.grade)) } as CSSProperties}>
          {onOpenGame ? (
            <button
              type="button"
              className="top-chip-open"
              title={GAME_SHEET_UI.openSheetAria(game.name)}
              onClick={() => onOpenGame(game.name)}
            >
              <span className="sr-only">{GAME_SHEET_UI.openSheetAria(game.name)}</span>
            </button>
          ) : null}
          {ranked ? <span className="game-card-pos" aria-hidden="true">{index + 1}</span> : null}
          <span className="game-card-name" title={game.name}>{game.name}</span>
          {game.grade > 0 ? <ScoreDisplay game={{ grade: game.grade }} /> : null}
        </li>
      ))}
    </ol>
  );
});
