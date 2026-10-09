// Entrada de la maqueta del hub social: los estilos de la app y las pantallas REALES del hub, con el MISMO marco
// que les pone la aplicación (`<main class="main main-social">` dentro de `#root`, y cada pantalla con su
// `section.hub-hub.hub-screen` propia). Ver `social.html` para los parámetros de la URL.
//
// Los datos son inventados y no hay red: ni Firebase, ni GitHub, ni carátulas (la preferencia de carátulas viene
// apagada de fábrica y además se pasa `coversAllowed={false}`), ni fotos (todos los avatares caen a la silueta).
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../src/styles/index.scss';
import '../../src/styles/social.scss';
import { IconSprite } from '../../src/view/components/IconSprite';
import { IconSpriteRest } from '../../src/view/components/IconSpriteRest';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { parsePaletteId } from '../../src/core/constants/palettes';
import { loadPaletteSkin } from '../../src/view/hooks/paletteSkin';
import { useSocialFeed } from '../../src/viewmodel/social/socialFeed';
import type {
  SocialActivityFeedItem,
  SocialMoveFeedItem,
  SocialPostFeedItem,
} from '../../src/viewmodel/social/socialFeed';
import { SocialFeedScreen } from '../../src/view/components/socialhub/SocialFeedScreen';
import { SocialProfilesScreen } from '../../src/view/components/socialhub/SocialProfilesScreen';
import { SocialProfileDetailScreen } from '../../src/view/components/socialhub/SocialProfileDetailScreen';
import { SocialDetailScreen } from '../../src/view/components/socialhub/SocialDetailScreen';
import { SocialProfileReviewScreen } from '../../src/view/components/socialhub/SocialProfileReviewScreen';
import { RelatedReviews } from '../../src/view/components/socialhub/RelatedReviews';
import { SocialRequestsScreen } from '../../src/view/components/socialhub/SocialRequestsScreen';
import { SocialProfileScreen } from '../../src/view/components/socialhub/SocialProfileScreen';
import { ProfileAchievementsScreen, ProfileGlobalAchievements } from '../../src/view/components/socialhub/ProfileAchievements';
import type { ProfilePostEntry } from '../../src/view/components/socialhub/ProfilePostsList';
import { summaryYear } from '../../src/core/stats/summaryYear';
import { packAchievements } from '../../src/core/achievements/pack';
import { LADDERS } from '../../src/core/achievements/catalog';
import type { AchievementState } from '../../src/core/achievements/types';
import type { ProfileTier } from '../../src/core/constants/tiers';
import type { RelationshipState, SocialSharedGame } from '../../src/model/types/social';
import type { GameItem, TabId } from '../../src/model/types/game';
import type { RelatedReview } from '../../src/core/social/relatedReviews';

// ─── Tema ────────────────────────────────────────────────────────────────────────────────────────────────────
// Los atributos de `<html>` ya los ha puesto el script de `social.html` antes del primer pintado; aquí solo se
// pide el skin perezoso de la paleta, igual que hace `palettePreference.applyToDom` en la app.
loadPaletteSkin(parsePaletteId(document.documentElement.dataset.palette));

const params = new URLSearchParams(window.location.search);
const pantalla = params.get('pantalla') || 'feed';
const vista = params.get('vista') || '';

const noop = () => {};
const avisar = (que: string) => () => window.alert(`En la app: ${que}`);

// ─── Tiempo ──────────────────────────────────────────────────────────────────────────────────────────────────
// Relativo a HOY y a horas fijas: así las cabeceras de día y los logros «recientes» (tope de 30 días) salen
// siempre con la misma forma, se abra la maqueta el día que se abra.
function hace(dias: number, hora: number, minuto: number): number {
  const d = new Date();
  d.setHours(hora, minuto, 0, 0);
  d.setDate(d.getDate() - dias);
  return d.getTime();
}

// ─── Personas ────────────────────────────────────────────────────────────────────────────────────────────────
interface Persona {
  id: string;
  uid: string;
  gist: string;
  actor: string;
  displayName: string;
  tier: ProfileTier;
  lastActiveAt: number;
  relacion: RelationshipState;
}

function persona(n: number, displayName: string, tier: ProfileTier, relacion: RelationshipState, diasSinEntrar: number): Persona {
  const hex = n.toString(16).padStart(4, '0');
  return {
    id: `uid-maqueta-${n}`,
    uid: `uid-maqueta-${n}`,
    gist: `aaaabbbbcccc${hex}`,
    actor: `actor-maqueta-${n}`,
    displayName,
    tier,
    lastActiveAt: hace(diasSinEntrar, 12, 0),
    relacion,
  };
}

