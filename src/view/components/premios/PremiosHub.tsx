import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { ensureLightAccount } from '../../../model/repository/lightAccountRepository';
import { signInWithGoogle, subscribeSocialAuth } from '../../../model/repository/firebaseGateway';
import type { SocialAuthUser } from '../../../model/repository/firebaseClient';
import { matchPremiosRoute, panelNeedsSession, PREMIOS_ROUTES } from '../../../viewmodel/premios/premiosRoutes';
import { usePremiosEdition } from '../../../viewmodel/premios/usePremiosEdition';
import { usePremiosProfiles } from '../../../viewmodel/premios/usePremiosFaces';
import { usePremiosResult } from '../../../viewmodel/premios/usePremiosResult';
import { usePremiosVoter } from '../../../viewmodel/premios/usePremiosVoter';
import { usePremiosVoting } from '../../../viewmodel/premios/usePremiosVoting';
import { usePalette } from '../../hooks/usePalette';
import { PremiosCerrada, PremiosEnviada, PremiosIdentificate, PremiosYaVotaste } from './PremiosEstado';
import { PremiosPortada } from './PremiosPortada';
import { PremiosResultsScreen } from './PremiosResultsScreen';
import { PremiosReviewScreen } from './PremiosReviewScreen';
import { PremiosVoteScreen } from './PremiosVoteScreen';
import '../../../styles/premios.scss';

/**
 * La sección de premios: decide qué pantalla toca y sostiene el estado de la votación.
 *
 * LO QUE VIENE DE FUERA y no se rehace aquí, que es lo que distingue integrar de injertar: la SESIÓN es la de la
 * aplicación (no hay un segundo «entrar con Google»), el TEMA pone la voz de los titulares y las CARÁTULAS salen
 * de la misma preferencia que el resto de la app.
 *
 * YA NO RECIBE LA BIBLIOTECA. La recibió para cruzar los nominados con tus juegos y pintar en cada tarjeta en
 * qué lista lo tenías; esa marca se retiró el 20-09-2026 (ver `NomineeCard`), y con ella la única razón por la
 * que esta sección necesitaba la biblioteca entera. El cruce sigue escrito en `core/premios/library` por si
 * vuelve a otro sitio.
 *
 * El chunk entero es perezoso —lo monta `App` con `lazy`—, así que nada de esto entra en el arranque de quien
 * nunca abre la sección.
 */
