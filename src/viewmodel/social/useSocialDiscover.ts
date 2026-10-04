// «Perfiles»: la gente que todavía no es tu amiga, para descubrirla.
//
// Antes salía de la misma consulta que el feed (los 50 perfiles más recientes), y por tanto se pagaba en cada
// caducidad del feed, se abriera esta pantalla o no. Ahora el feed lee solo a tus amigos (`useSocialDirectory`) y
// esto hace su propia consulta, más corta y SOLO cuando hace falta: al abrir «Perfiles», las dos pantallas del
// porcentaje de logros de la comunidad, o la ficha de alguien que no está en ninguna de las dos listas.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PROFILE_TIER_DIRECTORY_TTL_MS, type ProfileTier } from '../../core/constants/tiers';
import { PROFILE_INACTIVITY_MS, SOCIAL_DISCOVER_LIMIT } from '../../core/constants/socialActivity';
import { SOCIAL_UI } from '../../core/constants/socialLabels';
import {
  getSocialProfilesByUid,
  listSocialDirectory,
  type SocialDirectoryEntry as DirectoryProfile,
} from '../../model/repository/firebaseRepository';
import type { SocialProfileVisibility } from '../../model/repository/socialGistRepository';
import type { SocialDirectoryEntry } from './socialFeed';

export interface SocialDiscoverOptions {
  /** ¿Hay en pantalla algo que necesite a los no-amigos? «Perfiles» o el porcentaje de logros de la comunidad. */
  enabled: boolean;
  /**
   * Ficha abierta que no está en ninguna lista (enlace directo a alguien que no es tu amigo ni sale entre los
   * recientes). Se lee ese perfil suelto: una lectura, no la consulta entera.
   */
  missingProfileId: string;
  authUid: string;
  ownTier: ProfileTier;
  defaultSocialVisibility: SocialProfileVisibility;
  reportFailure: (error: unknown, fallback: string, kind?: 'err' | 'warn') => void;
}

/** Entrada de quien no es tu amigo: nombre y foto de Firestore, sin actividad (de un no-amigo no se lee el gist). */
function toDiscoverEntry(profile: DirectoryProfile, visibility: SocialProfileVisibility): SocialDirectoryEntry {
  return {
    id: profile.id,
    uid: profile.uid,
    displayName: profile.displayName || SOCIAL_UI.requests.unknownUser,
    socialGistId: '',
    gamesGistId: '',
    photoURL: profile.photoURL || '',
    tier: profile.tier,
    lastActiveAt: profile.updatedAt,
    // Sin identidad: solo lo usa el porcentaje de logros de la comunidad (ver `directoryMirrors` en SocialHub).
    achievementsMirror: profile.achievementsMirror,
    yearSummarySeen: profile.yearSummarySeen,
    palmares: profile.palmares,
    activity: [],
    posts: [],
    moves: [],
    sharedLists: {},
    visibility,
  };
}

export function useSocialDiscover(options: SocialDiscoverOptions) {
  const { enabled, missingProfileId, authUid, ownTier, defaultSocialVisibility, reportFailure } = options;
  const [recent, setRecent] = useState<DirectoryProfile[]>([]);
  const [extra, setExtra] = useState<DirectoryProfile[]>([]);
  const [loading, setLoading] = useState(false);
  // `reportFailure` cambia de identidad con el hub; no es motivo para volver a consultar.
  const reportFailureRef = useRef(reportFailure);
  reportFailureRef.current = reportFailure;

  useEffect(() => {
    if (!enabled || !authUid) return;
    let cancelled = false;
    setLoading(true);
    listSocialDirectory(SOCIAL_DISCOVER_LIMIT, {
      maxAgeMs: PROFILE_TIER_DIRECTORY_TTL_MS[ownTier],
      activeWithinMs: PROFILE_INACTIVITY_MS,
    })
      .then((profiles) => {
        if (!cancelled) setRecent(profiles);
      })
      .catch((error) => {
        if (!cancelled) reportFailureRef.current(error, SOCIAL_UI.status.firestoreCheckFailed, 'warn');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, authUid, ownTier]);

  useEffect(() => {
    if (!missingProfileId || !authUid) return;
    if (recent.some((profile) => profile.id === missingProfileId)) return;
    if (extra.some((profile) => profile.id === missingProfileId)) return;
    let cancelled = false;
    getSocialProfilesByUid([missingProfileId], { maxAgeMs: PROFILE_TIER_DIRECTORY_TTL_MS[ownTier] })
      .then((profiles) => {
        if (!cancelled && profiles.length > 0) setExtra((current) => [...current, ...profiles]);
      })
      .catch(() => {
        /* Sin perfil legible la ficha se queda vacía, como cuando no estaba en el directorio. */
      });
    return () => {
      cancelled = true;
    };
  }, [missingProfileId, authUid, ownTier, recent, extra]);

  // Al cambiar de sesión no se arrastra la gente de la anterior.
  useEffect(() => {
    setRecent([]);
    setExtra([]);
  }, [authUid]);

  const discoverEntries = useMemo(() => {
    const seen = new Set<string>();
    const merged: SocialDirectoryEntry[] = [];
    for (const profile of [...recent, ...extra]) {
      if (seen.has(profile.uid)) continue;
      seen.add(profile.uid);
      merged.push(toDiscoverEntry(profile, defaultSocialVisibility));
    }
    return merged;
  }, [recent, extra, defaultSocialVisibility]);

  return { discoverEntries, discoverLoading: loading };
}