const MARTA = persona(1, 'Marta', 'gold', 'friends', 0);
const IVAN = persona(2, 'Iván', 'mithril', 'friends', 0);
const LUCIA = persona(3, 'Lucía R.', 'silver', 'friends', 1);
const NACHO = persona(4, 'Nacho', 'silver', 'friends', 2);
const PAULA = persona(5, 'Paula G.', 'bronze', 'friends', 4);
const SERGIO = persona(6, 'Sergio', 'silver', 'outgoing', 3);
const CARMEN = persona(7, 'Carmen', 'gold', 'incoming', 1);
const ALEX = persona(8, 'Álex M.', 'bronze', 'incoming', 6);
const BEA = persona(9, 'Bea', 'silver', 'none', 9);
const TOMAS = persona(10, 'Tomás', 'bronze', 'none', 15);

const GENTE = [MARTA, IVAN, LUCIA, NACHO, PAULA, SERGIO, CARMEN, ALEX, BEA, TOMAS];
const YO_GIST = 'aaaabbbbccccffff';
/** Tú, solo para el feed: lo tuyo va al otro lado del chat (`is-own-activity`), y sin ello no se veía. Su gist es
    `YO_GIST` porque es lo que el feed compara para decidir qué es propio. */
const YO = persona(0xffff, 'Yo', 'gold', 'none', 0);

// ─── Juegos ──────────────────────────────────────────────────────────────────────────────────────────────────
const JUEGOS: Record<string, { id: number; platforms: string[]; genres: string[] }> = {
  'Hollow Knight': { id: 101, platforms: ['Switch'], genres: ['Metroidvania', 'Acción'] },
  Hades: { id: 102, platforms: ['PC', 'Switch'], genres: ['Roguelike', 'Acción'] },
  Celeste: { id: 103, platforms: ['PC'], genres: ['Plataformas'] },
  'Disco Elysium': { id: 104, platforms: ['PC'], genres: ['RPG', 'Narrativo'] },
  'Outer Wilds': { id: 105, platforms: ['PS5'], genres: ['Aventura', 'Exploración'] },
  'Return of the Obra Dinn': { id: 106, platforms: ['PC'], genres: ['Puzles', 'Investigación'] },
  'Elden Ring': { id: 107, platforms: ['PS5'], genres: ['RPG', 'Acción'] },
  'The Witcher 3': { id: 108, platforms: ['PC', 'PS5'], genres: ['RPG', 'Mundo abierto'] },
  'Portal 2': { id: 109, platforms: ['PC'], genres: ['Puzles'] },
  'Slay the Spire': { id: 110, platforms: ['PC', 'Steam Deck'], genres: ['Roguelike', 'Cartas'] },
  'Stardew Valley': { id: 111, platforms: ['Switch'], genres: ['Simulación', 'Granjas'] },
  Pentiment: { id: 112, platforms: ['Xbox Series'], genres: ['Narrativo', 'Aventura'] },
  Tunic: { id: 113, platforms: ['PC'], genres: ['Acción', 'Aventura'] },
  'Hi-Fi Rush': { id: 114, platforms: ['PC'], genres: ['Acción', 'Ritmo'] },
  'Chained Echoes': { id: 115, platforms: ['Switch'], genres: ['RPG', 'JRPG'] },
};

// ─── Actividad del feed ──────────────────────────────────────────────────────────────────────────────────────
function autor(p: Persona) {
  return { profileId: p.id, profileDisplayName: p.displayName, socialGistId: p.gist, photoURL: '' };
}

function resena(p: Persona, gameName: string, grade: number, snippet: string, updatedAt: number): SocialActivityFeedItem {
  const gameId = JUEGOS[gameName].id;
  return {
    id: `${p.actor}:${gameId}`,
    key: `${p.actor}:${gameId}`,
    type: 'review',
    actorProfileId: p.actor,
    actorName: p.displayName,
    gameId,
    gameName,
    rating: Math.round(grade / 20),
    grade,
    recommendationText: '',
    snippet,
    createdAt: updatedAt,
    updatedAt,
    ...autor(p),
  };
}

function movimiento(p: Persona, gameName: string, tab: TabId, at: number, conResena = false): SocialMoveFeedItem {
  const gameId = JUEGOS[gameName].id;
  return {
    id: `${gameId}:${tab}`,
    gameId,
    gameName,
    tab,
    at,
    updatedAt: at,
    ...(conResena ? { reviewActorId: p.actor } : {}),
    ...autor(p),
  };
}

function publicacion(p: Persona, text: string, updatedAt: number): SocialPostFeedItem {
  return { id: `post-${p.actor}-${updatedAt}`, authorProfileId: p.actor, authorName: p.displayName, text, createdAt: updatedAt, updatedAt, ...autor(p) };
}

