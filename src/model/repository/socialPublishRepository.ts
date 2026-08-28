// Publicación de actividad social al guardar una reseña (M4): orquestación pura de repos, sin estado de React.
// Extraído verbatim de App.tsx para sacar la lógica de negocio del componente. Lee el gist social, inserta/actualiza
// la actividad (que se convierte a snippet index-only), reescribe el gist y asegura el perfil en Firestore.
import { deriveMoveActivity, reconcileMoveActivity } from '../../core/social/moveActivity';
import { ensureProfileByEmail, getCurrentSocialAuthUser, healOwnFriendshipIdentity, resolveStableProfileId } from './firebaseRepository';
import { getLocalMeta, invalidateCachedSocialDirectory, patchLocalMeta } from './indexedDbRepository';
import { getSyncConfig } from './gistRepository';
import { loadLocalState } from './localRepository';
import { readSocialGist, remapSocialActorIds, removeReviewActivity, saveSocialSyncConfig, syncMoveActivity, upsertPost, upsertReviewActivity, writeSocialGist, type SocialGistData } from './socialGistRepository';
import { markPendingSocialActivity } from './socialActivityReconcile';
import { resolveSocialChannel, type SocialChannel } from './socialChannel';

/**
 * Arma el canal social de este dispositivo para publicar. Devuelve null si no se puede (sin sesión de Google,
 * sin token, sin perfil publicado o gist desaparecido) y, en ese caso, deja la publicación marcada como
 * PENDIENTE: antes se salía en silencio y la reseña no volvía a intentarse jamás, así que quedaba fuera del
 * feed para siempre aunque el usuario estuviera dado de alta (p. ej. si escribía desde un dispositivo donde
 * nunca había abierto el hub social). La reconciliación consume esa marca en la próxima apertura del hub.
 */
async function armSocialChannel(email: string | null): Promise<SocialChannel | null> {
  const resolved = await resolveSocialChannel({ email });
  if (resolved.status !== 'ready') {
    await markPendingSocialActivity();
    return null;
  }
  return resolved.channel;
}

/**
 * Propaga MI gist social a mis docs de amistad cuando su id ha cambiado desde la última propagación hecha en
 * este dispositivo.
 *
 * `ensureProfileByEmail` (al final de cada publicación) actualiza el gist en el DIRECTORIO de Firestore, pero
 * no en los docs de amistad — y el lector prefiere el gist denormalizado en la amistad. Sin esto, quien cambie
 * de gist social y siga publicando sin abrir el hub deja a sus amigos leyendo un gist viejo: su actividad no
 * sale en el feed aunque su perfil se vea completo (ese sale del gist de JUEGOS).
 *
 * PRIVACIDAD: nunca escribe el nombre real de Google. Si el nick del gist aún está vacío no sanea nada (en vez
 * de pisar con vacío un nick bueno ya guardado): lo hará el hub al abrirse, que espera a tener el nick.
 * Best-effort y con sello en `meta` para no lanzar la query de amistades en cada guardado de reseña.
 */
/**
 * Foto que puede ir a un canal público (docs de amistad), con la MISMA semántica que el hub: si el usuario
 * tiene la foto desactivada en el gist, cadena vacía (propaga su opt-out); si la muestra, la del gist y, si su
 * gist es antiguo y no la lleva, la de la sesión de Google (evita pisar con vacío una foto ya guardada).
 */
function publicPhotoURL(data: { profile: { photoURL?: string; visibility?: { showPhoto?: boolean } } }, sessionPhoto: string | null): string {
  if (data.profile.visibility?.showPhoto === false) {
    return '';
  }
  return String(data.profile.photoURL || sessionPhoto || '');
}

/**
 * F4 — mete al payload que ya se iba a escribir los mensajes de lista que falten (ver `core/social/moveActivity`).
 *
 * A REBUFO, y esa es toda la idea: mover un juego de lista no pide su propia escritura contra GitHub —serían un
 * GET y un PATCH por cada «he empezado esto»—, sino que viaja gratis en la primera escritura del canal que ocurra
 * por otro motivo (una reseña, una publicación) o en la reconciliación al abrir el hub. Los mensajes son una
 * proyección idempotente de los sellos, así que da igual cuántas veces se pase por aquí y en qué orden.
 *
 * Solo ALTAS: `localUpdatedAt: 0` desactiva la retirada de huérfanos. Guardar una reseña no es el momento de
 * auditar el canal —eso lo hace la reconciliación, que sí sabe si los listados son autoridad—, pero las listas
 * OCULTAS sí se respetan aquí, porque para eso no hace falta auditar nada.
 *
 * Los listados se leen de localStorage y no se reciben por parámetro a propósito: el estado que la pantalla tiene
 * en memoria es el del render ANTERIOR al guardado, así que el sello del juego que se acaba de mover todavía no
 * está en él. `saveLocalState` es sincrónica y ya ha corrido cuando esto se ejecuta.
 */
