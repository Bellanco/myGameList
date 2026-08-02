/**
 * ÁRBITRO DEL CANAL SOCIAL: de varios gists candidatos, cuál es el vivo.
 *
 * Por qué hay más de uno. GitHub no permite cambiar la visibilidad de un gist, así que `updateGistPrivacy`
 * CLONA el gist a un id nuevo para volverlo público (los amigos leen el canal con SU token, y para eso tiene que
 * ser público). El original queda huérfano en la cuenta. Cuando la comprobación de visibilidad fallaba por un
 * error transitorio, ese clonado se disparaba sin necesidad: de ahí los usuarios con dos ids en circulación, uno
 * en su documento de perfil y otro en sus documentos de amistad. Es la "deriva de gist" que marca el panel.
 *
 * El criterio NO es la fecha, es la visibilidad:
 *
 *   1. Un gist que NO es público no puede ser el canal vivo, porque ningún amigo puede leerlo. Descalificado,
 *      aunque sea el más reciente y aunque sea el que el dispositivo tiene configurado.
 *   2. Entre los públicos, gana el que TIENE contenido: un clon vacío recién creado no puede desbancar a un gist
 *      con las reseñas de un año. Este orden importa más que la fecha, porque el clon es siempre el más nuevo.
 *   3. A igualdad de "tiene contenido", el más recientemente actualizado: ahí es donde se está publicando hoy.
 *   4. Y como último desempate, el que más contenido tiene.
 *
 * La decisión es pura y sin E/S a propósito: la usan el panel de administración (que lee los candidatos de forma
 * anónima, sin el token del usuario) y el propio cliente del usuario (que además ve los gists secretos y los
 * abandonados de su cuenta). Las dos partes tienen que decidir IGUAL o se pisarían la una a la otra en bucle.
 */

/** Lo que se sabe de un gist candidato tras intentar leerlo. */
export interface SocialGistEvidence {
  gistId: string;
  /**
   * ¿Es legible sin autenticación? Es lo que de verdad decide, porque es lo que puede hacer un amigo.
   * `null` = no se pudo determinar (red, rate-limit anónimo de GitHub): NO se descalifica por duda.
   */
  isPublic: boolean | null;
  /** Entradas de actividad + publicaciones. 0 = gist vacío (clon recién creado, o gist que nunca se usó). */
  contentCount: number;
  /** `updatedAt` del payload, en ms. 0 si no se pudo leer. */
  updatedAt: number;
}

export interface SocialGistVerdict {
  /** Id del canal vivo, o '' si no hay ningún candidato admisible. */
  winner: string;
  /** Candidatos descartados (todos menos el ganador), para poder decir QUÉ se abandona. */
  losers: string[];
  /** Por qué ganó, para poder explicarlo en la interfaz y en los tests. */
  reason: 'unico' | 'publico' | 'con-contenido' | 'mas-reciente' | 'sin-candidatos' | 'sin-evidencia';
}

/**
 * ¿No se pudo averiguar NADA de ningún candidato? Pasa sin red, o con el rate-limit anónimo de GitHub agotado.
 * No es lo mismo que "no hay ganador": es "no puedo juzgar". El llamador debe entonces conservar su propia
 * preferencia (el cliente, el gist de su sesión; el panel, no tocar nada) en vez de aceptar un desempate
 * arbitrario, que con varios candidatos indistinguibles acabaría decidiéndose por el orden del id.
 */
function hasNoEvidence(candidates: readonly SocialGistEvidence[]): boolean {
  return candidates.every(
    (candidate) => candidate.isPublic === null && candidate.contentCount === 0 && candidate.updatedAt === 0,
  );
}

/** Un gist queda descalificado solo si se sabe con CERTEZA que no es público. La duda no descalifica. */
function isDisqualified(candidate: SocialGistEvidence): boolean {
  return candidate.isPublic === false;
}

/**
 * Elige el canal social vivo entre los candidatos. Determinista: mismos datos, misma respuesta, sin importar el
 * orden de entrada ni quién pregunte.
 */
export function pickLiveSocialGist(candidates: readonly SocialGistEvidence[]): SocialGistVerdict {
  const unique = new Map<string, SocialGistEvidence>();
  candidates.forEach((candidate) => {
    const gistId = String(candidate.gistId || '').trim();
    if (!gistId) return;
    // Si el mismo id llega dos veces (perfil y amistad coinciden), se queda la evidencia más informativa.
    const previous = unique.get(gistId);
    if (!previous || (previous.isPublic === null && candidate.isPublic !== null)) {
      unique.set(gistId, { ...candidate, gistId });
    }
  });

  const all = [...unique.values()];
  if (all.length === 0) {
    return { winner: '', losers: [], reason: 'sin-candidatos' };
  }

  const others = (winner: string) => all.map((entry) => entry.gistId).filter((id) => id !== winner);

  // Con más de un candidato y sin poder leer ninguno, no hay juicio posible: se dice, y decide el llamador.
  if (all.length > 1 && hasNoEvidence(all)) {
    return { winner: '', losers: all.map((entry) => entry.gistId), reason: 'sin-evidencia' };
  }

  // 1) Fuera los que se sabe que no son públicos. Se hace ANTES de cualquier atajo, incluido el de "hay uno
  //    solo": un gist secreto no es el canal vivo ni siendo el único candidato, porque ningún amigo lo puede
  //    leer. Devolver '' es lo correcto ahí — dice "no hay nada a lo que converger", y evita que el llamador
  //    propague a las amistades un id que no sirve. Ese caso lo arregla `updateGistPrivacy` al siguiente
  //    guardado del usuario, volviéndolo público.
  const admissible = all.filter((candidate) => !isDisqualified(candidate));
  if (admissible.length === 0) {
    return { winner: '', losers: all.map((entry) => entry.gistId), reason: 'sin-candidatos' };
  }
  if (admissible.length === 1) {
    const only = admissible[0];
    // `unico` si de verdad no había alternativa; `publico` si ganó por descarte de los secretos.
    return {
      winner: only.gistId,
      losers: others(only.gistId),
      reason: all.length === 1 ? 'unico' : 'publico',
    };
  }

  // 2) Con contenido por delante de los vacíos: el clon nuevo es vacío y siempre es el más reciente.
  const withContent = admissible.filter((candidate) => candidate.contentCount > 0);
  const pool = withContent.length > 0 ? withContent : admissible;
  const reason: SocialGistVerdict['reason'] =
    withContent.length > 0 && withContent.length < admissible.length ? 'con-contenido' : 'mas-reciente';

  // 3) y 4) Más reciente; a igualdad, el que más contenido tenga. El id ordena al final para que el resultado
  // sea estable aunque todo lo demás empate (evita que dos clientes elijan distinto y se peleen).
  const winner = [...pool].sort(
    (a, b) => b.updatedAt - a.updatedAt || b.contentCount - a.contentCount || a.gistId.localeCompare(b.gistId),
  )[0];

  return { winner: winner.gistId, losers: others(winner.gistId), reason };
}
