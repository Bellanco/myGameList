// LOS LISTADOS DE OTRA PERSONA: de quién los tenemos, cómo se piden y cómo se refrescan.
//
// Cuarta pieza que sale de `useSocialViewModel`, y otro dominio cerrado: tres estados que solo se tocan entre
// ellos (la caché por perfil, los que no se pudieron leer y el indicador de «bajando»), el efecto que los llena
// y el refresco manual. Sus cuatro consumidores —el detalle de una actividad, la ficha de un perfil, la reseña
// dentro de esa ficha y las reseñas relacionadas— solo LEEN.
//
// TRES REGLAS QUE NO SON DETALLES DE IMPLEMENTACIÓN, y por eso vienen con el código en vez de quedarse en el
// hook grande donde se perdían entre dos mil líneas:
//
//  1. SOLO DE AMISTADES. El gist de listados lleva la biblioteca completa: reseñas enteras, notas y horas. De un
//     no-amigo no se lee nada —ni para pintar su ficha—, que es lo que sostiene la promesa de «perfil de
//     no-amigo = solo nombre y foto». Y de paso, ni una llamada que no haga falta.
//  2. FILTRADO POR SU VISIBILIDAD AL GUARDAR, no al pintar. Lo que se guarda en memoria ya viene recortado por
//     lo que su dueño esconde (`applyProfileVisibility`), así que ninguna pantalla puede enseñar de más por
//     olvidarse de filtrar. El rango de QUIEN MIRA entra en ese filtro: la cuenta de administración ve las
//     listas y las marcas que el dueño esconde, pero no sus horas.
//  3. UN FALLO SE APUNTA. Sin esa marca, el detalle esperaba para siempre el análisis completo de alguien cuyo
//     gist no se pudo leer, con el adelanto de 160 caracteres tapado por un esqueleto eterno. Apuntado, la
//     pantalla deja de esperar y enseña lo que hay, que a partir de ese momento es la verdad.
import { useCallback, useEffect, useState } from 'react';
import { getSocialSyncConfig } from '../../model/repository/socialGistRepository';
import { invalidateProfileGames, loadForeignProfileGames } from '../../model/repository/foreignProfileRepository';
import { applyProfileVisibility } from '../../core/utils/profileVisibility';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import type { ProfileTier } from '../../core/constants/tiers';
import type { GameItem, TabData, TabId } from '../../model/types/game';
import type { SocialProfileVisibility } from '../../model/types/social';
import { isOwnProfileIdentity } from './socialIdentity';
import type { SocialDirectoryEntry } from './socialFeed';

/** Los listados de un perfil ajeno, ya filtrados por su visibilidad. */
export type ForeignGames = Record<string, Record<TabId, GameItem[]>>;

export interface ForeignProfileGames {
  /** Listados bajados por perfil. La ausencia de una clave es «aún no se ha pedido». */
  foreignGames: ForeignGames;
  /** Perfiles cuyo gist NO se pudo leer: la pantalla deja de esperar y enseña el adelanto. */
  foreignProfileFailed: Record<string, true>;
  /** Indicador de interfaz («bajando listados»), no de datos: baja siempre, incluso al cancelar. */
  loadingForeignProfile: boolean;
  /** Un juego concreto: de los listados bajados si es ajeno, de los locales si es propio. */
  getGameItemById: (profileId: string, gameId: number) => GameItem | null;
  /** Refresco manual del perfil abierto: invalida la caché en IndexedDB y relee el gist. */
  refreshProfileDetail: () => Promise<void>;
}

export interface ForeignProfileGamesOptions {
  /** Pantalla activa del hub: solo tres piden listados ajenos. */
  activePanel: string;
  /** Perfil cuya ficha está abierta (`profile-detail` / `profile-review`). */
  profileDetailId: string;
  /** Perfil del evento abierto en el detalle de actividad. */
  detailProfileId: string;
  ownUid: string | undefined;
  ownProfileId: string | null;
  directory: SocialDirectoryEntry[];
  relationshipWith: (otherUid: string) => string;
  /** Listados PROPIOS, para resolver un juego propio sin bajar nada. */
  localGames: TabData;
  /** Rango de quien mira: entra en el filtro de visibilidad. */
  ownTier: ProfileTier;
  defaultVisibility: SocialProfileVisibility;
  /** Token con el que leer el gist ajeno; el del canal social manda sobre el de los listados. */
  fallbackToken: string | null;
  setFeedback: (kind: 'ok' | 'warn' | 'err', message: string, duration?: 'short' | 'long') => void;
  reportFailure: (error: unknown, fallback: string, kind?: 'err' | 'warn') => void;
}

/** Las tres pantallas que piden los listados de otra persona. */
const PANELS_QUE_PIDEN = ['detail', 'profile-detail', 'profile-review'];

