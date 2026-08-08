// Estado EDITABLE del perfil social propio: el nick y las cinco opciones de visibilidad que deciden qué se
// comparte. Es lo que pinta el editor de perfil y lo que se escribe en el gist.
//
// Sale de `useSocialViewModel` porque esos seis campos viajan SIEMPRE juntos y aun así se reconstruían campo a
// campo en seis sitios (el valor por defecto, las dos rutas de hidratación —caché y gist—, el guardado y el
// sembrado de la caché). En la hidratación desde el gist se normalizaban además dos veces seguidas, con las
// mismas expresiones copiadas. Aquí eso se escribe una vez.
import { useCallback, useMemo, useState } from 'react';
import type { SocialProfileVisibility } from '../../model/repository/socialGistRepository';
import type { TabId } from '../../model/types/game';

/**
 * Pestañas ocultas sin repeticiones y en el orden en que se marcaron. Pura y a nivel de módulo: estaba envuelta
 * en un `useCallback(…, [])` dentro del ViewModel, que para una función sin capturas solo añade ruido.
 *
 * Comprueba que sea una LISTA, y no solo que exista. El código anterior hacía `hiddenTabs || []`, que da por bueno
 * cualquier valor truthy: un `hiddenTabs: "c"` —un gist editado a mano, un formato antiguo— pasaba el filtro y
 * reventaba en el `forEach`, tumbando la hidratación del perfil. Hoy el lector del gist ya sanea antes de llegar
 * aquí, pero esta función es ahora el único normalizador de los dos caminos (gist y caché) y no puede depender de
 * que alguien haya limpiado antes.
 */
export function getOrderedUniqueTabs(tabs: TabId[] | unknown): TabId[] {
  if (!Array.isArray(tabs)) {
    return [];
  }

  const seen = new Set<TabId>();
  const ordered: TabId[] = [];

  tabs.forEach((tab) => {
    if (seen.has(tab)) {
      return;
    }

    seen.add(tab);
    ordered.push(tab);
  });

  return ordered;
}

/** Perfil sin opciones marcadas: nada oculto y foto visible. */
export const DEFAULT_SOCIAL_VISIBILITY: SocialProfileVisibility = {
  hiddenTabs: [],
  hideReplayable: false,
  hideRetry: false,
  hideGameTime: false,
  showPhoto: true,
};

export interface SocialProfileForm {
  profileName: string;
  setProfileName: (name: string) => void;
  hiddenTabs: TabId[];
  setHiddenTabs: (tabs: TabId[]) => void;
  showPhoto: boolean;
  setShowPhoto: (on: boolean) => void;
  hideReplayable: boolean;
  setHideReplayable: (on: boolean) => void;
  hideRetry: boolean;
  setHideRetry: (on: boolean) => void;
  hideGameTime: boolean;
  setHideGameTime: (on: boolean) => void;
  /** Las cinco opciones como el objeto que se escribe en el gist y en la caché. */
  visibility: SocialProfileVisibility;
  /** Vuelca un perfil ya leído (de la caché o del gist) al formulario, normalizando de paso. */
  hydrate: (profile: { name: string; visibility?: Partial<SocialProfileVisibility> | null }) => void;
}

/**
 * Normaliza una visibilidad venida de fuera. Los valores llegan de un JSON ajeno al control del código (el gist,
 * que el usuario puede editar a mano), así que cada campo se fuerza a booleano y las pestañas se ordenan y
 * deduplican. `showPhoto` es el único que va por defecto a `true`: su ausencia significa "no lo he tocado".
 */
export function normalizeVisibility(value: Partial<SocialProfileVisibility> | null | undefined): SocialProfileVisibility {
  return {
    hiddenTabs: getOrderedUniqueTabs(value?.hiddenTabs || []),
    hideReplayable: Boolean(value?.hideReplayable),
    hideRetry: Boolean(value?.hideRetry),
    hideGameTime: Boolean(value?.hideGameTime),
    showPhoto: value?.showPhoto !== false,
  };
}

export function useSocialProfileForm(): SocialProfileForm {
  const [profileName, setProfileName] = useState('');
  const [hiddenTabs, setHiddenTabs] = useState<TabId[]>([]);
  const [showPhoto, setShowPhoto] = useState(true);
  const [hideReplayable, setHideReplayable] = useState(false);
  const [hideRetry, setHideRetry] = useState(false);
  const [hideGameTime, setHideGameTime] = useState(false);

  const visibility = useMemo<SocialProfileVisibility>(() => ({
    hiddenTabs: getOrderedUniqueTabs(hiddenTabs),
    hideReplayable,
    hideRetry,
    hideGameTime,
    showPhoto,
  }), [hiddenTabs, hideReplayable, hideRetry, hideGameTime, showPhoto]);

  const hydrate = useCallback((profile: { name: string; visibility?: Partial<SocialProfileVisibility> | null }) => {
    const next = normalizeVisibility(profile.visibility);
    setProfileName(profile.name);
    setHiddenTabs(next.hiddenTabs);
    setHideReplayable(next.hideReplayable);
    setHideRetry(next.hideRetry);
    setHideGameTime(next.hideGameTime);
    setShowPhoto(next.showPhoto);
  }, []);

  return {
    profileName,
    setProfileName,
    hiddenTabs,
    setHiddenTabs,
    showPhoto,
    setShowPhoto,
    hideReplayable,
    setHideReplayable,
    hideRetry,
    setHideRetry,
    hideGameTime,
    setHideGameTime,
    visibility,
    hydrate,
  };
}
