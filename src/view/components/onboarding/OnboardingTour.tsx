import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TOUR_UI, type StepText } from '../../../core/constants/onboardingLabels';
import { MISSION_IDS, type MissionId, type TourState } from '../../../core/onboarding/tourState';
import type { PremiosInvite } from '../../../core/onboarding/joinFromPremios';
import {
  MISSIONS,
  advanceStep,
  chooseMission,
  completeMission,
  mainProgress,
  pickStep,
  settleStep,
  skipMission,
  startTour,
  stepCounter,
  type Mission,
  type TourContext,
  type TourStep,
} from '../../../core/onboarding/tourSteps';
import { INVITE_UI } from '../../../core/constants/inviteLabels';
import { saveTourState } from '../../../model/repository/onboardingStore';
import { InviteLink } from '../invite/InviteLink';
import { placeBubble, type Box } from './placement';
import { useDialogOpen, useTourAnchor } from './useTourAnchor';
// La hoja viaja con este chunk y no en el arranque: quien no tiene la guía en marcha no la descarga.
import '../../../styles/onboarding.scss';

export interface OnboardingTourProps {
  /** `null` = no hay guía en este dispositivo; solo puede salir el «vuelve a entrar» (`relogin`). */
  state: TourState | null;
  ctx: TourContext;
  /** Quien ya tenía lo social ha perdido la sesión y está en Social: manda sobre todo lo demás. */
  relogin?: boolean;
  /**
   * La invitación de los premios, si toca. Quién y cuándo lo deciden ellos (`usePremiosJoinInvite`), que ya la
   * callan con la guía en pantalla; aquí solo se pinta.
   */
  premiosInvite?: PremiosInvite | null;
}

/* ── Iconos ──────────────────────────────────────────────────────────────────────────────────────────────────
   Dibujados aquí y no pedidos al sprite: el sprite de arranque no los trae y el resto llega en idle, así que la
   guía —que también llega en idle— podría pintarse antes que ellos. Son los trazos de Lucide, como el sprite. */
const PATHS = {
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  tap: 'M22 14a8 8 0 0 1-8 8M18 11v-1a2 2 0 0 0-4 0M14 10V9a2 2 0 0 0-4 0v1M10 9.5V4a2 2 0 0 0-4 0v10M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  pad: 'M6 12h4M8 10v4M15 13h.01M18 11h.01M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  cloud: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  library: 'm16 6 4 14M12 6v14M8 8v12M4 4v16',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z',
  minus: 'M5 12h14',
  up: 'm18 15-6-6-6 6',
} as const;

type IconName = keyof typeof PATHS;

function TourIcon({ name, className = 'ob-icon' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

const MISSION_ICON: Record<MissionId, IconName> = { 'first-game': 'pad', cloud: 'cloud', library: 'library', coop: 'users' };

/* ── Acciones ─────────────────────────────────────────────────────────────────────────────────────────────── */

/** Pliega en el botón de la izquierda. Desde la tarjeta del final no hay nada que plegar: se da por terminada. */
function fold(state: TourState): void {
  saveTourState({ ...state, status: state.status === 'finale' ? 'done' : 'paused' });
}

/** «Más tarde» tras una misión cumplida: se apunta como hecha y la guía se pliega hasta que se retome. */
function completeAndFold(state: TourState): void {
  const next = completeMission(state);
  saveTourState(next.status === 'active' ? { ...next, status: 'paused' } : next);
}

function onEscape(state: TourState) {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    fold(state);
  };
}

/**
 * LO QUE LA BURBUJA NO PUEDE TAPAR POR ABAJO: el aviso de cookies mientras está pendiente, y el carril de avisos
 * (`.ach-toast-stack`: el logro recién conseguido, lo último que hiciste) cuando tiene algo a la vista. Tapar un
 * logro con la guía lo deja sin poder tocarse, y es justo lo que alguien acaba de ganar.
 */
function readBottomInset(): number {
  if (typeof document === 'undefined') return 0;
  let inset = 0;
  if (document.documentElement.dataset.consent === 'pending') {
    const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--consent-h'));
    if (Number.isFinite(value)) inset = value;
  }
  const lane = document.querySelector('.ach-toast-stack');
  if (lane) {
    let top = Infinity;
    for (const child of Array.from(lane.children)) {
      // El botón plegado de la propia guía también vive ahí, y no cuenta: con la burbuja fuera, no se pinta.
      if (child.classList.contains('ob-pill')) continue;
      const rect = child.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) top = Math.min(top, rect.top);
    }
    if (Number.isFinite(top)) inset = Math.max(inset, window.innerHeight - top);
  }
  return inset;
}