function withMoveActivity(data: SocialGistData, timestamp: number): SocialGistData {
  try {
    const games = loadLocalState();
    const hiddenTabs = data.profile.visibility?.hiddenTabs || [];
    const target = reconcileMoveActivity({
      derived: deriveMoveActivity(games, { hiddenTabs }),
      published: data.moves || [],
      knownGameIds: new Set<number>(),
      hiddenTabs,
      localUpdatedAt: 0,
    });
    return syncMoveActivity(data, target, timestamp);
  } catch {
    // Los mensajes son un extra del payload: si los listados locales no se pueden leer, se publica lo que se
    // venía a publicar y la reconciliación los pone al día en la próxima apertura del hub.
    return data;
  }
}

async function healFriendshipGistIfChanged(input: {
  uid: string;
  socialGistId: string;
  gamesGistId: string;
  nick: string;
  photoURL: string;
}): Promise<void> {
  if (!input.uid || !input.socialGistId || !input.nick) {
    return;
  }
  try {
    const meta = await getLocalMeta();
    if (meta?.friendshipHealedForGist === input.socialGistId) {
      return;
    }
    await healOwnFriendshipIdentity(input.uid, {
      name: input.nick,
      photo: input.photoURL,
      socialGistId: input.socialGistId,
      gamesGistId: input.gamesGistId,
    });
    await patchLocalMeta({ friendshipHealedForGist: input.socialGistId });
  } catch {
    // best-effort: la publicación ya está hecha; se reintentará en la siguiente o al abrir el hub.
  }
}

/**
 * Todo lo que hace falta saber para escribir en el gist social propio, resuelto una sola vez.
 *
 * Las tres funciones que escriben —publicar una reseña, retirarla y publicar un post— repetían este preámbulo
 * entero: sesión, canal, lectura del gist, identidad pseudónima y remapeo de las entradas legacy. Eran unas
 * veinte líneas por copia, y el remapeo de identidad es justo el tipo de paso que no puede divergir entre ellas:
 * si una lo omitiera, la actividad de esa persona se partiría en dos autores dentro de su propio feed.
 */
interface SocialWriteContext {
  authUser: NonNullable<Awaited<ReturnType<typeof getCurrentSocialAuthUser>>>;
  socialConfig: NonNullable<Awaited<ReturnType<typeof armSocialChannel>>>;
  socialRead: Awaited<ReturnType<typeof readSocialGist>>;
  /** Pseudónimo estable (6.2a). La identidad pública NUNCA es el uid de Firebase. */
  profileId: string;
  /** El gist con las entradas legacy ya remapeadas a `profileId`. Es la base de comparación del no-op. */
  migratedData: SocialGistData;
  /** Nick del perfil social. PRIVACIDAD: nunca el nombre real de Google ni el correo. */
  socialNick: string;
  now: number;
}

/**
 * Abre una escritura en el gist social. Distingue los dos motivos de no poder seguir porque sus llamadores
 * reaccionan distinto: publicar una reseña lo aplaza en silencio (`markPendingSocialActivity`) y publicar un post
 * avisa al usuario, que está mirando el compositor y ha pulsado un botón.
 */
type SocialWriteGate =
  | { ok: true; ctx: SocialWriteContext }
  | { ok: false; reason: 'no-session' | 'no-channel' };

