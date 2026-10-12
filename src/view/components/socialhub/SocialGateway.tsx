import { memo } from 'react';
import { Link } from 'react-router-dom';
import { SOCIAL_UI } from '../../../core/constants/socialLabels';
import { LEGAL_CONSENT_UI, LEGAL_ROUTES } from '../../../core/constants/legal';
import type { IconName } from '../../../core/constants/icons';
import type { GatewayStep } from '../../../viewmodel/social/socialGateway';
import type { GatewayRecovery } from '../../../viewmodel/social/useGatewayRecovery';
import type { GithubConnection } from '../../../viewmodel/sync/githubConnection';
import { Icon } from '../Icon';
import { GithubSyncCard } from '../sync/GithubSyncCard';
import { HubOfflineNotice } from './HubOfflineNotice';
import { HubStatus } from './HubStatus';
import { ScreenTitle } from './ScreenTitle';

export interface SocialGatewayCta {
  icon: IconName;
  label: string;
  action: () => void;
  disabled: boolean;
}

export interface SocialGatewayProps {
  steps: GatewayStep[];
  currentStep: number;
  hasMainSync: boolean;
  hasSocialSession: boolean;
  hasSocialGist: boolean;
  /** Nombre (o correo) de la sesión de Google, para el estado técnico. */
  sessionName: string;
  primaryCta: SocialGatewayCta | null;
  /** La conexión con GitHub de la aplicación; `null` si esta parte del árbol no la tiene (pruebas de componente). */
  githubConnection: GithubConnection | null;
  recovery: GatewayRecovery;
  offline: boolean;
  serviceLimited: boolean;
  legalConsentRequired: boolean;
  savingConsent: boolean;
  onAcceptLegalConsent: () => void;
  onSignOut: () => void;
  status: string;
  statusKind: string;
}

/**
 * LA PASARELA DEL HUB SOCIAL: lo que ve quien todavía no tiene el espacio abierto.
 *
 * Estaba escrita al final de `SocialHub`. Vive aparte para que la maqueta del social (`docs/maquetas/social.tsx`)
 * pinte la pasarela REAL en todos sus estados —sin sesión no hay otra forma de recorrerlos—, y es presentacional:
 * qué paso toca y qué botón lleva lo decide `useSocialGateway`; el atajo de Google, `useGatewayRecovery`.
 */