export function PremiosHub() {
  const location = useLocation();
  const navigate = useNavigate();
  // La frase del titular la pone el TEMA, como en el hub social.
  const { palette } = usePalette();

  const [user, setUser] = useState<SocialAuthUser | null>(null);
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => subscribeSocialAuth(setUser), []);

  /**
   * QUIÉN VOTA: su pseudónimo —lo único que permite a su fila de la clasificación enlazar a su perfil, y que no
   * es obligatorio para votar— y su cupo de oportunidades, que sale de su rango y de si tiene canal social.
   */
  const voter = usePremiosVoter(user?.uid || '');
  const [profileId, setProfileId] = useState('');
  useEffect(() => setProfileId(voter.profileId), [voter.profileId]);

  const edition = usePremiosEdition(user?.uid || '', voter);
  const voting = usePremiosVoting(edition.categories);
  const route = matchPremiosRoute(location.pathname);
  // El archivo se pide SOLO cuando se está mirando: es una lectura más, y la portada no lo necesita.
  const archivo = usePremiosResult(route.panel === 'resultados' ? route.seasonId : '', route.panel === 'resultados' ? edition.config : null);
  // Quién de la clasificación tiene perfil al que enlazar. Cacheado por el repositorio: llegar aquí desde la app
  // no cuesta ninguna lectura.
  const perfiles = usePremiosProfiles(archivo.leaderboard, user?.uid || '');

  // Corregir un voto arranca de lo ya enviado, no de cero.
  useEffect(() => {
    if (edition.ballot && edition.categories.length > 0 && voting.votedCount === 0) {
      voting.restoreFrom(edition.ballot, edition.categories);
    }
    // Solo al llegar la papeleta: recalcularlo en cada cambio de votos borraría lo que se acaba de elegir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition.ballot, edition.categories]);

  /**
   * ENTRAR, sin salir de la sección.
   *
   * Es el inicio de sesión de la aplicación (`signInWithGoogle` del gateway), no uno propio de la porra: la
   * sesión es una sola (`docs/plan-unificar-premios.md` §1.5). Al resolverse, `subscribeSocialAuth` actualiza al
   * usuario y la pantalla que estaba pidiendo sesión pasa sola a la que toca.
   */
  const handleSignIn = useCallback(async () => {
    setSignInError('');
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Cerrar la ventana de Google es el caso normal, no una avería: se dice lo mismo y se puede reintentar.
      setSignInError(PREMIOS_UI.portada.signInFailed);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const handleSubmit = useCallback(
    async (displayName: string) => {
      setError('');
      try {
        // VOTAR DEJA CUENTA. Quien llega por primera vez no tiene perfil —crearlo exige GitHub, y eso aquí sería
        // un muro— así que se le crea una CUENTA LIGERA: nombre, foto y pseudónimo, sin canal y sin salir en el
        // directorio. Es lo que permitirá que su fila de la clasificación enlace a algún sitio el día que
        // complete su perfil. Si falla, se vota igual: el pseudónimo es opcional.
        const pseudonimo = profileId || (await ensureLightAccount(user, displayName));
        if (pseudonimo && pseudonimo !== profileId) setProfileId(pseudonimo);

        await voting.submit({
          author: { uid: user?.uid || '', displayName: user?.displayName, profileId: pseudonimo },
          displayName,
          season: Number(edition.config?.season) || new Date().getFullYear(),
          existing: edition.ballot,
        });
        setJustSubmitted(true);
        await edition.reload();
        navigate(PREMIOS_ROUTES.sent);
      } catch {
        // El borrador sigue guardado, así que reintentar no pierde nada.
        setError(edition.votingOpen ? PREMIOS_UI.errores.submit : PREMIOS_UI.errores.closed);
      }
    },
    [edition, navigate, profileId, user, voting],
  );

  // SE ESPERA TAMBIÉN AL PERFIL, y no es cosmético: el cupo sale de él, así que decidir antes de tenerlo le
  // enseñaría «ya has gastado tus oportunidades» a quien tiene diecinueve, durante el parpadeo que tarda la
  // lectura. Sin sesión no hay perfil que esperar.
  if (edition.loading || voter.loading) {
    return <div className="premios-hub" aria-busy="true" aria-label={PREMIOS_UI.sectionAria} />;
  }

  if (edition.failed) {
    // SIN CONEXIÓN NO ES UN ERROR, y se dice distinto: la votación sigue en pie y lo único que no llega es el
    // estado de la edición. Es la misma distinción que hace el hub social, y con el mismo criterio.
    const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <section className="premios-hub premios-estado" aria-label={PREMIOS_UI.sectionAria}>
        <h2>{(sinRed ? PREMIOS_UI.errores.offlineByPalette : PREMIOS_UI.errores.leadByPalette)[palette]}</h2>
        <p className="premios-estado__muted">{sinRed ? PREMIOS_UI.errores.offline : PREMIOS_UI.errores.load}</p>
        <div className="premios-estado__actions">
          <button type="button" className="btn" onClick={() => void edition.reload()}>
            {PREMIOS_UI.errores.retry}
          </button>
        </div>
      </section>
    );
  }

  const enFlujo = panelNeedsSession(route.panel);
  const necesitaSesion = !user && enFlujo;
  const hasResults = Boolean(edition.config?.lastPublishedId);

  // LAS DOS PUERTAS POR LAS QUE NO SE PUEDE SEGUIR, comprobadas antes de pintar el formulario: llegar con el
  // plazo cerrado y volver sin correcciones. Enseñar la papeleta en cualquiera de los dos casos sería ofrecer un
  // botón que las reglas van a rechazar.
  const fueraDePlazo = enFlujo && !edition.votingOpen;
  const sinCorrecciones = enFlujo && Boolean(edition.ballot) && !edition.canEdit && edition.votingOpen;

  return (
    <div className="premios-hub">
      {necesitaSesion ? (
        <PremiosIdentificate signingIn={signingIn} error={signInError} onSignIn={() => void handleSignIn()} />
      ) : fueraDePlazo ? (
        <PremiosCerrada scheduled={edition.stage === 'none' && !hasResults} hasResults={hasResults} />
      ) : sinCorrecciones ? (
        <PremiosYaVotaste hasResults={hasResults} />
      ) : route.panel === 'resultados' ? (
        archivo.loading ? null : (
          <PremiosResultsScreen
            result={archivo.result}
            leaderboard={archivo.leaderboard}
            ownProfileId={profileId}
            profiles={perfiles}
          />
        )
      ) : route.panel === 'enviada' ? (
        <PremiosEnviada
          displayName={edition.ballot?.userDisplayName || user?.displayName || ''}
          remainingOpportunities={edition.remainingOpportunities}
          canEdit={edition.canEdit}
          hasResults={hasResults}
        />
      ) : route.panel === 'votar' ? (
        <PremiosVoteScreen
          categories={edition.categories}
          paso={route.paso}
          votes={voting.votes}
          onChoose={voting.choose}
        />
      ) : route.panel === 'revisar' ? (
        <PremiosReviewScreen
          categories={edition.categories}
          votes={voting.votes}
          defaultName={edition.ballot?.userDisplayName || user?.displayName || ''}
          remainingOpportunities={edition.remainingOpportunities}
          isEdit={Boolean(edition.ballot)}
          submitting={voting.submitting}
          error={error}
          onSubmit={(name) => void handleSubmit(name)}
        />
      ) : (
        <PremiosPortada
          config={edition.config}
          votingOpen={edition.votingOpen}
          hasResults={hasResults}
          hasBallot={Boolean(edition.ballot) || justSubmitted}
          canEdit={edition.canEdit}
          votedCount={voting.votedCount}
          total={edition.categories.length}
          signedIn={Boolean(user)}
          signingIn={signingIn}
          signInError={signInError}
          onSignIn={() => void handleSignIn()}
          opportunities={edition.opportunities}
          remainingOpportunities={edition.remainingOpportunities}
          hasSocialAccount={voter.hasSocialAccount}
        />
      )}
    </div>
  );
}