async function openSocialWrite(): Promise<SocialWriteGate> {
  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) {
    return { ok: false, reason: 'no-session' };
  }

  const socialConfig = await armSocialChannel(authUser.email);
  if (!socialConfig) {
    return { ok: false, reason: 'no-channel' };
  }

  const socialRead = await readSocialGist(socialConfig.token, socialConfig.gistId, socialConfig.etag || null);

  // 6.2b: identidad por profileId (pseudónimo estable, 6.2a) en vez del uid de Firebase. Remapea las entradas
  // legacy del gist propio (actorUid==miUid → miProfileId) antes de insertar nada, de modo que el uid sale del
  // canal público y toda nuestra actividad queda agrupada por profileId.
  const profileId = await resolveStableProfileId(authUser.uid);
  const migratedData = remapSocialActorIds(socialRead.data, { [authUser.uid]: profileId });

  return {
    ok: true,
    ctx: {
      authUser,
      socialConfig,
      socialRead,
      profileId,
      migratedData,
      socialNick: String(socialRead.data.profile.name || '').trim(),
      now: Date.now(),
    },
  };
}

/** Escribe el gist y sella la configuración local con el etag nuevo. Devuelve el etag resultante. */
async function commitSocialWrite(ctx: SocialWriteContext, nextPayload: SocialGistData): Promise<string | null> {
  const writeResult = await writeSocialGist(ctx.socialConfig.token, ctx.socialConfig.gistId, nextPayload);
  const etag = writeResult.etag || ctx.socialConfig.etag || null;

  saveSocialSyncConfig({
    token: ctx.socialConfig.token,
    gistId: ctx.socialConfig.gistId,
    etag,
    lastRemoteUpdatedAt: ctx.now,
  });

  return etag;
}

/**
 * Sincroniza la identidad pública tras publicar: el perfil de Firestore y los datos denormalizados en los
 * documentos de amistad. Va aparte del `commit` porque RETIRAR una reseña no lo necesita —no cambia quién eres—,
 * y meterlo dentro obligaría a una bandera para apagarlo en ese único caso.
 */
async function syncPublicIdentity(ctx: SocialWriteContext, etag: string | null): Promise<void> {
  const mainSyncConfig = getSyncConfig();

  await ensureProfileByEmail({
    user: ctx.authUser,
    socialGistId: ctx.socialConfig.gistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    githubToken: mainSyncConfig?.token || ctx.socialConfig.token, // audit-allow: ensureProfileByEmail lo cifra en privateConfig (B1)
    socialGistEtag: etag,
    // Si el gist no tiene nick, `ensureProfileByEmail` cae al nombre de la cuenta de Google (nunca al correo): más
    // vale un nombre razonable que un perfil sin nombre —la anomalía `no-display-name`— o un guardado abortado.
    preferredName: ctx.socialNick,
  });

  await healFriendshipGistIfChanged({
    uid: ctx.authUser.uid,
    socialGistId: ctx.socialConfig.gistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    // Mismo criterio que el perfil público: si el gist no tiene nick, el nombre de la cuenta de Google antes que
    // dejar a sus amistades con un nombre vacío en la bandeja. El correo, nunca.
    nick: ctx.socialNick || String(ctx.authUser.displayName || '').trim(),
    photoURL: publicPhotoURL(ctx.socialRead.data, ctx.authUser.photoURL),
  });
}

/** Publica/actualiza la actividad social de una reseña. Sin canal social utilizable la deja como pendiente. */
export async function publishReviewActivity(input: { id: number; name: string; review: string; score: number; grade?: number | null; reviewChanged?: boolean }): Promise<void> {
  const gate = await openSocialWrite();
  if (!gate.ok) {
    // Sin sesión se aplaza en silencio; sin canal no hay nada que aplazar (el hub lo resolverá al abrirse).
    if (gate.reason === 'no-session') {
      await markPendingSocialActivity();
    }
    return;
  }
  const { ctx } = gate;

  const withReview = upsertReviewActivity(ctx.migratedData, {
    actorProfileId: ctx.profileId,
    actorName: ctx.socialNick,
    gameId: input.id,
    gameName: input.name,
    reviewText: input.review, // audit-allow: upsertReviewActivity lo convierte a snippet (no se publica el review completo)
    rating: input.score,
    grade: input.grade ?? null, // nota fina 0–100 (aditiva; el espejo 0–5 va en rating)
    timestamp: ctx.now,
    // Solo se recoloca al principio del feed si cambió el texto de la reseña. Editar solo nota/nombre sincroniza
    // esos datos en la tarjeta social pero conserva la posición/fecha original (no cuenta como reseña nueva).
    bumpOrder: input.reviewChanged ?? true,
  });

  // F4: los mensajes de lista pendientes viajan en esta misma escritura (no piden la suya).
  const nextPayload = withMoveActivity(withReview, ctx.now);

  // Sincronización de solo nota/nombre sobre una reseña que aún no estaba publicada: no hay nada que sincronizar
  // ni que publicar, así que no se reescribe el gist (mismo patrón de no-op que unpublishReviewActivity). La
  // comparación es contra `migratedData` —no contra `withReview`— para que un mensaje de lista nuevo cuente como
  // motivo suficiente para escribir aunque la reseña no haya cambiado nada.
  if (nextPayload === ctx.migratedData) {
    return;
  }

  const etag = await commitSocialWrite(ctx, nextPayload);

  // El feed sirve `gameName` desde la caché IndexedDB del directorio (TTL 30 min), una capa por delante de la caché
  // de sesión del gist. Sin invalidarla, tras publicar/renombrar una reseña el propio autor seguiría viendo el
  // título viejo en su feed hasta 30 min. La invalidamos para que el próximo montaje del hub relea el directorio.
  await invalidateCachedSocialDirectory(ctx.socialConfig.gistId);

  await syncPublicIdentity(ctx, etag);
}

