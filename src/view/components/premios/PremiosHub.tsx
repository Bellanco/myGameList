import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PREMIOS_UI } from '../../../core/constants/premiosLabels';
import { buildLibraryIndex } from '../../../core/premios/library';
import { getOwnProfileRef } from '../../../model/repository/firebaseSocialRepository';
import { ensureLightAccount } from '../../../model/repository/lightAccountRepository';
import { subscribeSocialAuth } from '../../../model/repository/firebaseGateway';
import type { SocialAuthUser } from '../../../model/repository/firebaseClient';
import type { TabData } from '../../../model/types/game';
import { matchPremiosRoute, PREMIOS_ROUTES } from '../../../viewmodel/premios/premiosRoutes';
import { usePremiosEdition } from '../../../viewmodel/premios/usePremiosEdition';
import { usePremiosProfiles } from '../../../viewmodel/premios/usePremiosFaces';
import { usePremiosResult } from '../../../viewmodel/premios/usePremiosResult';
import { usePremiosVoting } from '../../../viewmodel/premios/usePremiosVoting';
import { starsFromGrade } from '../../../core/utils/scoreScale';
import { usePalette } from '../../hooks/usePalette';
import { useScoreScale } from '../../hooks/useScoreScale';
import { PremiosCerrada, PremiosEnviada, PremiosYaVotaste } from './PremiosEstado';
import { PremiosPortada } from './PremiosPortada';
import { PremiosResultsScreen } from './PremiosResultsScreen';
import { PremiosReviewScreen } from './PremiosReviewScreen';
import { PremiosVoteScreen } from './PremiosVoteScreen';
import '../../../styles/premios.scss';

/**
 * La sección de premios: decide qué pantalla toca y sostiene el estado de la votación.
 *
 * TRES COSAS QUE VIENEN DE FUERA y no se rehacen aquí, que es lo que distingue integrar de injertar: la SESIÓN es
 * la de la aplicación (no hay un segundo «entrar con Google»), la ESCALA DE PUNTUACIÓN es la que cada cual tenga
 * elegida, y la BIBLIOTECA se recibe por props para poder cruzar los nominados con tus juegos.
 *
 * El chunk entero es perezoso —lo monta `App` con `lazy`—, así que nada de esto entra en el arranque de quien
 * nunca abre la sección.
 */
export interface PremiosHubProps {
  /** La biblioteca, para el cruce de `core/premios/library`. */
  games: TabData;
}

export function PremiosHub({ games }: PremiosHubProps) {
  const location = useLocation();
  const navigate = useNavigate();
  // La escala es la que tenga elegida quien mira: la misma nota se enseña como estrellas o como cifra, igual que
  // en el resto de la aplicación. Quien no haya puntuado el juego no ve ninguna.
  const scale = useScoreScale();
  // La frase del titular la pone el TEMA, como en el hub social.
  const { palette } = usePalette();
  const formatGrade = useCallback(
    (grade: number | null) => {
      if (grade === null) return '';
      return scale === 'grade' ? String(Math.round(grade)) : '★'.repeat(starsFromGrade(grade));
    },
    [scale],
  );

  const [user, setUser] = useState<SocialAuthUser | null>(null);
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => subscribeSocialAuth(setUser), []);

  // El pseudónimo del perfil, si esta cuenta ya tiene uno. No es obligatorio para votar —quien llega por primera
  // vez todavía no lo tiene— pero es lo único que permitirá a su fila de la clasificación enlazar a su perfil.
  useEffect(() => {
    let vivo = true;
    if (!user?.uid) {
      setProfileId('');
      return () => {
        vivo = false;
      };
    }
    void getOwnProfileRef(user.uid)
      .then((ref) => {
        if (vivo) setProfileId(ref?.profileId || '');
      })
      .catch(() => {
        // Sin perfil se vota igual: el pseudónimo es opcional en la papeleta y en las reglas.
      });
    return () => {
      vivo = false;
    };
  }, [user?.uid]);

  const edition = usePremiosEdition(user?.uid || '');
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

  const libraryIndex = useMemo(() => buildLibraryIndex(games), [games]);

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

  if (edition.loading) {
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

  // Sin sesión solo se puede ver la portada: las categorías y la papeleta las deniegan las reglas, con razón.
  const necesitaSesion = !user && route.panel !== 'portada';
  const enFlujo = route.panel === 'votar' || route.panel === 'revisar';
  const hasResults = Boolean(edition.config?.lastPublishedId);

  // LAS DOS PUERTAS POR LAS QUE NO SE PUEDE SEGUIR, comprobadas antes de pintar el formulario: llegar con el
  // plazo cerrado y volver sin correcciones. Enseñar la papeleta en cualquiera de los dos casos sería ofrecer un
  // botón que las reglas van a rechazar.
  const fueraDePlazo = enFlujo && !edition.votingOpen;
  const sinCorrecciones = enFlujo && Boolean(edition.ballot) && !edition.canEdit && edition.votingOpen;

  return (
    <div className="premios-hub">
      {necesitaSesion ? (
        <section className="premios-hub premios-estado" aria-label={PREMIOS_UI.sectionAria}>
          <p>{PREMIOS_UI.errores.needsSession}</p>
        </section>
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
        <PremiosEnviada remainingEdits={edition.remainingEdits} hasResults={hasResults} />
      ) : route.panel === 'votar' ? (
        <PremiosVoteScreen
          categories={edition.categories}
          paso={route.paso}
          votes={voting.votes}
          libraryIndex={libraryIndex}
          formatGrade={formatGrade}
          onChoose={voting.choose}
        />
      ) : route.panel === 'revisar' ? (
        <PremiosReviewScreen
          categories={edition.categories}
          votes={voting.votes}
          defaultName={edition.ballot?.userDisplayName || user?.displayName || ''}
          remainingEdits={edition.remainingEdits}
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
        />
      )}
    </div>
  );
}