const ACTIVIDAD: Record<string, SocialActivityFeedItem[]> = {
  [MARTA.id]: [
    resena(MARTA, 'Outer Wilds', 96, 'No recuerdo la última vez que un juego me dejó así. Todo lo que necesitas ya está en el sistema solar desde el minuto uno; lo único que cambia eres tú.', hace(0, 11, 24)),
    resena(MARTA, 'Return of the Obra Dinn', 90, 'Un cuaderno, un reloj y sesenta muertes que ordenar. Deducir el destino de cada tripulante es de lo más satisfactorio que he jugado en años.', hace(6, 22, 5)),
  ],
  [IVAN.id]: [
    resena(IVAN, 'Disco Elysium', 100, 'La mejor escritura que he visto en un videojuego. Fracasar una tirada es a menudo más interesante que acertarla, y eso lo cambia todo.', hace(3, 23, 48)),
  ],
  [LUCIA.id]: [
    resena(LUCIA, 'Tunic', 84, 'El manual escondido es una genialidad: vas encontrando páginas y el mundo entero se reordena. El combate pide más de lo que aparenta.', hace(1, 19, 2)),
  ],
  [NACHO.id]: [
    resena(NACHO, 'Hi-Fi Rush', 0, 'Lo he dejado sin nota porque lo jugué en fácil, pero qué ritmo: todo el escenario baila contigo. Ideal para una tarde tonta.', hace(3, 17, 30)),
  ],
  [PAULA.id]: [],
};

const MOVIMIENTOS: Record<string, SocialMoveFeedItem[]> = {
  [MARTA.id]: [movimiento(MARTA, 'Chained Echoes', 'p', hace(1, 10, 12))],
  [IVAN.id]: [movimiento(IVAN, 'Pentiment', 'e', hace(0, 9, 41)), movimiento(IVAN, 'Celeste', 'c', hace(6, 18, 20))],
  [LUCIA.id]: [movimiento(LUCIA, 'Tunic', 'c', hace(1, 18, 55), true)],
  [NACHO.id]: [],
  [PAULA.id]: [movimiento(PAULA, 'Slay the Spire', 'v', hace(1, 13, 7)), movimiento(PAULA, 'Stardew Valley', 'c', hace(3, 21, 16))],
};

const PUBLICACIONES: Record<string, SocialPostFeedItem[]> = {
  [NACHO.id]: [publicacion(NACHO, '¿Alguien más se ha quedado atascado en el último jefe de Hollow Knight? Llevo tres tardes y ya me sé su baile de memoria.', hace(0, 8, 3))],
};

// ─── Logros ──────────────────────────────────────────────────────────────────────────────────────────────────
/** Los escalones bajos de cada escalera, con fechas: los primeros, de ayer (salen en el feed); el resto, viejos. */
function espejo(parte: number, recientes: number): string {
  const estados: AchievementState[] = LADDERS.flatMap((ladder) => ladder.steps
    .filter((_step, index) => index < Math.round(ladder.steps.length * parte))
    .map((step) => ({ id: `${ladder.key}-${step}`, level: 1, value: 0, next: null, unlockedAt: hace(60, 12, 0) })));
  estados.slice(0, recientes).forEach((estado) => { estado.unlockedAt = hace(1, 20, 15); });
  return packAchievements(estados);
}

const ESPEJOS: Record<string, string> = {
  [LUCIA.id]: espejo(0.3, 2),
  [MARTA.id]: espejo(0.45, 0),
};

const AMIGOS = new Set(GENTE.filter((p) => p.relacion === 'friends').map((p) => p.uid));

const DIRECTORIO = GENTE.filter((p) => p.relacion === 'friends').map((p) => ({
  id: p.id,
  uid: p.uid,
  displayName: p.displayName,
  photoURL: '',
  achievementsMirror: ESPEJOS[p.id] || '',
  activity: ACTIVIDAD[p.id] || [],
  posts: PUBLICACIONES[p.id] || [],
  moves: MOVIMIENTOS[p.id] || [],
}));
const MI_ACTIVIDAD = {
  id: YO.id,
  uid: YO.uid,
  displayName: YO.displayName,
  photoURL: '',
  achievementsMirror: '',
  activity: [resena(YO, 'Hades', 92, 'Cada intento fallido te cuenta algo más de la familia. Nunca un bucle de muerte había tenido tanta historia detrás.', hace(1, 22, 40))],
  posts: [publicacion(YO, 'Este finde, maratón de Hades con quien se apunte. Traed snacks.', hace(0, 10, 2))],
  moves: [movimiento(YO, 'Hades', 'c', hace(1, 22, 30))],
};