/**
 * Despublica del gist social la reseña de un juego. Pensado para reseñas HUÉRFANAS: el dueño abre una reseña que
 * ya no tiene contraparte en sus listados privados (juego borrado/perdido) y se ve vacía; se retira del feed.
 * No-op sin sesión Google ni gist social configurado; NO reescribe el gist si no había nada que quitar.
 */
export async function unpublishReviewActivity(input: { id: number }): Promise<void> {
  const gate = await openSocialWrite();
  if (!gate.ok) {
    if (gate.reason === 'no-session') {
      await markPendingSocialActivity();
    }
    return;
  }
  const { ctx } = gate;

  const nextPayload = removeReviewActivity(ctx.migratedData, {
    actorProfileId: ctx.profileId,
    gameId: input.id,
    timestamp: ctx.now,
  });
  if (nextPayload === ctx.migratedData) {
    return; // no había reseña que despublicar
  }

  await commitSocialWrite(ctx, nextPayload);

  // Igual que al publicar: invalida la caché del directorio para que el feed no siga mostrando la reseña retirada.
  await invalidateCachedSocialDirectory(ctx.socialConfig.gistId);

  // NO se sincroniza la identidad pública: retirar una reseña no cambia quién eres ni el gist al que apuntan tus
  // amistades, así que `syncPublicIdentity` sería una escritura en Firestore sin nada que escribir.
}

/**
 * F3 — Publica una publicación de texto libre (noticias/enlaces) en el gist social propio. Mismo flujo que la
 * reseña: lee el gist, remapea identidad legacy, inserta el post, reescribe y asegura el perfil. No-op sin sesión
 * Google ni gist social configurado. Los hipervínculos se derivan del texto al renderizar (no se publican como HTML).
 */
export async function publishPost(input: { text: string; maxLength?: number }): Promise<void> {
  const gate = await openSocialWrite();
  if (!gate.ok) {
    // Aquí SÍ se lanza: al usuario le acaba de fallar un botón que pulsó, y el compositor conserva su texto.
    throw new Error(
      gate.reason === 'no-session'
        ? 'Inicia sesión con Google para publicar'
        : 'No se pudo resolver tu canal social en este dispositivo',
    );
  }
  const { ctx } = gate;

  const nextPayload = withMoveActivity(
    upsertPost(ctx.migratedData, {
      authorProfileId: ctx.profileId,
      authorName: ctx.socialNick,
      text: input.text,
      // Cupo del rango de quien publica: lo decide el llamador, que es quien conoce la sesión.
      maxLength: input.maxLength,
      timestamp: ctx.now,
    }),
    ctx.now, // F4: los mensajes de lista pendientes se suben con la publicación, sin escritura propia.
  );

  const etag = await commitSocialWrite(ctx, nextPayload);

  // SIN `invalidateCachedSocialDirectory`, a diferencia de los dos de arriba: quien publica un post refresca el
  // feed acto seguido con `hydrateSocialDirectory(true)` (ver `useSocialCompose`), y un refresco forzado se salta
  // la caché de todas formas. Añadir aquí la invalidación sería una escritura en IndexedDB que nadie leería.
  await syncPublicIdentity(ctx, etag);
}