export function useForeignProfileGames(options: ForeignProfileGamesOptions): ForeignProfileGames {
  const {
    activePanel, profileDetailId, detailProfileId, ownUid, ownProfileId, directory,
    relationshipWith, localGames, ownTier, defaultVisibility, fallbackToken, setFeedback, reportFailure,
  } = options;

  const [foreignGames, setForeignGames] = useState<ForeignGames>({});
  /**
   * Perfiles cuyo gist de listados no se pudo leer en ESTA sesión de hub.
   *
   * NO bloquea el reintento: quien decide si se vuelve a pedir es `foreignGames`, que sigue sin la clave. Esto
   * solo sirve para que el detalle deje de esperar un cuerpo que no va a llegar.
   */
  const [foreignProfileFailed, setForeignProfileFailed] = useState<Record<string, true>>({});
  const [loadingForeignProfile, setLoadingForeignProfile] = useState(false);

  // Al abrir el detalle de una reseña o de un perfil AJENO, baja su lista completa de juegos (cache-first 24 h en
  // IndexedDB; sin red si está fresca) y la guarda filtrada por su visibilidad. El perfil propio no se baja (ya
  // tiene datos locales). Sin token o ante fallo de red se queda index-only (adelanto del evento).
  useEffect(() => {
    if (!PANELS_QUE_PIDEN.includes(activePanel)) return;
    const targetProfileId = (activePanel === 'profile-detail' || activePanel === 'profile-review') ? profileDetailId : detailProfileId;
    if (!targetProfileId) return;
    if (isOwnProfileIdentity(targetProfileId, ownUid, ownProfileId)) return;
    if (foreignGames[targetProfileId]) return;
    const entry = directory.find((item) => item.id === targetProfileId);
    if (!entry || !entry.gamesGistId) return;
    if (relationshipWith(entry.uid) !== 'friends') return; // regla 1: solo de amistades.

    let cancelled = false;
    const token = getSocialSyncConfig()?.token || fallbackToken || null;
    setLoadingForeignProfile(true);
    loadForeignProfileGames({ profileId: targetProfileId, gamesGistId: entry.gamesGistId, token })
      .then((games) => {
        if (cancelled || !games) return;
        const visible = applyProfileVisibility(games, entry.visibility || defaultVisibility, ownTier);
        setForeignGames((prev) => ({ ...prev, [targetProfileId]: visible }));
      })
      .catch(() => {
        /* Regla 3: se apunta para que la pantalla deje de esperar y enseñe el adelanto. */
        if (!cancelled) setForeignProfileFailed((prev) => (prev[targetProfileId] ? prev : { ...prev, [targetProfileId]: true }));
      })
      .finally(() => {
        // Debe bajar SIEMPRE, aunque el efecto se haya cancelado al navegar; si no, un perfil abierto luego desde
        // caché (return temprano) dejaría el botón «Actualizar listados» colgado.
        setLoadingForeignProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activePanel, defaultVisibility, detailProfileId, directory, fallbackToken, foreignGames, ownProfileId, ownTier, ownUid, profileDetailId, relationshipWith]);

  /**
   * Obtiene un `GameItem` para un evento del feed. Para perfiles ajenos usa su lista bajada (ya filtrada por su
   * visibilidad); para el propio, los listados locales.
   */
  const getGameItemById = useCallback((profileId: string, gameId: number): GameItem | null => {
    // Propiedad por identidad (uid/profileId), no por correo.
    if (!isOwnProfileIdentity(profileId, ownUid, ownProfileId)) {
      // AJENO: la reseña completa (texto, puntos fuertes y débiles, categorías) sale de la lista bajada de SU
      // gist de listados, ya recortada por su visibilidad —las pestañas ocultas quedan vacías, así que el juego
      // no se revela—. Si aún no ha llegado, `null` y el detalle enseña el adelanto del evento.
      const foreign = foreignGames[profileId];
      if (foreign) {
        const match = [...foreign.c, ...foreign.v, ...foreign.e, ...foreign.p].find((game) => game.id === gameId);
        if (match) return match;
      }
      return null;
    }

    const allGames = [...localGames.c, ...localGames.v, ...localGames.e, ...localGames.p];
    return allGames.find((game) => game.id === gameId) || null;
  }, [foreignGames, localGames, ownProfileId, ownUid]);

  // Refresco manual del perfil abierto: invalida la caché de IndexedDB y relee del gist de listados.
  const refreshProfileDetail = useCallback(async () => {
    const profileId = profileDetailId;
    const entry = directory.find((item) => item.id === profileId);
    if (!entry || !entry.gamesGistId || isOwnProfileIdentity(profileId, ownUid, ownProfileId)) return;
    if (relationshipWith(entry.uid) !== 'friends') return; // solo se refrescan listados de amigos.
    try {
      setLoadingForeignProfile(true);
      await invalidateProfileGames(profileId);
      const token = getSocialSyncConfig()?.token || fallbackToken || null;
      const games = await loadForeignProfileGames({ profileId, gamesGistId: entry.gamesGistId, token, forceRefresh: true });
      if (games) {
        const visible = applyProfileVisibility(games, entry.visibility || defaultVisibility, ownTier);
        setForeignGames((prev) => ({ ...prev, [profileId]: visible }));
      } else {
        setFeedback('warn', SOCIAL_UI.status.profileGamesRefreshFailed);
      }
    } catch (error) {
      reportFailure(error, SOCIAL_UI.status.profileGamesRefreshFailed, 'warn');
    } finally {
      setLoadingForeignProfile(false);
    }
  }, [defaultVisibility, directory, fallbackToken, ownProfileId, ownTier, ownUid, profileDetailId, relationshipWith, reportFailure, setFeedback]);

  return { foreignGames, foreignProfileFailed, loadingForeignProfile, getGameItemById, refreshProfileDetail };
}