// ─── Pantallas ───────────────────────────────────────────────────────────────────────────────────────────────
function Feed({ vacio = false }: { vacio?: boolean }) {
  // El MISMO derivado que usa el hub: mezcla, orden, cupo de movimientos y agrupado por día con sus cabeceras.
  // `vacio`: quien acaba de entrar y aún no tiene amigos (el estado vacío con «Descubrir amigos»).
  const { feedItems, groupedFeedItems, hasMoreFeed, showMoreFeed } = useSocialFeed(vacio ? [] : [...DIRECTORIO, MI_ACTIVIDAD], undefined, vacio ? new Set<string>() : AMIGOS);
  return (
    <SocialFeedScreen
      SOCIAL_UI={SOCIAL_UI}
      socialDisplayName="Yo"
      ownVisiblePhotoURL=""
      currentSocialGistId={YO_GIST}
      loadingDirectory={false}
      openProfileDetail={avisar('abriría la ficha')}
      openProfileAchievements={avisar('abriría sus logros')}
      openProfileSummary={avisar('abriría su resumen del año')}
      onOpenProfiles={avisar('abriría Perfiles')}
      onOpenOwnProfile={avisar('abriría tu ficha')}
      onOpenRequests={avisar('abriría la bandeja')}
      pendingIncomingCount={vacio ? 0 : 2}
      groupedFeedItems={groupedFeedItems}
      feedItems={feedItems}
      hasMoreFeed={hasMoreFeed}
      showMoreFeed={showMoreFeed}
      openActivityDetail={avisar('abriría la reseña')}
      openMoveReview={avisar('abriría la reseña')}
      handleActivityItemKeyDown={noop}
      publishingPost={false}
      handlePublishPost={async () => false}
      canPublishPosts
      postMaxLength={500}
      showPostCounter
      status=""
      statusKind=""
      offline={false}
      offlineHasCachedData={false}
    />
  );
}

const RELACION = new Map(GENTE.map((p) => [p.uid, p.relacion]));

function Amigos() {
  const [busqueda, setBusqueda] = useState('');
  const directorio = useMemo(
    () => GENTE
      .filter((p) => p.displayName.toLowerCase().includes(busqueda.trim().toLowerCase()))
      .map((p) => ({ id: p.id, uid: p.uid, displayName: p.displayName, photoURL: '', tier: p.tier, lastActiveAt: p.lastActiveAt })),
    [busqueda],
  );
  const relationshipWith = useCallback((uid: string) => RELACION.get(uid) || 'none', []);
  return (
    <SocialProfilesScreen
      SOCIAL_UI={SOCIAL_UI}
      profileSearch={busqueda}
      setProfileSearch={setBusqueda}
      filteredSocialDirectory={directorio}
      loadingDirectory={false}
      openProfileDetail={avisar('abriría la ficha')}
      handleProfileCardKeyDown={noop}
      relationshipWith={relationshipWith}
      friendshipBusyUid=""
      onAddOrAcceptFriend={avisar('enviaría o aceptaría la petición')}
      onCancelFriendRequest={avisar('retiraría la petición')}
      onBack={avisar('volvería al feed')}
      status=""
      statusKind=""
    />
  );
}

/** Un juego tal y como llega de un perfil AJENO: la proyección pública del canal (sin reseña completa). */
function compartido(gameName: string, grade: number, snippet = '', years: number[] = []): SocialSharedGame {
  const juego = JUEGOS[gameName];
  return { id: juego.id, name: gameName, platforms: juego.platforms, genres: juego.genres, rating: Math.round(grade / 20), grade, snippet, years };
}

/**
 * Un completado con FECHA, como lo trae una amistad: es lo que necesita el resumen del año (`_ts` dentro del año que
 * se resume, ver `summaryYear`). Sin fecha, el perfil no ofrece resumen.
 */
const ANIO = summaryYear();
function terminado(gameName: string, grade: number, mes: number, snippet = ''): GameItem {
  const juego = JUEGOS[gameName];
  return {
    id: juego.id, _ts: new Date(ANIO, mes, 12, 21, 0).getTime(), name: gameName, platforms: juego.platforms, genres: juego.genres,
    steamDeck: false, review: snippet, score: Math.round(grade / 20), grade, years: [ANIO], reasons: [], replayable: false, retry: false,
  } as GameItem;
}

const LISTAS_DE_MARTA: Partial<Record<TabId, Array<GameItem | SocialSharedGame>>> = {
  c: [
    terminado('Elden Ring', 84, 1, 'Me costó entrar, pero cuando hizo clic no pude parar.'),
    terminado('Hi-Fi Rush', 80, 3),
    terminado('Tunic', 88, 5, 'El manual escondido es una genialidad.'),
    terminado('Pentiment', 90, 8),
    terminado('Slay the Spire', 76, 10),
    compartido('Outer Wilds', 96, ACTIVIDAD[MARTA.id][0].snippet, [2026]),
    compartido('Return of the Obra Dinn', 90, ACTIVIDAD[MARTA.id][1].snippet, [2026]),
    compartido('Hollow Knight', 92, 'Precioso, enorme y cruel en la justa medida. El mapa que compras a trozos es de lo mejor del género.', [2024]),
    compartido('Hades', 88, '', [2023, 2025]),
    compartido('Celeste', 94, 'Cada muerte enseña algo. Y la historia sobre la ansiedad está contada con muchísimo tacto.', [2022]),
    compartido('Portal 2', 90, '', [2021]),
    compartido('The Witcher 3', 86, '', [2020]),
    compartido('Stardew Valley', 78, '', [2023]),
  ],
  v: [compartido('Chained Echoes', 70, 'Lo dejé a mitad. Me gusta, pero el ritmo del segundo acto se me hizo largo.')],
  e: [compartido('Disco Elysium', 0)],
  p: [compartido('Portal 2', 0), compartido('Celeste', 0)],
};

