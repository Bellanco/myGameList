import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNativeDialog } from '../../modals/useNativeDialog';
import { Icon } from '../Icon';
import { StarRating } from '../StarRating';
import type { IconName } from '../../../core/constants/icons';
import type { GameItem } from '../../../model/types/game';
import { pickWeighted, type RouletteCandidate } from '../../../core/roulette/roulette';

/** Acción inferior de la tarjeta-resultado, resuelta para el juego elegido. */
export interface RouletteResolvedAction {
  label: string;
  doneLabel: string;
  icon?: IconName;
  btnClass: string;
  onAct: (candidate: RouletteCandidate) => void;
}

/**
 * Resolver de la acción según el juego elegido: permite que la misma ruleta ofrezca acciones distintas
 * (p. ej. en social, "Añadir a próximos" si no lo tienes, o "Marcar en curso" si ya es tuyo).
 */
export type RouletteAction = (game: GameItem) => RouletteResolvedAction | null;

interface RouletteModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  candidates: RouletteCandidate[];
  /** Ponderación del sorteo según el contexto (listados vs social). */
  weight: (candidate: RouletteCandidate) => number;
  /** Etiqueta de la tarjeta-resultado según el juego elegido (p. ej. su lista en listados). Por defecto, "Tu próximo juego". */
  tag?: (candidate: RouletteCandidate) => string;
  action?: RouletteAction | null;
}

// Geometría del tambor: ajustada para que se vean 7 nombres a la vez (aspecto circular).
const STEP = 0.34; // rad entre filas (menor = más nombres visibles, más curvatura)
const RADIUS = 150; // px
const THRESH = 1.2; // oculta más allá de ±~3 filas → 7 visibles (d -3..3)
const DURATION = 3000; // ms
// La cinta de giro tiene longitud FIJA (no depende de cuántos juegos haya): el ganador se coloca siempre en el
// mismo índice, así el recorrido —y por tanto la velocidad— es el mismo con 10 que con 100 juegos.
const SPIN_START = 5; // posición inicial (deja nombres por encima al arrancar)
const SPIN_TRAVEL = 46; // ítems que recorre el giro → velocidad constante (ajustable: más = más rápido)
const BELOW = 5; // nombres por debajo del ganador al frenar
const LAND = SPIN_START + SPIN_TRAVEL; // índice del ganador en la cinta de giro
const SPIN_LEN = LAND + 1 + BELOW; // longitud de la cinta de giro
const IDLE_LEN = 9; // cinta en reposo (unos pocos nombres)
const IDLE_CENTER = 4; // centro de la cinta en reposo
// Penalización de repetición (solo en memoria, mientras el modal esté abierto): cada vez que un juego sale,
// su peso se multiplica por esto, para que no se repita una y otra vez. Se resetea al cerrar/reabrir.
const REPEAT_DECAY = 0.25;

// Desenfoque base en reposo: como aún no se ha elegido nada, TODOS los nombres salen difuminados (incluido
// el central). Al girar/terminar el desenfoque base es 0 y el elegido queda nítido.
const IDLE_BLUR = 2.8;

/** Estilo de un nombre del tambor según su distancia angular `th` (rad) al centro. */
function drumStyle(th: number, idle = false): CSSProperties {
  if (Math.abs(th) > THRESH) return { opacity: 0, visibility: 'hidden' };
  const y = RADIUS * Math.sin(th);
  const sc = 0.55 + 0.45 * Math.cos(th);
  const op = Math.max(0, Math.cos(th));
  const blur = (idle ? IDLE_BLUR : 0) + Math.abs(th) * 1.4;
  return {
    opacity: op * op,
    visibility: 'visible',
    transform: `translate(-50%,-50%) translateY(${y.toFixed(1)}px) scale(${sc.toFixed(3)}) rotateX(${(-(th * 57.3) * 0.5).toFixed(1)}deg)`,
    // Estilo "Profundidad": los lejanos se desenfocan; en reposo, también el central.
    filter: `blur(${blur.toFixed(1)}px)`,
  };
}

