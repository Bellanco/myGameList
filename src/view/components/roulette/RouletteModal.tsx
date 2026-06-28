import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNativeDialog } from '../../modals/useNativeDialog';
import { Icon } from '../Icon';
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
  action?: RouletteAction | null;
}

// Geometría del tambor (coherente con la vista previa aprobada).
const STEP = 0.42; // rad entre filas
const RADIUS = 120; // px
const THRESH = 1.5; // oculta más allá de ~86°
const REPEAT = 13; // copias del pool en la cinta (margen para que siempre haya nombres arriba/abajo)
const LOOPS = 3; // vueltas antes de frenar (menos distancia = gira más despacio, misma duración)
const DURATION = 3600; // ms

function starString(score: number): string {
  const n = Math.max(0, Math.min(5, Math.round(score)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

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

export function RouletteModal({ open, onClose, title, candidates, action }: RouletteModalProps) {
  const dialogRef = useNativeDialog(open, onClose);
  const stageRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<'idle' | 'spinning' | 'result'>('idle');
  const [winner, setWinner] = useState<RouletteCandidate | null>(null);
  const [acted, setActed] = useState(false);
  // Pool congelado por sesión: el sorteo es sobre lo que había al abrir. Así, ejecutar la acción
  // (mover a "en curso" / añadir a próximos) muta las listas SIN reiniciar la ruleta ni borrar el resultado.
  const [pool, setPool] = useState<RouletteCandidate[]>([]);

  const n = pool.length;
  const seq = useMemo<GameItem[]>(() => {
    if (!n) return [];
    const arr: GameItem[] = [];
    for (let k = 0; k < REPEAT; k++) for (const c of pool) arr.push(c.game);
    return arr;
  }, [pool, n]);

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

  // Estado de REPOSO calculado en el render: el primer pintado ya es correcto (sin depender del timing de un
  // efecto). Memoizado por `seq`/`n` → es estable entre re-renders, así la animación imperativa no se pisa.
  const idlePos = n * 2;
  const idleStyles = useMemo<CSSProperties[]>(
    () => seq.map((_, i) => drumStyle((i - idlePos) * STEP, true)),
    [seq, idlePos],
  );

  // Al abrir: congela el pool actual y vuelve a estado inicial (useLayoutEffect evita el parpadeo de "sin juegos").
  useLayoutEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (!open) return;
    setPool(candidates);
    setPhase('idle');
    setWinner(null);
    setActed(false);
  }, [open]);

  // Coloca el tambor en reposo cuando se renderiza el pool congelado. useLayoutEffect (síncrono tras el
  // commit del DOM) evita la carrera con el rAF en el montaje. No depende de `phase` para no recolocar al girar.
  useLayoutEffect(() => {
    if (!open || !n || phase !== 'idle') return;
    posRef.current = n * 2;
    layout(posRef.current, true);
  }, [open, seq, n]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const spin = useCallback(() => {
    if (phase === 'spinning' || !n) return;
    const chosen = pickWeighted(pool);
    if (!chosen) return;

    setWinner(null);
    setActed(false);
    setPhase('spinning');

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const winnerPos = pool.indexOf(chosen);
    const cur = posRef.current;
    const base = Math.round(cur) + LOOPS * n;
    const target = base + (((winnerPos - (base % n)) + n) % n);
    const dur = reduce ? 0 : DURATION;
    const start = performance.now();

    const settle = () => {
      let p = target;
      // Normaliza hacia atrás (contenido idéntico cada `n`): deja sitio arriba/abajo para el próximo giro.
      while (p > n * (REPEAT - 3)) p -= n;
      posRef.current = p;
      layout(p);
      setWinner(chosen);
      setPhase('result');
    };

    const frame = (t: number) => {
      const k = Math.min(1, (t - start) / (dur || 1));
      const e = 1 - Math.pow(1 - k, 3);
      const pos = cur + e * (target - cur);
      posRef.current = pos;
      layout(pos);
      if (k < 1) rafRef.current = requestAnimationFrame(frame);
      else settle();
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, n, pool, layout]);

  const winnerGame = winner?.game ?? null;
  const resolvedAction = winnerGame && action ? action(winnerGame) : null;

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
                        {seq.map((game, i) => (
                          <div className="rl-item" key={i} style={idleStyles[i]}>
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
                      <div className="rl-card-tag">Tu próximo juego</div>
                      <h3 className="rl-card-name">{winnerGame.name}</h3>
                      <div className="rl-card-stars" aria-label={`Puntuación ${winnerGame.score || 0} de 5`}>
                        {starString(Number(winnerGame.score || 0))}
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