const MIS_PUBLICACIONES: ProfilePostEntry[] = [
  { id: 'post-yo-1', text: 'Esta semana toca terminar Pentiment. ¿Alguien lo ha jugado en español? La tipografía cambia con cada personaje.', updatedAt: hace(0, 9, 30) },
  { id: 'post-yo-2', text: 'Recomendación rápida: Hi-Fi Rush es el juego perfecto para una tarde de domingo.', updatedAt: hace(4, 18, 5), editedAt: hace(3, 10, 0) },
];

/**
 * La ficha de un perfil. `propio`: la TUYA (con «Editar perfil» y tus publicaciones editables); si no, la de Marta,
 * amiga. `vista`: `resenas` o `publicaciones` (sub-rutas de la app); `abrir`: `estadisticas` o `resumen`, que en la
 * app son estado de la pantalla y aquí se abren solos al montar.
 */
function Perfil({ propio = false }: { propio?: boolean }) {
  const abrir = params.get('abrir') || '';
  useEffect(() => {
    if (abrir !== 'estadisticas') return;
    // Las estadísticas son un estado interno de la pantalla (no hay ruta): se pulsa su botón, como haría alguien.
    // Se busca por su icono, que no cambia con el idioma ni con el rótulo («Estadísticas» / «Volver al perfil»).
    const boton = document.querySelector('.btn [href="#icon-bottom-stats"]')?.closest('button');
    boton?.click();
  }, [abrir]);
  return (
    <SocialProfileDetailScreen
      SOCIAL_UI={SOCIAL_UI}
      activeProfileDetail={{
        displayName: propio ? 'Yo' : MARTA.displayName,
        photoURL: '',
        tier: propio ? 'gold' : MARTA.tier,
        visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: true },
        sharedLists: LISTAS_DE_MARTA,
        activity: ACTIVIDAD[MARTA.id].map((a) => ({ type: a.type, gameId: a.gameId, updatedAt: a.updatedAt })),
        posts: propio ? MIS_PUBLICACIONES : [],
      }}
      isOwnProfile={propio}
      onEditProfile={propio ? avisar('abriría los ajustes de tu perfil (?pantalla=ajustes)') : undefined}
      onBack={avisar('volvería al feed')}
      showReviews={vista === 'resenas'}
      showPosts={vista === 'publicaciones'}
      onTogglePosts={avisar('cambiaría a tus publicaciones (?vista=publicaciones)')}
      canEditPosts
      postMaxLength={500}
      showPostCounter
      onEditPost={propio ? async () => true : undefined}
      onDeletePost={propio ? async () => true : undefined}
      achievementsMirror={ESPEJOS[MARTA.id]}
      palmares={[]}
      onOpenAchievements={avisar('abriría los logros (?pantalla=logros)')}
      onToggleReviews={avisar('cambiaría a la vista de reseñas (?vista=resenas)')}
      onOpenReview={avisar('abriría la reseña')}
      status=""
      statusKind=""
      onAddGame={() => 'added'}
      addTarget="p"
      gameListOf={() => null}
      moveGameToCurrentByName={noop}
      friendshipState={propio ? 'none' : 'friends'}
      friendshipBusy={false}
      onAddOrAcceptFriend={noop}
      onCancelFriendRequest={noop}
      onRemoveFriend={avisar('pediría confirmación para dejar de ser amigos')}
      viewerTier="gold"
      viewerHiddenTabs={[]}
      viewerCompleted={[]}
      openSummaryOnMount={abrir === 'resumen'}
    />
  );
}