export function RouletteModal({ open, onClose, title, candidates, weight, tag, action }: RouletteModalProps) {
  const dialogRef = useNativeDialog(open, onClose);
  const stageRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  // Veces que ha salido cada candidato en esta sesión (mientras el modal está abierto) → penaliza repeticiones.
  const picksRef = useRef<Map<RouletteCandidate, number>>(new Map());

  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result'>('idle');
  const [winner, setWinner] = useState<RouletteCandidate | null>(null);
  const [acted, setActed] = useState(false);
  // Pool congelado por sesión: el sorteo es sobre lo que había al abrir. Así, ejecutar la acción
  // (mover a "en curso" / añadir a próximos) muta las listas SIN reiniciar la ruleta ni borrar el resultado.
  const [pool, setPool] = useState<RouletteCandidate[]>([]);

  const n = pool.length;

  // Cinta renderizada de longitud FIJA. En reposo, unos pocos nombres; al girar, una cinta con el ganador en LAND.
  const [reel, setReel] = useState<GameItem[]>([]);
  const pendingRef = useRef<RouletteCandidate | null>(null);

  const buildIdleReel = useCallback(
    (p: RouletteCandidate[]) => Array.from({ length: IDLE_LEN }, (_, i) => p[i % p.length].game),
    [],
  );
  const buildSpinReel = useCallback((p: RouletteCandidate[], chosen: RouletteCandidate) => {
    const arr = Array.from({ length: SPIN_LEN }, (_, i) => p[i % p.length].game);
    arr[LAND] = chosen.game; // el ganador SIEMPRE cae en el mismo índice → recorrido (y velocidad) constante
    return arr;
  }, []);

  // Animación de giro: actualiza el DOM directamente (imperativo) frame a frame.
  const layout = useCallback((pos: number, idle = false) => {
    const stage = stageRef.current;
    if (!stage) return;
    const kids = stage.children;
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i] as HTMLElement;
      const s = drumStyle((i - pos) * STEP, idle);
      el.style.visibility = (s.visibility as string) ?? 'visible';
      el.style.opacity = String(s.opacity ?? 0);
      el.style.transform = (s.transform as string) ?? '';
      el.style.filter = (s.filter as string) ?? 'none';
    }
  }, []);

  // Estilos calculados en el render (primer pintado correcto, sin depender del timing de un efecto). Estables
  // mientras no cambien fase/cinta, así la animación imperativa no se pisa. Reposo = todo difuminado; resultado
  // = ganador nítido y centrado.
  const renderPos = phase === 'result' ? LAND : phase === 'spinning' ? SPIN_START : IDLE_CENTER;
  const renderIdle = phase === 'idle';
  const itemStyles = useMemo<CSSProperties[]>(
    () => reel.map((_, i) => drumStyle((i - renderPos) * STEP, renderIdle)),
    [reel, renderPos, renderIdle],
  );

  // Al abrir: congela el pool, vuelve a reposo y limpia penalizaciones de repetición.
  useLayoutEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (!open) return;
    setPool(candidates);
    setPhase('idle');
    setWinner(null);
    setActed(false);
    picksRef.current = new Map();
  }, [open]);

  // Con el pool congelado, monta la cinta de reposo (síncrono → primer pintado correcto).
  useLayoutEffect(() => {
    if (!open || !n || phase !== 'idle') return;
    setReel(buildIdleReel(pool));
    posRef.current = IDLE_CENTER;
  }, [open, pool, n]);

  // Arranque del giro: tras montar la cinta de giro (useLayoutEffect → el DOM ya tiene los nombres), anima
  // de SPIN_START a LAND con la MISMA distancia siempre → velocidad uniforme con cualquier nº de juegos.
  useLayoutEffect(() => {
    if (phase !== 'spinning') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : DURATION;
    const start = performance.now();
    const frame = (t: number) => {
      const k = Math.min(1, (t - start) / (dur || 1));
      const e = 1 - Math.pow(1 - k, 3);
      posRef.current = SPIN_START + e * (LAND - SPIN_START);
      layout(posRef.current);
      if (k < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        posRef.current = LAND;
        layout(LAND);
        setWinner(pendingRef.current);
        setPhase('result');
      }
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, reel, layout]);

  const spin = useCallback(() => {
    if (phase === 'spinning' || !n) return;
    // Peso efectivo: ponderación de contexto × penalización por veces que ya ha salido en esta sesión.
    const effectiveWeight = (candidate: RouletteCandidate) => {
      const picked = picksRef.current.get(candidate) ?? 0;
      return weight(candidate) * REPEAT_DECAY ** picked;
    };
    const chosen = pickWeighted(pool, effectiveWeight);
    if (!chosen) return;
    picksRef.current.set(chosen, (picksRef.current.get(chosen) ?? 0) + 1);
    pendingRef.current = chosen;
    setReel(buildSpinReel(pool, chosen));
    posRef.current = SPIN_START;
    setWinner(null);
    setActed(false);
    setPhase('spinning');
  }, [phase, n, pool, weight, buildSpinReel]);

  const winnerGame = winner?.game ?? null;
  const resolvedAction = winnerGame && action ? action(winnerGame) : null;
  const tagText = winner && tag ? tag(winner) : 'Tu próximo juego';

  const handleAct = useCallback(() => {
    if (!winner || acted) return;
    const resolved = action?.(winner.game);
    if (!resolved) return;
    resolved.onAct(winner);
    setActed(true);
  }, [winner, action, acted]);

  const hintText = phase === 'spinning' ? 'Girando…' : phase === 'result' ? 'Pulsa para volver a girar' : 'Pulsa para girar';

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog rl-dialog"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="modal rl-modal">
          <div className="modal-hd">
            <div className="modal-title">{title}</div>
            <button className="btn-icon" type="button" onClick={onClose} aria-label="Cerrar">
              <Icon name="close" />
            </button>
          </div>

          <div className="modal-body rl-body">
            {!n ? (
              <p className="rl-empty">No hay juegos elegibles para sortear.</p>
            ) : (
              <>
                <div className="rl-stage-col">
                  <p className="rl-hint">{hintText}</p>
                  <button
                    className="rl-drum"
                    type="button"
                    onClick={spin}
                    aria-label="Girar la ruleta"
                    aria-busy={phase === 'spinning'}
                  >
                    <div className="rl-view">
                      <div className="rl-stage" ref={stageRef}>
                        {reel.map((game, i) => (
                          <div className="rl-item" key={i} style={itemStyles[i]}>
                            {game.name}
                          </div>
                        ))}
                      </div>
                      <div className="rl-frame" aria-hidden="true" />
                    </div>
                  </button>
                </div>

                <div className={`rl-result-col ${phase === 'result' && winnerGame ? 'is-shown' : ''}`.trim()}>
                  {phase === 'result' && winnerGame ? (
                    <div className="rl-card">
                      <div className="rl-card-tag">{tagText}</div>
                      <h3 className="rl-card-name">{winnerGame.name}</h3>
                      <div className="rl-card-stars" aria-label={`Puntuación ${winnerGame.score || 0} de 5`}>
                        <StarRating value={Number(winnerGame.score || 0)} />
                        <small>{winnerGame.score ? `${winnerGame.score}/5` : 'sin puntuar'}</small>
                      </div>
                      {winnerGame.platforms.length || winnerGame.genres.length ? (
                        <div className="rl-chips">
                          {winnerGame.platforms.map((p) => (
                            <span className="rl-chip" key={`p-${p}`}>
                              {p}
                            </span>
                          ))}
                          {winnerGame.genres.map((g) => (
                            <span className="rl-chip rl-chip-gen" key={`g-${g}`}>
                              {g}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {winnerGame.review ? <p className="rl-card-snip">{winnerGame.review}</p> : null}
                      {resolvedAction ? (
                        <button
                          className={`btn ${resolvedAction.btnClass} rl-card-action`}
                          type="button"
                          disabled={acted}
                          onClick={handleAct}
                        >
                          {resolvedAction.icon ? <Icon name={resolvedAction.icon} /> : null}
                          {acted ? resolvedAction.doneLabel : resolvedAction.label}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