/** Sigue a `readBottomInset`: un logro puede aparecer con la burbuja ya colocada, y hay que apartarse. */
function useBottomInset(): number {
  const [inset, setInset] = useState(readBottomInset);
  useEffect(() => {
    const timer = setInterval(() => setInset((prev) => {
      const next = readBottomInset();
      return Math.abs(next - prev) < 0.5 ? prev : next;
    }), 400);
    return () => clearInterval(timer);
  }, []);
  return inset;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** ¿Va el control dentro de algo fijo (barra, botón flotante, menú)? Entonces desplazar la página no lo acerca. */
function insideFixed(element: Element): boolean {
  for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') return true;
  }
  return false;
}

/* ── La guía ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * LA GUÍA DE PRIMEROS PASOS, entera: la tarjeta de bienvenida, la burbuja que señala cada paso, el botón plegado
 * de la izquierda, la hoja de invitar y la tarjeta del final.
 *
 * Todo lo que se pinta cuelga de dos cosas: el estado guardado (`state`) y lo que pasa en la aplicación (`ctx`).
 * Este componente no decide qué paso toca —eso es `tourSteps`, puro y probado aparte—; solo lo enseña y apunta en
 * el estado lo que el motor ha resuelto (un paso cumplido, un salto hacia delante).
 *
 * El velo NO bloquea: deja pasar los toques a lo que hay debajo. La guía acompaña, no obliga, y quien quiere ir a
 * otro sitio puede; al llegar, la guía le sigue (`pickStep`).
 */
export function OnboardingTour({ state, ctx, relogin = false, premiosInvite = null }: OnboardingTourProps) {
  const dialogOpen = useDialogOpen();
  const mission = state?.status === 'active' && state.mission ? MISSIONS[state.mission] : null;
  const settled = mission && state ? settleStep(mission, state.step, ctx) : state?.step ?? 0;
  const shown = mission && state && settled === state.step ? pickStep(mission, state.step, ctx) : null;

  // Lo que el motor resuelve se apunta, para que sobreviva a una recarga (la vuelta de GitHub recarga la página).
  useEffect(() => {
    if (!state) return;
    if (state.status === 'active' && !state.mission) {
      saveTourState(startTour(state));
      return;
    }
    if (!mission) return;
    if (settled !== state.step) {
      saveTourState(settled >= mission.steps.length ? completeMission(state) : { ...state, step: settled });
    } else if (shown !== null && shown > state.step) {
      saveTourState({ ...state, step: shown });
    }
  }, [mission, settled, shown, state]);

  const step = mission && shown !== null ? mission.steps[shown] : null;
  let view: ReactNode = null;
  let announce = '';

  if (!dialogOpen && relogin) {
    view = <ReloginBubble ctx={ctx} />;
    announce = TOUR_UI.relogin.title;
  } else if (!dialogOpen && premiosInvite) {
    view = <PremiosInviteBubble invite={premiosInvite} />;
    announce = TOUR_UI.premios[premiosInvite.kind].title;
  } else if (!dialogOpen && state) {
    if (state.status === 'hint') {
      view = <HintBubble state={state} ctx={ctx} />;
    } else if (state.status === 'offer' || state.status === 'menu') {
      view = <MissionsCard state={state} />;
      announce = state.status === 'offer' ? TOUR_UI.welcome.title : TOUR_UI.menu.title;
    } else if (state.status === 'finale') {
      view = <FinaleCard state={state} />;
      announce = TOUR_UI.finale.title;
    } else if (state.status === 'paused' || (state.status === 'active' && !step)) {
      view = <TourPill state={state} />;
    } else if (mission && step && shown !== null) {
      // Con el menú de Ajustes abierto solo tiene sentido el paso que señala algo DENTRO del menú.
      if (ctx.settingsMenuOpen && step.id !== 'to-data') {
        view = null;
      } else if (step.kind === 'invite') {
        view = <InviteSheet state={state} index={shown} />;
        announce = TOUR_UI.steps.invite.title;
      } else {
        view = <Spotlight key={`${mission.id}:${step.id}`} state={state} mission={mission} index={shown} step={step} ctx={ctx} />;
        announce = stepText(step, ctx).title;
      }
    }
  }

  return (
    <div className="ob-root">
      {/* Anuncia cada paso a un lector de pantalla sin moverle el foco: la guía acompaña, no interrumpe. */}
      <p className="sr-only" aria-live="polite">{announce}</p>
      {view}
    </div>
  );
}