/** Los ajustes de TU perfil social: nombre, qué se comparte, la foto y la salida. */
function Ajustes() {
  const [nombre, setNombre] = useState('Yo');
  const [ocultas, setOcultas] = useState<TabId[]>(['d']);
  const [rejugar, setRejugar] = useState(false);
  const [reintentar, setReintentar] = useState(true);
  const [tiempo, setTiempo] = useState(false);
  const [foto, setFoto] = useState(true);
  // Lo de arriba es «lo guardado»: cualquier diferencia enciende el aviso de cambios sin guardar.
  const sinGuardar = nombre !== 'Yo' || ocultas.join() !== 'd' || rejugar || !reintentar || tiempo;
  return (
    <SocialProfileScreen
      hasUnsavedChanges={sinGuardar}
      SOCIAL_UI={SOCIAL_UI}
      profileName={nombre}
      setProfileName={setNombre}
      completedGames={[{ id: 101, name: 'Hollow Knight' }]}
      hydratingProfile={false}
      savingProfile={false}
      hasCreatedProfile
      onSaveProfile={avisar('guardaría el perfil')}
      onSignOut={avisar('cerraría la sesión')}
      onBack={avisar('volvería al feed')}
      status=""
      statusKind=""
      hiddenTabs={ocultas}
      onHiddenTabsChange={setOcultas}
      hideReplayable={rejugar}
      setHideReplayable={setRejugar}
      hideRetry={reintentar}
      setHideRetry={setReintentar}
      hideGameTime={tiempo}
      setHideGameTime={setTiempo}
      showPhoto={foto}
      setShowPhoto={setFoto}
      ownPhotoURL=""
      ownVisiblePhotoURL=""
      ownPhotoIsGeneric={false}
    />
  );
}

/** Los logros de Marta (su vitrina) y, con `global`, la vista de rareza entre todos. */
function Logros({ global = false }: { global?: boolean }) {
  const espejos = Object.values(ESPEJOS);
  return global ? (
    <ProfileGlobalAchievements
      mirror={ESPEJOS[MARTA.id]}
      directoryMirrors={espejos}
      owner={MARTA.displayName}
      self={false}
      onBack={avisar('volvería a su ficha')}
      onToggleGlobals={avisar('volvería a sus logros (?pantalla=logros)')}
      globalsBackLabel={`Logros de ${MARTA.displayName}`}
    />
  ) : (
    <ProfileAchievementsScreen
      mirror={ESPEJOS[MARTA.id]}
      directoryMirrors={espejos}
      owner={MARTA.displayName}
      onBack={avisar('volvería a su ficha')}
      onToggleGlobals={avisar('abriría la vista global (?pantalla=globales)')}
      globalsBackLabel={`Logros de ${MARTA.displayName}`}
    />
  );
}

const RESENA_LARGA = [
  'La mejor escritura que he visto en un videojuego. Empiezas sin recordar ni tu nombre, en una habitación de hotel destrozada, y a partir de ahí todo es conversación: con los vecinos, con tu compañero y, sobre todo, con las veinticuatro voces de tu propia cabeza.',
  'Lo que lo hace único es que fracasar una tirada es a menudo más interesante que acertarla. El juego nunca te castiga por equivocarte: te abre otra puerta, a veces más triste y a veces más divertida, pero siempre escrita con el mismo cuidado. He cargado partidas solo para ver qué pasaba si fallaba a propósito.',
  'La ciudad de Revachol se siente vieja, cansada y viva a la vez. Cada barrio tiene su historia política y cada personaje secundario podría protagonizar su propio juego. El caso del ahorcado es la excusa; lo que de verdad investigas es a ti mismo y a un mundo que ya perdió su revolución.',
  'No es para todo el mundo: se lee muchísimo y el combate no existe como tal. Pero si te gusta leer, no hay nada igual. Lo terminé en una semana y sigo pensando en él.',
].join('\n\n');

const JUEGO_COMPLETO: GameItem = {
  id: JUEGOS['Disco Elysium'].id,
  _ts: hace(3, 23, 48),
  name: 'Disco Elysium',
  platforms: JUEGOS['Disco Elysium'].platforms,
  genres: JUEGOS['Disco Elysium'].genres,
  steamDeck: true,
  review: RESENA_LARGA,
  score: 5,
  grade: 100,
  years: [2026],
  strengths: ['Escritura', 'Personajes', 'Libertad para fallar', 'Banda sonora'],
  weaknesses: ['Mucho texto', 'Ritmo irregular al final'],
  reasons: [],
  replayable: true,
  retry: false,
  hours: 34,
};

function relacionada(p: Persona, gameName: string, grade: number, snippet: string, updatedAt: number, reason: RelatedReview['reason']): RelatedReview {
  const gameId = JUEGOS[gameName].id;
  return {
    key: `${p.actor}:${gameId}`,
    gameId,
    gameName,
    authorId: p.actor,
    authorName: p.displayName,
    isOwn: false,
    rating: Math.round(grade / 20),
    grade,
    snippet,
    updatedAt,
    reason,
    score: 1,
  };
}