export const SocialGateway = memo(function SocialGateway({
  steps,
  currentStep,
  hasMainSync,
  hasSocialSession,
  hasSocialGist,
  sessionName,
  primaryCta,
  githubConnection,
  recovery,
  offline,
  serviceLimited,
  legalConsentRequired,
  savingConsent,
  onAcceptLegalConsent,
  onSignOut,
  status,
  statusKind,
}: SocialGatewayProps) {
  /**
   * EL PRIMER PASO SE DA AQUÍ, no en otra pantalla. La conexión con GitHub es la misma que ofrece Integración
   * —el componente y el viewmodel son los mismos, ver `GithubSyncCard`—, así que la pasarela ya no manda a
   * Ajustes a quien viene a montar su espacio social y luego no sabe volver.
   *
   * DOS CONDICIONES, y las dos por el mismo motivo: que el paso 1 se vea tan sencillo como el 2.
   *  - Sin proveedor (`null`): el hub se monta suelto en las pruebas de componente y no puede exigir el árbol
   *    entero de `App`.
   *  - Sin OAuth en el build: lo único que quedaría por ofrecer aquí es pegar un token a mano, que es
   *    exactamente lo que esta pantalla no debe pedir.
   * En ambos casos el paso 1 vuelve a ser el botón de siempre, que lleva a Integración: allí sí se explica.
   */
  const showSyncCard = !hasMainSync && Boolean(githubConnection?.oauthEnabled);

  /**
   * LO QUE DICE CADA PASO, en el orden de `steps`.
   *
   * Lo normal es la explicación del propio paso. Los casos que piden otra cosa son estados reales en los que se ha
   * quedado gente: entrar con Google y que el espacio social no llegue a crearse, volver a una instalación nueva
   * cuando el espacio ya existía, y entrar con Google ANTES de GitHub (el atajo) con una cuenta que no tenía nada.
   */
  const stageNotes = steps.map((step) => {
    if (step.id === 'sync') {
      return recovery.accountHasNothing ? SOCIAL_UI.gateway.recoverNothingSaved : step.subtitle;
    }
    if (step.id !== 'google') return step.subtitle;
    // Con sesión y sin GitHub, el espacio no se puede preparar todavía: decir «falta preparar tu espacio» pedía
    // algo que en este paso no se puede hacer.
    if (hasSocialSession && !hasMainSync) return SOCIAL_UI.gateway.signedInAwaitingSync;
    if (hasSocialSession && !hasSocialGist) return SOCIAL_UI.gateway.gistRequired;
    if (!hasSocialSession && hasSocialGist) return SOCIAL_UI.gateway.gistReadySignIn;
    return step.subtitle;
  });

  /**
   * EL ATAJO: entrar con Google en vez de conectar GitHub, debajo del botón de GitHub y por debajo de él en peso.
   * GitHub sigue siendo el principal porque es el camino de quien empieza; el atajo es para quien vuelve, y solo
   * se puede saber quién es quién después de entrar.
   */
  const recoveryShortcut = recovery.available ? (
    <div className="hub-gateway-alt">
      <p className="hub-gateway-alt-sep">{SOCIAL_UI.gateway.recoverPrompt}</p>
      <button
        className="btn btn-secondary hub-gateway-btn"
        type="button"
        onClick={recovery.recover}
        disabled={recovery.recovering}
      >
        <Icon name="google-recover" />
        <span>
          {recovery.recovering
            ? SOCIAL_UI.gateway.recovering
            : hasSocialSession ? SOCIAL_UI.gateway.recoverWithSession : SOCIAL_UI.gateway.recoverSignIn}
        </span>
      </button>
    </div>
  ) : null;

  /**
   * LA ACCIÓN DE CADA PASO, dentro de su paso.
   *
   * Solo hay una a la vez —la del paso que toca—: el primero conecta GitHub (la tarjeta compartida con Integración,
   * o su botón de respaldo hacia Ajustes si este build no trae OAuth), con el atajo de Google debajo, y el segundo
   * entra con Google y, si hace falta, reintenta la creación del espacio. `primaryCta` ya resuelve cuál toca; aquí
   * solo se decide bajo qué paso cuelga.
   */
  const ctaStageIndex = hasMainSync ? 1 : 0;
  const stageActions = steps.map((_step, index) => {
    let action = null;
    if (index === 0 && showSyncCard && githubConnection) {
      action = (
        <GithubSyncCard
          key="github"
          connection={githubConnection}
          variant="gateway"
          ctaClassName="btn btn-primary hub-gateway-btn hub-gateway-btn-primary"
          disabled={recovery.recovering}
        />
      );
    } else if (index === ctaStageIndex && primaryCta) {
      action = (
        <button
          key="cta"
          className="btn btn-primary hub-gateway-btn hub-gateway-btn-primary"
          type="button"
          onClick={primaryCta.action}
          disabled={primaryCta.disabled || (index === 0 && recovery.recovering)}
        >
          <Icon name={primaryCta.icon} />
          <span>{primaryCta.label}</span>
        </button>
      );
    }
    return index === 0 ? <>{action}{recoveryShortcut}</> : action;
  });

  return (
    <section className="hub-hub hub-hub-gateway" aria-label={SOCIAL_UI.screenAria}>
      <div className="hub-hub-card hub-hub-gateway-card">
        <div className="hub-hub-title-wrap">
          <h2><ScreenTitle text={SOCIAL_UI.hubTitle} /></h2>
        </div>
        <p className="hub-gateway-lead">
          {SOCIAL_UI.gateway.lead}
        </p>
        {/* Los dos pasos necesitan red (Google, Firestore, GitHub): sin conexión no se puede dar ninguno, así que
            se dice antes de que el usuario pulse y espere a un timeout. */}
        {offline ? <HubOfflineNotice hasCachedData={false} /> : serviceLimited ? <HubOfflineNotice variant="limited" hasCachedData={false} /> : null}

        {/* L4 — puerta de aceptación: con sesión iniciada y sin conformidad vigente, no se entra ni se crea el
            espacio social hasta marcarla. No afecta a las listas propias ni a la sincronización. */}
        {legalConsentRequired ? (
          <div className="hub-gateway-consent">
            <strong>{LEGAL_CONSENT_UI.title}</strong>
            <p>{LEGAL_CONSENT_UI.body}</p>
            <div className="hub-legal-links">
              <Link to={LEGAL_ROUTES.terms}>{LEGAL_CONSENT_UI.termsLink}</Link>
              <Link to={LEGAL_ROUTES.privacy}>{LEGAL_CONSENT_UI.privacyLink}</Link>
            </div>
            <label className="hub-gateway-consent-check">
              <input
                type="checkbox"
                checked={false}
                disabled={savingConsent}
                onChange={onAcceptLegalConsent}
              />
              <span>{savingConsent ? LEGAL_CONSENT_UI.pending : LEGAL_CONSENT_UI.checkbox}</span>
            </label>
          </div>
        ) : null}

        {/* ═══ LOS DOS PASOS, Y LA ACCIÓN DENTRO DE SU PASO ═══════════════════════════════════════════════
            Antes esto eran cuatro piezas diciendo lo mismo: un rótulo («paso 1 de 3»), una barra de progreso,
            tres fichas con el nombre de cada paso y —lejos de todas ellas— un botón suelto que no decía a cuál
            pertenecía. Con dos pasos eso no se sostiene: la lista ES el progreso, y cada paso lleva su propio
            botón, así que no hay que emparejar nada con la vista.
            `<ol>` y no `<div>`: son pasos en orden, y así se leen también sin ver la pantalla. */}
        <ol className="hub-gateway-path" aria-label={SOCIAL_UI.gateway.stepsAria}>
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const isCurrent = stepNumber === currentStep && !step.done;
            return (
              <li
                key={step.id}
                className={`hub-gateway-stage ${step.done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`.trim()}
              >
                <span className="hub-gateway-stage-mark">
                  {step.done ? (
                    <>
                      <Icon name="check" />
                      <span className="sr-only">{SOCIAL_UI.gateway.stageDone}</span>
                    </>
                  ) : (
                    stepNumber
                  )}
                </span>
                <div className="hub-gateway-stage-body">
                  <h3 className="hub-gateway-stage-title">{step.title}</h3>
                  <p className="hub-gateway-stage-note">{stageNotes[index]}</p>
                  {stageActions[index]}
                </div>
              </li>
            );
          })}
        </ol>

        {hasSocialSession ? (
          <div className="hub-gateway-actions" aria-label={SOCIAL_UI.gateway.actionsAria}>
            <button className="btn btn-exit hub-gateway-btn" type="button" onClick={onSignOut}>
              <Icon name="logout" />
              <span>{SOCIAL_UI.gateway.signOut}</span>
            </button>
          </div>
        ) : null}

        {/* EL ESTADO POR DENTRO. No es letra pequeña ni un apéndice: es lo que se mira cuando algo no cuadra —los
            TRES requisitos de verdad, uno de ellos el espacio social, que no es un paso pero sí una condición—,
            así que se queda con el peso que tenía y abierto. Lo que ha cambiado es que ahora dice la verdad: el
            flujo de abajo anunciaba cuatro etapas de un alta que son dos. */}
        <details className="hub-gateway-details" open>
          <summary>{SOCIAL_UI.gateway.detailsSummary}</summary>
          <div className="hub-status-grid" aria-label={SOCIAL_UI.gateway.stateAria}>
            <article className={`hub-status-card ${hasMainSync ? 'is-ok' : 'is-pending'}`}>
              <span className="hub-status-label">{SOCIAL_UI.gateway.stateSync}</span>
              <strong>{hasMainSync ? SOCIAL_UI.gateway.stateConnected : SOCIAL_UI.gateway.stateNotConnected}</strong>
            </article>
            {/* EL ESPACIO SOCIAL, SOLO CUANDO PUEDE DECIR ALGO. No se crea hasta que hay sesión de Google —lo
                hace solo, ver el efecto de auto-creación—, así que antes de ese paso «No enlazado» no es un
                estado: es lo único que podía poner, y colado entre los otros dos parecía un tercer pendiente en
                una pantalla que promete dos pasos. Con sesión ya iniciada sí informa, y es además la ÚNICA señal
                de que el espacio no llegó a prepararse, que es el caso con el que se viene aquí a mirar. */}
            {hasSocialSession || hasSocialGist ? (
              <article className={`hub-status-card ${hasSocialGist ? 'is-ok' : 'is-pending'}`}>
                <span className="hub-status-label">{SOCIAL_UI.gateway.stateGist}</span>
                <strong>{hasSocialGist ? SOCIAL_UI.gateway.stateLinked : SOCIAL_UI.gateway.stateNotLinked}</strong>
              </article>
            ) : null}
            <article className={`hub-status-card ${hasSocialSession ? 'is-ok' : 'is-pending'}`}>
              <span className="hub-status-label">{SOCIAL_UI.gateway.stateSession}</span>
              <strong>{hasSocialSession ? (sessionName || SOCIAL_UI.gateway.stateActive) : SOCIAL_UI.gateway.stateNotStarted}</strong>
            </article>
          </div>
        </details>

        <HubStatus status={status} statusKind={statusKind} />
      </div>
    </section>
  );
});