function stepText(step: TourStep, ctx: TourContext): StepText {
  // Quien ya tiene espacio y ha perdido la sesión no «crea» nada: vuelve a entrar.
  if (step.id === 'google' && ctx.hasSocialSpace) {
    return { title: TOUR_UI.relogin.title, text: TOUR_UI.relogin.text, tap: TOUR_UI.steps.google.tap };
  }
  return TOUR_UI.steps[step.id];
}

/* ── Velo con hueco ───────────────────────────────────────────────────────────────────────────────────────── */

const HOLE_PAD = 6;
/** Altura de la pantalla (en fracción) a la que se deja el control de foco al desplazar. Ver `AnchoredBubble`. */
const FOCUS_LINE = 0.36;

function Scrim({ hole }: { hole: (Box & { r: number }) | null }) {
  const rawId = useId();
  const maskId = `ob-mask-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className="ob-scrim" aria-hidden="true" focusable="false">
      <defs>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="#fff" />
          {hole ? <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={hole.r} ry={hole.r} fill="#000" /> : null}
        </mask>
      </defs>
      <rect className="ob-scrim-fill" width="100%" height="100%" mask={`url(#${maskId})`} />
    </svg>
  );
}

/* ── La burbuja anclada a un control ──────────────────────────────────────────────────────────────────────── */

interface AnchoredBubbleProps {
  /** Identifica lo que se señala: al cambiar, se vuelve a buscar el control y a desplazar hasta él. */
  anchorKey: string;
  anchor?: string | readonly string[];
  /** Control dentro del ancla al que apunta la flecha y que la burbuja no tapa (ver `TourStep.focus`). */
  focus?: string;
  /** Tono del anillo y la cabecera: `is-done` (celebración), `is-optional` (misión secundaria) o ninguno. */
  tone?: '' | ' is-done' | ' is-optional';
  /** El anillo late: hay que tocar ahí. */
  pulse?: boolean;
  labelledBy: string;
  onKeyDown?: (event: KeyboardEvent) => void;
  children: ReactNode;
}

/**
 * EL VELO CON SU HUECO, EL ANILLO Y LA BURBUJA CON SU FLECHA, colocados junto al control que se señala. Lo usan el
 * paso de una misión, el ofrecimiento de una misión («¿Quieres…?») y el «vuelve a entrar» de lo social: los tres
 * señalan algo de la pantalla y cambian solo lo que dicen.
 */