const RELACIONADAS: RelatedReview[] = [
  relacionada(MARTA, 'Pentiment', 88, 'Otro juego de leer mucho y decidir poco a poco. La tipografía cambia según quién habla y es una delicia.', hace(9, 20, 0), 'genre'),
  relacionada(LUCIA, 'Outer Wilds', 94, 'Una investigación sin pistas marcadas: solo curiosidad y un bucle de veintidós minutos.', hace(12, 21, 30), 'genre'),
  relacionada(IVAN, 'The Witcher 3', 90, 'Las misiones secundarias valen por sí solas lo que muchos juegos enteros.', hace(20, 18, 0), 'same-author'),
  relacionada(NACHO, 'Return of the Obra Dinn', 86, 'Deducir, apuntar y volver a deducir. Sin una sola ayuda.', hace(25, 22, 10), 'genre'),
  relacionada(IVAN, 'Chained Echoes', 82, 'Un JRPG de los de antes con todo lo bueno de ahora.', hace(30, 17, 45), 'same-author'),
  relacionada(PAULA, 'Hades', 92, 'Morir y volver a casa nunca había sido tan agradable.', hace(40, 16, 0), 'genre'),
];

const EVENTO = ACTIVIDAD[IVAN.id][0];

function Resena() {
  return (
    <SocialDetailScreen
      SOCIAL_UI={SOCIAL_UI}
      activeDetailEvent={EVENTO}
      getGameItemById={(_profileId, id) => (id === JUEGO_COMPLETO.id ? JUEGO_COMPLETO : null)}
      onOpenProfileDetail={avisar('abriría la ficha')}
      onBack={avisar('volvería al feed')}
      status=""
      statusKind=""
      shareable={false}
      eventLoading={false}
      reviewLoading={false}
      coversAllowed={false}
      related={<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={RELACIONADAS} onOpen={avisar('abriría esa reseña')} coversAllowed={false} />}
    />
  );
}

function ResenaDePerfil() {
  return (
    <SocialProfileReviewScreen
      SOCIAL_UI={SOCIAL_UI}
      review={{
        id: JUEGO_COMPLETO.id,
        name: JUEGO_COMPLETO.name,
        review: RESENA_LARGA,
        score: 5,
        grade: 100,
        platforms: JUEGO_COMPLETO.platforms,
        genres: JUEGO_COMPLETO.genres,
        strengths: JUEGO_COMPLETO.strengths || [],
        weaknesses: JUEGO_COMPLETO.weaknesses || [],
        reasons: [],
        hours: 34,
        ts: EVENTO.updatedAt,
      }}
      author={{ name: IVAN.displayName }}
      onBack={avisar('volvería a sus reseñas')}
      status=""
      statusKind=""
      coversAllowed={false}
      related={<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={RELACIONADAS} onOpen={avisar('abriría esa reseña')} coversAllowed={false} />}
    />
  );
}

function vistaDeSolicitud(p: Persona) {
  return { docId: `doc-${p.uid}`, otherUid: p.uid, name: p.displayName, photo: '', tier: p.tier };
}

/** `vacia`: lo que se ve al contestar la última estando dentro (sin peticiones, la campana del feed no sale). */
function Solicitudes({ vacia = false }: { vacia?: boolean }) {
  return (
    <SocialRequestsScreen
      SOCIAL_UI={SOCIAL_UI}
      incomingRequests={vacia ? [] : [vistaDeSolicitud(CARMEN), vistaDeSolicitud(ALEX)]}
      loading={false}
      busyUid=""
      onAccept={avisar('aceptaría la petición')}
      onReject={avisar('pediría confirmación para rechazar')}
      onBack={avisar('volvería al feed')}
      status=""
      statusKind=""
    />
  );
}

const RUTA_MARTA = `/social/profiles/${MARTA.id}`;
const RUTA_PROPIA = '/social/profiles/yo';
const subruta = vista === 'resenas' ? '/reviews' : vista === 'publicaciones' ? '/posts' : '';

/** Todas las pantallas del hub con sesión. La barra flotante (abajo) las recorre; `?barra=0` la quita para capturas. */
const PANTALLAS: Record<string, { nombre: string; ruta: string; pintar: () => ReactElement }> = {
  feed: { nombre: 'Feed', ruta: '/social', pintar: () => <Feed /> },
  'feed-vacio': { nombre: 'Feed sin amigos', ruta: '/social', pintar: () => <Feed vacio /> },
  amigos: { nombre: 'Perfiles (directorio)', ruta: '/social/profiles', pintar: () => <Amigos /> },
  solicitudes: { nombre: 'Solicitudes', ruta: '/social/requests', pintar: () => <Solicitudes /> },
  'solicitudes-vacia': { nombre: 'Solicitudes (ninguna)', ruta: '/social/requests', pintar: () => <Solicitudes vacia /> },
  perfil: { nombre: 'Perfil de una amiga', ruta: RUTA_MARTA + subruta, pintar: () => <Perfil /> },
  'perfil-propio': { nombre: 'Tu perfil', ruta: RUTA_PROPIA + subruta, pintar: () => <Perfil propio /> },
  ajustes: { nombre: 'Ajustes del perfil social', ruta: '/social/profile', pintar: () => <Ajustes /> },
  logros: { nombre: 'Logros de una amiga', ruta: `${RUTA_MARTA}/logros`, pintar: () => <Logros /> },
  globales: { nombre: 'Logros: vista global', ruta: `${RUTA_MARTA}/globales`, pintar: () => <Logros global /> },
  resena: { nombre: 'Reseña (desde el feed)', ruta: `/social/user/${IVAN.actor}/game/${EVENTO.gameId}/review`, pintar: () => <Resena /> },
  'resena-perfil': { nombre: 'Reseña (desde un perfil)', ruta: `/social/profiles/${IVAN.id}/game/${EVENTO.gameId}/review`, pintar: () => <ResenaDePerfil /> },
};

