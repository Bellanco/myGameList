import { memo, type CSSProperties } from 'react';
import { ScoreDisplay } from '../ScoreDisplay';
import { hueFromGrade } from '../../../core/utils/scoreScale';
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
 */
export const GameCards = memo(function GameCards({ games, ranked = false }: { games: GameRef[]; ranked?: boolean }) {
  return (
    <ol className="game-cards">
      {games.map((game, index) => (
        <li key={game.id} style={{ '--i': index, '--dot-hue': String(hueFromGrade(game.grade)) } as CSSProperties}>
          {ranked ? <span className="game-card-pos" aria-hidden="true">{index + 1}</span> : null}
          <span className="game-card-name" title={game.name}>{game.name}</span>
          {game.grade > 0 ? <ScoreDisplay game={{ grade: game.grade }} /> : null}
        </li>
      ))}
    </ol>
  );
});