function AnchoredBubble({ anchorKey, anchor: anchorSpec, focus, tone = '', pulse = false, labelledBy, onKeyDown, children }: AnchoredBubbleProps) {
  const selectors = useMemo(
    () => (anchorSpec ? (typeof anchorSpec === 'string' ? [anchorSpec] : [...anchorSpec]) : null),
    [anchorSpec],
  );
  const anchor = useTourAnchor(selectors, anchorKey);
  // Por estado y no por `useRef`: la burbuja no existe en el primer render (se espera al control), así que la
  // medida tiene que arrancar cuando aparece, no al montar.
  const [bubbleNode, setBubbleNode] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const scrolledRef = useRef(false);
  const bottomInset = useBottomInset();

  useLayoutEffect(() => {
    const node = bubbleNode;
    if (!node) return undefined;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize((prev) => (prev && prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height }));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [bubbleNode]);

  // UNA vez por control, y solo si está fuera de la vista: la tarjeta de sincronización queda por debajo de la de
  // importar en un móvil. Lo fijo (barra, «+», menú) no se desplaza.
  //
  // CON CONTROL DE FOCO se deja ese control algo por encima de la mitad de la pantalla, y no la tarjeta centrada: así
  // la burbuja cabe DEBAJO del botón y lo que la tarjeta cuenta ENCIMA de él (las ventajas) sigue a la vista. Centrar
  // la tarjeta dejaba el botón tan abajo que la burbuja solo cabía encima, tapando justo lo que dice que mires.
  useEffect(() => {
    const { element, box } = anchor;
    if (!element || !box || scrolledRef.current) return;
    scrolledRef.current = true;
    if (insideFixed(element)) return;
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const focusElement = focus ? element.querySelector(focus) : null;
    if (focusElement) {
      const rect = focusElement.getBoundingClientRect();
      const desired = window.innerHeight * FOCUS_LINE;
      if (Math.abs(rect.top - desired) > 24) window.scrollBy({ top: rect.top - desired, behavior });
      return;
    }
    const offscreen = box.y < 56 || box.y + box.h > window.innerHeight - 96;
    if (offscreen && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center', behavior });
    }
  }, [anchor, focus]);

  // Mientras se busca el control, nada: una burbuja que aparece en el centro y salta a su sitio despista.
  if (!anchor.box && !anchor.missing) return null;

  const hole = anchor.box
    ? {
      x: anchor.box.x - HOLE_PAD,
      y: anchor.box.y - HOLE_PAD,
      w: anchor.box.w + HOLE_PAD * 2,
      h: anchor.box.h + HOLE_PAD * 2,
      r: anchor.box.r + HOLE_PAD,
    }
    : null;
  const view = { w: document.documentElement.clientWidth || window.innerWidth, h: window.innerHeight, bottomInset };
  // Con un control de foco, la burbuja se coloca respecto a ÉL y no a todo el hueco: así se queda a su lado, con la
  // flecha apuntándole, en vez de acoplarse encima. Se lee en cada pintado, que llega con cada scroll (ver
  // `useTourAnchor`).
  const focusElement = focus && anchor.element ? anchor.element.querySelector(focus) : null;
  const focusRect = focusElement?.getBoundingClientRect();
  const target = focusRect && focusRect.width > 0
    ? { x: focusRect.left - HOLE_PAD, y: focusRect.top - HOLE_PAD, w: focusRect.width + HOLE_PAD * 2, h: focusRect.height + HOLE_PAD * 2 }
    : hole;
  const placement = size ? placeBubble(target, size, view) : null;

  const caretStyle = placement?.side
    ? placement.side === 'bottom'
      ? { top: -7, left: placement.caret - 8 }
      : placement.side === 'top'
        ? { bottom: -7, left: placement.caret - 8 }
        : placement.side === 'right'
          ? { left: -7, top: placement.caret - 8 }
          : { right: -7, top: placement.caret - 8 }
    : null;

  return (
    <>
      <Scrim hole={hole} />
      {hole ? (
        <div
          className={`ob-ring${tone}${pulse ? ' is-action' : ''}`}
          aria-hidden="true"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: hole.r }}
        />
      ) : null}
      <section
        ref={setBubbleNode}
        className={`ob-bubble${tone}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
        style={{
          left: placement?.left ?? 0,
          top: placement?.top ?? 0,
          visibility: placement ? 'visible' : 'hidden',
        }}
      >
        {caretStyle ? <span className="ob-caret" aria-hidden="true" style={caretStyle} /> : null}
        {children}
      </section>
    </>
  );
}

/* ── La burbuja de cada paso ──────────────────────────────────────────────────────────────────────────────── */

interface SpotlightProps {
  state: TourState;
  mission: Mission;
  index: number;
  step: TourStep;
  ctx: TourContext;
}

function Spotlight({ state, mission, index, step, ctx }: SpotlightProps) {
  const titleId = useId();
  const text = stepText(step, ctx);
  const counter = stepCounter(mission, index);
  const secondary = mission.id === 'library';
  const isDone = step.kind === 'done';
  const tone = isDone ? ' is-done' : secondary ? ' is-optional' : '';
  const kicker = isDone ? TOUR_UI.missionDoneKicker : TOUR_UI.missions[mission.id].kicker;

  return (
    <AnchoredBubble
      anchorKey={`${mission.id}:${step.id}`}
      anchor={step.anchor}
      focus={step.focus}
      tone={tone}
      pulse={step.kind === 'action' || step.kind === 'nav'}
      labelledBy={titleId}
      onKeyDown={onEscape(state)}
    >
      <div className="ob-kicker">
        {isDone ? <TourIcon name="check" className="ob-icon ob-icon-sm" /> : null}
        <span>{kicker}</span>
        {secondary && !isDone ? <span className="ob-tag">{TOUR_UI.optional}</span> : null}
        {counter ? <span className="ob-count">{counter.position}/{counter.total}</span> : null}
        <button type="button" className="ob-close" aria-label={TOUR_UI.buttons.fold} title={TOUR_UI.buttons.fold} onClick={() => fold(state)}>
          <TourIcon name="close" />
        </button>
      </div>
      <h2 className="ob-title" id={titleId}>{text.title}</h2>
      <p className="ob-text">{text.text}</p>
      {step.id === 'added' ? <NextMission state={state} /> : null}
      {text.tap && (step.kind === 'action' || step.kind === 'nav') ? (
        <p className="ob-tap"><TourIcon name="tap" /><span>{text.tap}</span></p>
      ) : null}
      <StepFooter state={state} mission={mission} index={index} step={step} />
    </AnchoredBubble>
  );
}

/* ── El ofrecimiento de una misión, en su pantalla ────────────────────────────────────────────────────────── */

/** Dónde se ofrece cada misión y qué se señala allí. Solo hay ofrecimientos de lo social y de la nube. */
const HINTS: Partial<Record<MissionId, { screen: (ctx: TourContext) => boolean; anchor: readonly string[]; focus?: string }>> = {
  coop: {
    screen: (ctx) => ctx.path === '/social' || ctx.path.startsWith('/social/'),
    anchor: ['.hub-gateway-stage.is-current', '#hub-profile-name'],
  },
  cloud: { screen: (ctx) => ctx.path === '/ajustes/datos', anchor: ['[data-tour="sync-card"]'], focus: '[data-tour="sync-connect"]' },
};

/**
 * «¿TE ENSEÑO?», para quien ya usaba la aplicación y llega a una pantalla sin tener lo que se hace en ella. Una
 * pregunta y dos respuestas: «Sí, vamos» arranca SOLO esa misión, y «No, gracias» (o la X) la aparta para siempre
 * —queda en Ajustes › Datos—. Fuera de su pantalla no se pinta nada: no es una guía que te siga, es una oferta.
 */
function HintBubble({ state, ctx }: { state: TourState; ctx: TourContext }) {
  const titleId = useId();
  const mission = state.mission;
  const hint = mission ? HINTS[mission] : undefined;
  if (!mission || !hint || !hint.screen(ctx) || (mission !== 'coop' && mission !== 'cloud')) return null;
  const H = TOUR_UI.hints;
  const decline = () => saveTourState({
    ...state,
    status: 'dismissed',
    mission: null,
    single: false,
    declined: state.declined.includes(mission) ? state.declined : [...state.declined, mission],
  });
  const accept = () => saveTourState({ ...state, status: 'active', step: 0, single: true });

  return (
    <AnchoredBubble
      anchorKey={`hint:${mission}`}
      anchor={hint.anchor}
      focus={hint.focus}
      labelledBy={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        decline();
      }}
    >
      <div className="ob-kicker">
        <span>{H.kicker}</span>
        <button type="button" className="ob-close" aria-label={TOUR_UI.buttons.close} title={TOUR_UI.buttons.close} onClick={decline}>
          <TourIcon name="close" />
        </button>
      </div>
      <h2 className="ob-title" id={titleId}>{H[mission].title}</h2>
      <p className="ob-text">{H[mission].text}</p>
      <div className="ob-foot ob-foot-split ob-foot-even">
        <button type="button" className="btn btn-quiet" onClick={decline}>{H.no}</button>
        <button type="button" className="btn btn-primary" onClick={accept}>{H.yes}</button>
      </div>
    </AnchoredBubble>
  );
}

/* ── La invitación de los premios ─────────────────────────────────────────────────────────────────────────── */

/**
 * «HAY ALGO MÁS», al terminar de votar y en el histórico: la misma pregunta que el «¿Quieres…?» de Social, con
 * otro motivo. No señala nada —en los premios no hay un control que sea «el resto de la aplicación»—, así que va
 * centrada sobre el velo. «Sí, vamos» le lleva a donde empieza su misión y pone la guía en marcha; «Ahora no» (o la
 * X, o Escape) la aparta hasta la siguiente edición. Las dos respuestas las apuntan los premios.
 */
function PremiosInviteBubble({ invite }: { invite: PremiosInvite }) {
  const titleId = useId();
  const P = TOUR_UI.premios;
  return (
    <AnchoredBubble
      anchorKey={`premios:${invite.kind}`}
      labelledBy={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        invite.dismiss();
      }}
    >
      <div className="ob-kicker">
        <span>{P.kicker}</span>
        <button type="button" className="ob-close" aria-label={TOUR_UI.buttons.close} title={TOUR_UI.buttons.close} onClick={invite.dismiss}>
          <TourIcon name="close" />
        </button>
      </div>
      <h2 className="ob-title" id={titleId}>{P[invite.kind].title}</h2>
      <p className="ob-text">{P[invite.kind].text}</p>
      <div className="ob-foot ob-foot-split ob-foot-even">
        <button type="button" className="btn btn-quiet" onClick={invite.dismiss}>{P.no}</button>
        <button type="button" className="btn btn-primary" onClick={invite.accept}>{P.yes}</button>
      </div>
    </AnchoredBubble>
  );
}

/* ── «Vuelve a entrar» ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * PARA QUIEN YA TENÍA LO SOCIAL Y HA PERDIDO LA SESIÓN: su espacio sigue en este dispositivo (ver
 * `TourContext.hasSocialSpace`). Sale cada vez que entra en Social así, señalando el paso que le falta de la
 * pasarela; la X la cierra hasta que vuelva a entrar en Social. Sin misión, sin recuento y sin una palabra sobre
 * crear nada.
 */
function ReloginBubble({ ctx }: { ctx: TourContext }) {
  const titleId = useId();
  const [closed, setClosed] = useState(false);
  const R = TOUR_UI.relogin;
  if (closed || ctx.path !== '/social') return null;
  return (
    <AnchoredBubble
      anchorKey="relogin"
      anchor=".hub-gateway-stage.is-current"
      pulse
      labelledBy={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        setClosed(true);
      }}
    >
      <div className="ob-kicker">
        <span>{R.kicker}</span>
        <button type="button" className="ob-close" aria-label={TOUR_UI.buttons.close} title={TOUR_UI.buttons.close} onClick={() => setClosed(true)}>
          <TourIcon name="close" />
        </button>
      </div>
      <h2 className="ob-title" id={titleId}>{R.title}</h2>
      <p className="ob-text">{ctx.syncConnected ? R.text : R.textNeedsSync}</p>
    </AnchoredBubble>
  );
}

function NextMission({ state }: { state: TourState }) {
  const next = completeMission(state);
  if (next.status !== 'active' || !next.mission) return null;
  return (
    <div className="ob-next">
      <span className="ob-mission-icon"><TourIcon name={MISSION_ICON[next.mission]} /></span>
      <span className="ob-next-body">
        <span className="ob-next-label">{TOUR_UI.nextMission}</span>
        <span className="ob-mission-name">{TOUR_UI.missions[next.mission].name}</span>
      </span>
    </div>
  );
}

/** Los puntos de progreso: los pasos que cuentan, con los ya pasados en verde. */
function Dots({ mission, index }: { mission: Mission; index: number }) {
  const counted = mission.steps.map((candidate, position) => ({ candidate, position })).filter(({ candidate }) => candidate.counted);
  if (counted.length < 2) return <span className="ob-dots" />;
  return (
    <span className="ob-dots" aria-hidden="true">
      {counted.map(({ candidate, position }) => (
        <span key={candidate.id} className={`ob-dot${position < index ? ' is-done' : position === index ? ' is-on' : ''}`} />
      ))}
    </span>
  );
}

function StepFooter({ state, mission, index, step }: { state: TourState; mission: Mission; index: number; step: TourStep }) {
  const B = TOUR_UI.buttons;
  const next = () => saveTourState(advanceStep(state, index));
  const skip = () => saveTourState(skipMission(state));
  let buttons: ReactNode;

  if (step.id === 'library-offer') {
    const openGuide = () => {
      // Despliega la primera guía de la tarjeta, la del paso a paso: es lo que hay que leer antes de importar.
      const toggle = document.querySelector<HTMLButtonElement>('[data-tour="import-card"] button[aria-expanded="false"]');
      toggle?.click();
      next();
    };
    buttons = (
      <>
        <button type="button" className="btn btn-quiet" onClick={skip}>{B.noPlaynite}</button>
        <button type="button" className="btn btn-primary" onClick={openGuide}>{B.openGuide}</button>
      </>
    );
  } else if (step.id === 'library-import') {
    buttons = <button type="button" className="btn btn-secondary" onClick={skip}>{B.continueTour}</button>;
  } else if (step.id === 'added') {
    buttons = (
      <>
        <button type="button" className="btn btn-quiet" onClick={() => completeAndFold(state)}>{B.later}</button>
        <button type="button" className="btn btn-primary" onClick={next}>{B.go}</button>
      </>
    );
  } else if (step.kind === 'done') {
    buttons = <button type="button" className="btn btn-primary" onClick={next}>{B.next}</button>;
  } else if (step.kind === 'info') {
    buttons = (
      <>
        <button type="button" className="btn btn-quiet" onClick={skip}>{B.skip}</button>
        <button type="button" className="btn btn-primary" onClick={next}>{B.next}</button>
      </>
    );
  } else {
    buttons = <button type="button" className="btn btn-quiet" onClick={skip}>{B.skipMission}</button>;
  }

  return (
    <div className="ob-foot">
      <Dots mission={mission} index={index} />
      {buttons}
    </div>
  );
}

/* ── Lista de misiones: la bienvenida y el menú del botón plegado ────────────────────────────────────────── */

function missionStatus(state: TourState, id: MissionId): 'done' | 'skipped' | 'current' | 'pending' {
  if (state.completed.includes(id)) return 'done';
  if (state.skipped.includes(id)) return 'skipped';
  if (state.mission === id || (!state.mission && id === 'first-game')) return 'current';
  return 'pending';
}

function MissionRow({ state, id, onChoose }: { state: TourState; id: MissionId; onChoose?: (id: MissionId) => void }) {
  const M = TOUR_UI.missions[id];
  const status = missionStatus(state, id);
  const iconClass = status === 'done' ? ' is-done' : status === 'skipped' ? ' is-skipped' : status === 'current' ? ' is-current' : id === 'library' ? ' is-optional' : '';
  const trailing = status === 'done'
    ? <span className="ob-row-state is-done">{TOUR_UI.menu.done}</span>
    : status === 'skipped'
      ? <span className="ob-row-state">{TOUR_UI.menu.skipped}</span>
      : status === 'current' && state.status === 'menu'
        ? <span className="ob-row-state is-now">{TOUR_UI.menu.now}</span>
        : id === 'library'
          ? <span className="ob-tag">{TOUR_UI.menu.secondary}</span>
          : 'time' in M ? <span className="ob-count">{M.time}</span> : null;
  const body = (
    <>
      <span className={`ob-mission-icon${iconClass}`}>
        <TourIcon name={status === 'done' ? 'check' : status === 'skipped' ? 'minus' : MISSION_ICON[id]} />
      </span>
      <span className="ob-row-body">
        <span className="ob-mission-name">{M.name}</span>
        <span className="ob-mission-sub">{M.sub}</span>
      </span>
      {trailing}
    </>
  );
  return (
    <li className="ob-row">
      {onChoose ? <button type="button" className="ob-row-inner" onClick={() => onChoose(id)}>{body}</button> : <div className="ob-row-inner">{body}</div>}
    </li>
  );
}

function MissionsCard({ state }: { state: TourState }) {
  const isOffer = state.status === 'offer';
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);

  // El MENÚ lo abre quien pulsa el botón plegado: ahí sí se lleva el foco, que es donde está su atención. La
  // bienvenida sale sola al llegar y no se lo quita a nadie.
  useEffect(() => {
    if (!isOffer) cardRef.current?.focus();
  }, [isOffer]);

  return (
    <>
      <Scrim hole={null} />
      <section
        ref={cardRef}
        className="ob-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onEscape(state)}
      >
        <div className="ob-kicker">
          <span>{isOffer ? TOUR_UI.welcome.kicker : TOUR_UI.menu.kicker}</span>
          <button type="button" className="ob-close" aria-label={TOUR_UI.buttons.fold} title={TOUR_UI.buttons.fold} onClick={() => fold(state)}>
            <TourIcon name="close" />
          </button>
        </div>
        <h2 className="ob-title ob-title-lg" id={titleId}>{isOffer ? TOUR_UI.welcome.title : TOUR_UI.menu.title}</h2>
        {isOffer ? <p className="ob-text">{TOUR_UI.welcome.text}</p> : null}
        <ul className="ob-missions">
          {MISSION_IDS.map((id) => (
            <MissionRow key={id} state={state} id={id} onChoose={isOffer ? undefined : (chosen) => saveTourState(chooseMission(state, chosen))} />
          ))}
        </ul>
        <div className="ob-foot ob-foot-split">
          {isOffer ? (
            <>
              <button type="button" className="btn btn-quiet" onClick={() => fold(state)}>{TOUR_UI.welcome.later}</button>
              <button type="button" className="btn btn-primary" onClick={() => saveTourState(startTour(state))}>{TOUR_UI.welcome.start}</button>
            </>
          ) : (
            <>
              {/* Salir de la guía es decir que no a TODO: tampoco se ofrecerá sola ninguna misión en su pantalla. */}
              <button type="button" className="btn btn-quiet" onClick={() => saveTourState({ ...state, status: 'dismissed', declined: [...MISSION_IDS] })}>{TOUR_UI.menu.exit}</button>
              <button type="button" className="btn btn-primary" onClick={() => saveTourState(startTour(state))}>{TOUR_UI.menu.resume}</button>
            </>
          )}
        </div>
        <p className="ob-note">{isOffer ? TOUR_UI.welcome.note : TOUR_UI.menu.note}</p>
      </section>
    </>
  );
}

/* ── El final ─────────────────────────────────────────────────────────────────────────────────────────────── */

function FinaleCard({ state }: { state: TourState }) {
  const titleId = useId();
  const finish = () => saveTourState({ ...state, status: 'done' });
  return (
    <>
      <Scrim hole={null} />
      <section className="ob-card ob-card-finale" role="dialog" aria-modal="false" aria-labelledby={titleId} onKeyDown={onEscape(state)}>
        <span className="ob-trophy" aria-hidden="true"><TourIcon name="trophy" /></span>
        <p className="ob-kicker ob-kicker-center is-optional">{TOUR_UI.finale.kicker}</p>
        <h2 className="ob-title ob-title-lg" id={titleId}>{TOUR_UI.finale.title}</h2>
        <p className="ob-text">{TOUR_UI.finale.text}</p>
        <ul className="ob-missions">
          {MISSION_IDS.map((id) => <MissionRow key={id} state={state} id={id} />)}
        </ul>
        <button type="button" className="btn btn-primary ob-wide" onClick={finish}>{TOUR_UI.finale.cta}</button>
      </section>
    </>
  );
}

/* ── El botón plegado de la izquierda ────────────────────────────────────────────────────────────────────── */

/**
 * PARA QUIEN VUELVE Y QUIERE SEGUIR. Va DENTRO del carril de avisos de abajo a la izquierda (`.ach-toast-stack`),
 * como uno más: así se apila con el aviso de lo último que hiciste y con los logros en vez de caer encima de
 * ellos, y se apaga con el resto cuando se abre el menú de Ajustes.
 */
function TourPill({ state }: { state: TourState }) {
  const [lane, setLane] = useState<Element | null>(null);
  useEffect(() => setLane(document.querySelector('.ach-toast-stack')), []);
  const { done, total } = mainProgress(state);
  const pending = MISSION_IDS.find((id) => !state.completed.includes(id) && !state.skipped.includes(id));
  const nextId = state.mission ?? pending ?? null;
  const circumference = 2 * Math.PI * 14;
  // Una vuelta de una sola misión (la de un ofrecimiento) se nombra por su misión: «1 de 3» contaría una guía que
  // no se está haciendo.
  const singleName = state.single && state.mission ? TOUR_UI.missions[state.mission].name : null;
  const pill = (
    <button
      type="button"
      className="ob-pill"
      aria-label={singleName ? TOUR_UI.pill.singleAria(singleName) : TOUR_UI.pill.aria(done, total)}
      onClick={() => saveTourState(state.single && state.status === 'paused' ? { ...state, status: 'active' } : { ...state, status: 'menu' })}
    >
      <svg className="ob-pill-ring" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="ob-pill-track" cx="18" cy="18" r="14" />
        <circle
          className="ob-pill-value"
          cx="18"
          cy="18"
          r="14"
          strokeDasharray={`${(circumference * done) / total} ${circumference}`}
          transform="rotate(-90 18 18)"
        />
        <text x="18" y="22.5" textAnchor="middle">{done}</text>
      </svg>
      <span className="ob-pill-body">
        <span className="ob-pill-title">
          <span className="ob-pill-name">{singleName ?? TOUR_UI.pill.title}</span>
          {singleName ? null : <span className="ob-pill-count">{TOUR_UI.pill.count(done, total)}</span>}
        </span>
        {singleName ? <span className="ob-pill-next">{TOUR_UI.pill.single}</span>
          : nextId ? <span className="ob-pill-next">{TOUR_UI.pill.next(TOUR_UI.missions[nextId].name)}</span> : null}
      </span>
      <TourIcon name="up" className="ob-icon ob-pill-chevron" />
    </button>
  );
  return lane ? createPortal(pill, lane) : null;
}

/* ── Invitar a un amigo ───────────────────────────────────────────────────────────────────────────────────── */

function InviteSheet({ state, index }: { state: TourState; index: number }) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const finish = () => saveTourState(advanceStep(state, index));

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  return (
    <>
      <Scrim hole={null} />
      <section
        ref={sheetRef}
        className="ob-sheet"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onEscape(state)}
      >
        <span className="ob-grip" aria-hidden="true" />
        <div className="ob-kicker">
          <span>{TOUR_UI.missions.coop.kicker}</span>
          <span className="ob-count">3/3</span>
          <button type="button" className="ob-close" aria-label={TOUR_UI.buttons.fold} title={TOUR_UI.buttons.fold} onClick={() => fold(state)}>
            <TourIcon name="close" />
          </button>
        </div>
        <h2 className="ob-title ob-title-lg" id={titleId}>{TOUR_UI.steps.invite.title}</h2>
        <p className="ob-text">{TOUR_UI.steps.invite.text}</p>
        {/* El mismo bloque que la pantalla de Amigos: vista previa, dirección, copiar y compartir. */}
        <InviteLink
          onShared={finish}
          buttonClassName="ob-wide"
          secondary={(copied) => (
            <button type="button" className="btn btn-secondary ob-wide" onClick={finish}>
              {copied ? TOUR_UI.buttons.next : INVITE_UI.later}
            </button>
          )}
        />
      </section>
    </>
  );
}