/** Las combinaciones de `vista` y `abrir` que tienen sentido, para la barra. */
const VARIANTES: Record<string, Array<{ nombre: string; vista?: string; abrir?: string }>> = {
  perfil: [{ nombre: 'Listas' }, { nombre: 'Reseñas', vista: 'resenas' }, { nombre: 'Estadísticas', abrir: 'estadisticas' }, { nombre: 'Resumen del año', abrir: 'resumen' }],
  'perfil-propio': [{ nombre: 'Listas' }, { nombre: 'Reseñas', vista: 'resenas' }, { nombre: 'Publicaciones', vista: 'publicaciones' }, { nombre: 'Estadísticas', abrir: 'estadisticas' }, { nombre: 'Resumen del año', abrir: 'resumen' }],
};

const TEMAS = ['tierramedia', 'arcade', 'witcher', 'persona', 'portal', 'cyberpunk', 'seaofstars', 'grimdark'];

/**
 * BARRA DE LA MAQUETA: pantalla, variante, tema y modo, sin escribir URLs a mano. Va con estilos en línea y fuera de
 * `main`, para que no la toque ningún tema ni salga en una captura de `main`. Cambiar algo recarga la página con los
 * parámetros nuevos (el tema se aplica antes del primer pintado, como en la app).
 */
function Barra() {
  const ir = (cambios: Record<string, string>) => {
    const u = new URL(window.location.href);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) u.searchParams.set(k, v);
      else u.searchParams.delete(k);
    }
    window.location.href = u.toString();
  };
  const raiz = document.documentElement;
  const tema = raiz.dataset.palette || 'tierramedia';
  const modo = raiz.dataset.theme === 'light' ? 'light' : 'dark';
  const variantes = VARIANTES[pantalla] || [];
  const actual = variantes.findIndex((v) => (v.vista || '') === vista && (v.abrir || '') === (params.get('abrir') || ''));
  const caja: React.CSSProperties = { font: '12px/1.2 system-ui, sans-serif', padding: '4px 6px', borderRadius: 6, border: '1px solid #555', background: '#1b1d22', color: '#eee' };
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 2147483000, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: 8, borderRadius: 10, background: 'rgba(15,16,20,.92)', boxShadow: '0 6px 20px rgba(0,0,0,.4)', maxWidth: 'calc(100vw - 24px)' }}>
      <select aria-label="Pantalla" style={caja} value={pantalla in PANTALLAS ? pantalla : 'feed'} onChange={(e) => ir({ pantalla: e.target.value, vista: '', abrir: '' })}>
        {Object.entries(PANTALLAS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
      </select>
      {variantes.length ? (
        <select aria-label="Vista" style={caja} value={Math.max(actual, 0)} onChange={(e) => { const v = variantes[Number(e.target.value)]; ir({ vista: v.vista || '', abrir: v.abrir || '' }); }}>
          {variantes.map((v, i) => <option key={v.nombre} value={i}>{v.nombre}</option>)}
        </select>
      ) : null}
      <select aria-label="Tema" style={caja} value={tema} onChange={(e) => ir({ 'gl-palette': e.target.value })}>
        {TEMAS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button type="button" style={{ ...caja, cursor: 'pointer' }} onClick={() => ir({ 'gl-theme': modo === 'dark' ? 'light' : 'dark' })}>
        {modo === 'dark' ? 'Oscuro → claro' : 'Claro → oscuro'}
      </button>
    </div>
  );
}

const elegida = PANTALLAS[pantalla] || PANTALLAS.feed;
const conBarra = params.get('barra') !== '0';

createRoot(document.getElementById('root') as HTMLElement).render(
  <MemoryRouter initialEntries={[elegida.ruta]}>
    <IconSprite />
    <IconSpriteRest />
    <main id="contenido" className="main main-social">
      <h1 className="sr-only">Social</h1>
      {elegida.pintar()}
    </main>
    {conBarra ? <Barra /> : null}
  </MemoryRouter>,
);
