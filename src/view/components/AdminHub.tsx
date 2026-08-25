import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ADMIN_PANEL_UI } from '../../core/constants/labels';
import {
  ADMIN_ONLY_TIER,
  PROFILE_TIERS,
  PROFILE_TIER_LABELS,
  resolveShareQuota,
  type ProfileTier,
  type ShareQuotaOverride,
} from '../../core/constants/tiers';
import {
  ADMIN_PROFILES_LIMIT,
  type AdminUserRow,
  type LegacyProfileField,
} from '../../model/repository/firebaseAdminRepository';
import type { AdminAnomaly } from '../../model/types/firestore';
import { useAdminViewModel } from '../../viewmodel/useAdminViewModel';
import { ConfirmModal } from '../modals/ConfirmModal';
import { AdminUserShares, type ShareActionRequest } from './AdminUserShares';
import { ADMIN_SHARES_UI } from '../../core/constants/labels';
import {
  adminRemoveShare,
  banUser,
  clearQuotaOverride,
  listAllShares,
  setQuotaOverride,
  unbanUser,
  type AdminShareRow,
} from '../../model/repository/shareAdminRepository';
import { HubAvatar } from './socialhub/HubAvatar';
import { Icon } from './Icon';
// La hoja del panel se importa AQUÍ y no desde `index.scss`: como el panel entra por `lazy()`, Vite emite su CSS
// en el mismo chunk perezoso y el arranque no carga ni un byte de estilos de esta pantalla (igual que `stats.scss`).
import '../../styles/admin.scss';
import { copyText } from '../../core/utils/clipboard';

const A = ADMIN_PANEL_UI;

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
/** Para fechas de alta: el día basta y ocupa la mitad. */
const DAY_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });

/**
 * Señales que el pie de la ficha ya representa como botón de purga. No se pintan además como píldora informativa:
 * sería el mismo texto y el mismo color dos veces en la misma ficha. Cuentan igual para el total de señalados.
 */
const LEGACY_ANOMALIES = new Set<AdminAnomaly>(['legacy-token', 'legacy-fields']);

/**
 * Señales que no son "estado raro" sino un problema con consecuencias hoy: un token en claro que cualquiera puede
 * leer, un perfil que no publica nada, unas reseñas que no llegan al feed, o fechas imposibles. Se destacan para
 * que no se pierdan entre las informativas (esquema antiguo, inactividad).
 */
const SEVERE_ANOMALIES = new Set<AdminAnomaly>([
  'legacy-token',
  'gist-drift',
  'future-activity',
  'created-after-activity',
]);

/** Acción pendiente de confirmar: la ejecuta el modal, no el botón de la fila. */
type PendingAction = { title: string; run: () => void } | null;

/**
 * Los tres restos legacy, cada uno con su etiqueta y su texto de confirmación. Se purgan POR SEPARADO: borrar el
 * token en claro es urgente y borrar el id del gist apenas aporta y puede costarle una reconexión a su dueño.
 * Meterlos en el mismo botón obligaría a aceptar lo segundo para conseguir lo primero.
 */
const LEGACY_FIELDS = [
  { field: 'email', label: A.legacyEmail, confirm: A.legacyConfirm.email },
  { field: 'gamesGistId', label: A.legacyGamesGist, confirm: A.legacyConfirm.gamesGistId },
  { field: 'token', label: A.legacyToken, confirm: A.legacyConfirm.token },
] as const satisfies ReadonlyArray<{ field: LegacyProfileField; label: string; confirm: (name: string) => string }>;

function formatActivity(updatedAt: number): string {
  return updatedAt > 0 ? DATE_FORMAT.format(new Date(updatedAt)) : A.never;
}

function formatDate(millis: number): string {
  return DAY_FORMAT.format(new Date(millis));
}

/**
 * Con qué nombre se identifica una fila. Si el perfil no tiene `displayName` (perfil a medias), se cae al que
 * guardaron sus amistades: es el mismo nick público, y sin él la fila es un uid anónimo imposible de reconocer.
 */
function displayNameOf(user: AdminUserRow): string {
  return user.displayName.trim() || user.knownAs.trim() || A.noName;
}

/**
 * Cuántos canales suyos hay en circulación, dicho en palabras. Sustituye a la lista de ids: con uno está sano,
 * con más de uno hay deriva (y entonces la ficha ya trae el bloque que la explica), y los identificadores en sí
 * no permiten hacer nada desde esta pantalla.
 */
function describeChannels(count: number, emptyLabel: string): string {
  if (count === 0) {
    return emptyLabel;
  }
  return count === 1 ? A.field.channelSingle : A.field.channelMany(count);
}

/**
 * Estado de la foto, DEDUCIDO de lo que el panel puede ver.
 *
 * El interruptor de verdad (`showPhoto`) vive en el gist social del usuario, que estas reglas no dejan leer. Lo
 * que sí se ve son dos hechos: si su perfil publica `photoURL` (es lo que el opt-out borra, ver
 * `updateProfilePhoto`) y qué guardan sus amistades denormalizado de él.
 *
 *   - publica foto                                        → activada
 *   - no publica, pero sus amigos guardan una suya        → la tuvo y la quitó: oculta
 *   - no publica y sus amigos tampoco tienen ninguna suya → desactivada
 *   - no publica y NO TIENE AMISTADES                     → sin datos
 *
 * El cuarto caso es el que no se puede afirmar y por eso no se afirma: sin nadie que guarde una foto suya de
 * antes, quien apagó el interruptor se ve exactamente igual que quien nunca tuvo foto en su cuenta de Google.
 * Llamarlo "desactivada" sería inventarse el motivo; el `title` de cada estado explica de dónde sale.
 */
function describePhoto(user: AdminUserRow): {
  label: string;
  hint: string;
  kind: 'on' | 'hidden' | 'off' | 'unknown';
} {
  if (user.hasPhoto) {
    return { label: A.field.photoOn, hint: A.field.photoOnHint, kind: 'on' };
  }
  if (user.friendKnownPhotos.some((known) => known.trim())) {
    return { label: A.field.photoHidden, hint: A.field.photoHiddenHint, kind: 'hidden' };
  }
  // Con amistades, que ninguna guarde foto suya SÍ dice algo: no publicó ninguna desde que se hicieron amigos.
  // El testigo son las amistades, no las fotos: `friendKnownPhotos` puede venir vacío de un amigo sin foto suya.
  if (user.friends > 0 || user.pendingOut > 0 || user.pendingIn > 0) {
    return { label: A.field.photoOff, hint: A.field.photoOffHint, kind: 'off' };
  }
  return { label: A.field.photoUnknown, hint: A.field.photoUnknownHint, kind: 'unknown' };
}

/**
 * Panel de administración (`/admin`, sin enlace en la navegación).
 *
 * Enseña el censo de perfiles sociales y permite tres cosas: suspender el social de alguien, purgarle los restos
 * legacy del documento público (email / gist de juegos / token en claro) y borrar su perfil con sus amistades.
 *
 * Todo se apoya en `isAdmin()` de firestore.rules; esta pantalla solo evita que quien no manda vea una tabla rota.
 */
export const AdminHub = memo(function AdminHub() {
  const navigate = useNavigate();
  const vm = useAdminViewModel();
  const [pending, setPending] = useState<PendingAction>(null);
  // Los enlaces de TODOS se piden una vez y se agrupan por usuario: el panel pinta decenas de fichas y una
  // petición por ficha sería absurda para un dato que cabe en una sola respuesta.
  const [sharesByUser, setSharesByUser] = useState<Record<string, AdminShareRow[]>>({});
  const [bannedUsers, setBannedUsers] = useState<Set<string>>(new Set());
  // Ajustes individuales de cuota, por uid. Vienen en la misma respuesta que los enlaces y son lo que permite
  // enseñar en cada ficha la cuota REAL de esa persona, y no la que le tocaría por su rango.
  const [overridesByUser, setOverridesByUser] = useState<Record<string, ShareQuotaOverride>>({});
  // Estado de ESA respuesta (la del Worker, no la del censo de Firestore): si no llegó, sus totales no se pintan
  // —un cero sin datos afirmaría que no hay ningún enlace ni ningún veto—, y si vino paginada se dice.
  const [sharesSummary, setSharesSummary] = useState<{ total: number; complete: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  const copyUid = useCallback(async (uid: string) => {
    // Sin permiso de portapapeles no hay nada que decir: el uid está a la vista y se puede seleccionar.
    if (!(await copyText(uid))) {
      return;
    }
    setNotice(A.copiedUid);
    // El acuse se retira solo: es una confirmación de un gesto, no un estado de la pantalla, y dejarlo fijo
    // hace dudar de a qué copia se refiere tras el segundo clic.
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 2500);
  }, []);

  const loadShares = useCallback(async () => {
    try {
      const page = await listAllShares();
      const grouped: Record<string, AdminShareRow[]> = {};
      for (const row of page.shares) {
        (grouped[row.uid] ||= []).push(row);
      }
      setSharesByUser(grouped);
      setBannedUsers(new Set(page.bans));
      setOverridesByUser(page.overrides);
      setSharesSummary({ total: page.shares.length, complete: page.complete });
    } catch {
      // Sin enlaces que enseñar, el resto del panel sigue siendo útil: no se rompe la pantalla por esto.
    }
  }, []);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  /** Acciones de moderación de enlaces: ejecutan, avisan y recargan. La confirmación la pone quien llama. */
  const runShareAction = useCallback(
    async (action: () => Promise<string>) => {
      try {
        setNotice(await action());
      } catch {
        setNotice(ADMIN_SHARES_UI.failed);
      }
      await loadShares();
    },
    [loadShares],
  );

  const closeConfirm = useCallback(() => setPending(null), []);
  const acceptConfirm = useCallback(() => {
    pending?.run();
    setPending(null);
  }, [pending]);

  if (vm.access === 'checking') {
    return (
      <section className="admin-hub" aria-label={A.sectionAria} aria-busy="true">
        <div className="admin-card">
          <p>{A.checking}</p>
        </div>
      </section>
    );
  }

  // Sin ser el admin no hay nada que enseñar aquí (y las reglas tampoco darían datos): fuera de la ruta.
  if (vm.access === 'denied') {
    return <Navigate to="/completados" replace />;
  }

  const totals = vm.census?.totals;

  // Tarjeta contenedora propia y NO `.settings-hub`/`.settings-card`: ese hub reparte sus tarjetas en una rejilla
  // de dos columnas a partir de 48rem, y eso partía el panel por la mitad. Aquí ocupa el ancho entero, y dentro va
  // la rejilla de fichas de usuario.
  return (
    <section className="admin-hub" aria-label={A.sectionAria}>
      <div className="admin-card">
        <h2>{A.title}</h2>
        <p className="admin-card-sub">{A.subtitle}</p>
        <p className="admin-card-note">{A.scopeNote}</p>
        <p className="admin-card-note">{A.legacyNote}</p>

        {totals ? (
          <dl className="admin-totals" aria-label={A.totals.aria}>
            <div><dt>{A.totals.profiles}</dt><dd>{totals.profiles}</dd></div>
            <div><dt>{A.totals.socialEnabled}</dt><dd>{totals.socialEnabled}</dd></div>
            <div><dt>{A.totals.friendships}</dt><dd>{totals.friendships}</dd></div>
            <div><dt>{A.totals.pending}</dt><dd>{totals.pending}</dd></div>
            <div><dt>{A.totals.legacy}</dt><dd>{totals.legacy}</dd></div>
            <div className={totals.flagged > 0 ? 'admin-total-flagged' : undefined}>
              <dt>{A.totals.flagged}</dt><dd>{totals.flagged}</dd>
            </div>
            {/* Los dos del Worker de enlaces, solo si su respuesta llegó. */}
            {sharesSummary ? (
              <>
                <div>
                  <dt>{A.totals.activeShares}</dt>
                  <dd title={sharesSummary.complete ? undefined : A.totals.partialHint}>
                    {sharesSummary.complete ? sharesSummary.total : A.totals.partialCount(sharesSummary.total)}
                  </dd>
                </div>
                <div className={bannedUsers.size > 0 ? 'admin-total-flagged' : undefined}>
                  <dt>{A.totals.banned}</dt><dd>{bannedUsers.size}</dd>
                </div>
              </>
            ) : null}
            {PROFILE_TIERS.map((tier) => (
              <div key={tier} className={`admin-total-tier tier-${tier}`}>
                <dt>{PROFILE_TIER_LABELS[tier]}</dt>
                <dd>{totals.byTier[tier]}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="admin-toolbar">
          <label className="admin-search">
            <span>{A.searchLabel}</span>
            <input
              type="text"
              className="finput"
              value={vm.search}
              placeholder={A.searchPlaceholder}
              onChange={(event) => vm.setSearch(event.target.value)}
            />
          </label>
          {/* El filtro que responde a "¿hay algo que mirar hoy?". Va junto a la búsqueda porque los dos recortan
              la misma lista, y el recuento de al lado dice cuánto queda tras aplicarlos. */}
          <label className="admin-only-flagged">
            <input
              type="checkbox"
              checked={vm.onlyFlagged}
              onChange={(event) => vm.setOnlyFlagged(event.target.checked)}
            />
            <span>{A.onlyFlaggedLabel}</span>
          </label>
          <p className="admin-result-count">{A.resultCount(vm.users.length)}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void vm.refresh()} disabled={vm.loading}>
            <Icon name="refresh" />
            <span>{A.refresh}</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/completados')}>
            <Icon name="arrow-back" />
            <span>{A.back}</span>
          </button>
        </div>

        {vm.census?.truncated ? <p className="admin-warning">{A.truncated(ADMIN_PROFILES_LIMIT)}</p> : null}
        {vm.error ? <p className="admin-feedback err">{vm.error}</p> : null}
        {vm.status ? <p className={`admin-feedback ${vm.status.kind}`}>{vm.status.text}</p> : null}
        {notice ? <p className="admin-feedback ok">{notice}</p> : null}

        {vm.loading && !vm.census ? (
          <p>{A.loading}</p>
        ) : vm.error ? (
          // Con un fallo de carga NO se dice además "no hay ningún perfil": la lista está vacía porque no se
          // pudo leer, y afirmar que no hay usuarios sería mentir sobre el estado del servicio.
          null
        ) : vm.users.length === 0 ? (
          // Con el filtro de señales puesto, la lista vacía es una BUENA noticia y no un "no se encontró nada":
          // decirlo con el texto de la búsqueda hacía dudar de si el censo se había cargado.
          <p>
            {!vm.census?.users.length
              ? A.empty
              : vm.onlyFlagged && !vm.search.trim()
                ? A.emptyFlagged
                : A.emptyFiltered}
          </p>
        ) : (
          <ul className="admin-user-grid" aria-label={A.table.aria}>
            {vm.users.map((user) => {
              const name = displayNameOf(user);
              const busy = vm.busyId === user.id;
              const legacyTags = LEGACY_FIELDS.filter((entry) => user.legacy[entry.field]);
              const visibleAnomalies = user.anomalies.filter((code) => !LEGACY_ANOMALIES.has(code));
              // Solo se puede migrar si el documento dice de quién es: cuando no trae `uid`, el censo lo iguala al
              // id del propio documento y no hay destino que proponer.
              const cutoverTargetKnown = Boolean(user.uid) && user.uid !== user.id;
              // Nombres que sus amistades guardan y que ya no son el que publica: es lo que le ven sus amigos. Sin
              // nick publicado no hay con qué comparar, y el nombre de sus amigos ya identifica la ficha arriba.
              const staleNames = user.displayName.trim()
                ? user.friendKnownNames.filter((known) => known !== user.displayName.trim())
                : [];
              // La foto denormalizada se queda rancia por la misma vía que el nombre. Una foto vacía en sus amistades
              // cuando el perfil sí tiene una también cuenta: sus amigos le ven sin foto.
              const photoIsStale = user.friendKnownPhotos.some((known) => known !== user.photoURL);
              // El botón de propagar solo aparece cuando hay algo que propagar de verdad.
              const identityIsStale = staleNames.length > 0 || photoIsStale;
              // Cuota REAL de esta persona: su rango, ya resuelto con su ajuste individual si lo tiene. Es la
              // misma función que aplica el servidor, así que la ficha no puede decir una cifra y el Worker otra.
              const override = overridesByUser[user.uid];
              const hasQuotaOverride = Boolean(override && (override.maxActive || override.ttlDays));
              const quota = resolveShareQuota(user.tier, override);
              const photoState = describePhoto(user);

              return (
                <li key={user.id} className={`admin-user-card${busy ? ' is-busy' : ''}`}>
                  <header className="admin-user-head">
                    <HubAvatar photoURL={user.photoURL} />
                    <span className="admin-user-text">
                      <b>
                        {name}
                        {/* Se avisa de que ese nombre no sale de su perfil, sino de sus amistades. */}
                        {!user.displayName.trim() && user.knownAs.trim() ? (
                          <em className="admin-known-as"> · {A.knownAsHint}</em>
                        ) : null}
                      </b>
                      {/* El uid es la única identidad que queda en el cliente y sigue haciendo falta para
                          buscar a alguien en Firebase Auth, que es donde vive el correo. Se COPIA, pero ya no se
                          pinta: enseñado en cada ficha era una cadena ilegible que tapaba los datos que sí se
                          leen, y no hay nada que se pueda hacer con él en esta pantalla. */}
                      <button
                        type="button"
                        className="admin-uid"
                        aria-label={A.copyUidAria(name)}
                        onClick={() => void copyUid(user.uid)}
                      >
                        <Icon name="content-copy" />
                        <span>{A.copyUid}</span>
                      </button>
                    </span>
                    <span className={`admin-badge ${user.socialEnabled ? 'on' : 'off'}`}>
                      {user.socialEnabled ? A.enabled : A.disabled}
                    </span>
                  </header>

                  {/* El cambio de rango no pasa por el modal de confirmación: es reversible de un clic y no
                      destruye nada, al contrario que suspender, purgar o borrar. */}
                  <label className="admin-tier-row">
                    <span className="admin-field-label">{A.tier.column}</span>
                    <select
                      className={`finput admin-tier-select tier-${user.tier}`}
                      aria-label={A.tier.selectAria(name)}
                      value={user.tier}
                      disabled={busy}
                      onChange={(event) => void vm.changeTier(user, event.target.value as ProfileTier)}
                    >
                      {PROFILE_TIERS.map((tier) => {
                        // Mithril solo en la fila del propio admin. Se pinta igualmente (deshabilitado) para
                        // que se vea que el rango existe y no parezca que falta una opción.
                        const reserved = tier === ADMIN_ONLY_TIER && user.uid !== vm.ownUid;
                        return (
                          <option key={tier} value={tier} disabled={reserved}>
                            {PROFILE_TIER_LABELS[tier]}
                            {reserved ? ` — ${A.tier.reservedHint}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  {/* Señales primero: es lo que dice si hay que mirar esta ficha o pasar de largo.
                      Las de restos legacy se omiten AQUÍ porque el pie de la ficha ya las muestra —con el mismo
                      color de peligro y su explicación— convertidas en el botón que las purga: repetir la misma
                      píldora dos veces en la misma ficha solo hace dudar de si son dos cosas distintas. Siguen
                      contando para el total de perfiles con señales. */}
                  {visibleAnomalies.length > 0 ? (
                    <ul className="admin-anomalies" aria-label={A.anomalies.aria}>
                      {visibleAnomalies.map((code) => (
                        <li key={code} className={`admin-anomaly${SEVERE_ANOMALIES.has(code) ? ' is-severe' : ''}`} title={A.anomalies[code].hint}>
                          {A.anomalies[code].label}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {/* Enlaces compartidos de ESTE usuario, plegados. La moderación vive en su ficha porque la
                      pregunta siempre es "¿qué ha publicado esta persona?", no "¿qué enlaces hay en total". */}
                  <AdminUserShares
                    uid={user.uid}
                    shares={sharesByUser[user.uid] || []}
                    banned={bannedUsers.has(user.uid)}
                    tier={user.tier}
                    quota={quota}
                    hasOverride={hasQuotaOverride}
                    onConfirm={(request: ShareActionRequest) => setPending({ title: request.title, run: () => void request.run() })}
                    onRemove={(token) => runShareAction(async () => {
                      await adminRemoveShare(token);
                      return ADMIN_SHARES_UI.removed;
                    })}
                    onBan={(uid, options) => runShareAction(async () => {
                      const purged = await banUser(uid, options);
                      return ADMIN_SHARES_UI.banned(purged);
                    })}
                    onUnban={(uid) => runShareAction(async () => {
                      await unbanUser(uid);
                      return ADMIN_SHARES_UI.unbanned;
                    })}
                    onQuota={(uid, values) => runShareAction(async () => {
                      // Los dos valores son ABSOLUTOS y van siempre juntos: el formulario los trae rellenos, así
                      // que "no tocar este campo" ya no necesita ninguna convención — se deja como está.
                      await setQuotaOverride(uid, values);
                      return ADMIN_SHARES_UI.quotaSet;
                    })}
                    onQuotaClear={(uid) => runShareAction(async () => {
                      await clearQuotaOverride(uid);
                      return ADMIN_SHARES_UI.quotaCleared;
                    })}
                  />

                  {/* Ficha completa: todo lo que las reglas dejan leer. `dl` y no tabla, para que en móvil
                      caiga a una columna sin scroll horizontal. */}
                  <dl className="admin-user-data">
                    <div>
                      <dt>{user.createdAt > 0 ? A.field.createdAt : A.field.createdAtEstimated}</dt>
                      <dd title={user.createdAt > 0 ? undefined : A.field.estimatedHint}>
                        {user.createdAt > 0
                          ? formatDate(user.createdAt)
                          : user.estimatedFirstSeenAt > 0
                            ? `~ ${formatDate(user.estimatedFirstSeenAt)}`
                            : A.field.createdAtUnknown}
                      </dd>
                    </div>
                    <div><dt>{A.field.lastActivity}</dt><dd>{formatActivity(user.updatedAt)}</dd></div>
                    <div><dt>{A.field.friends}</dt><dd>{user.friends}</dd></div>
                    <div><dt>{A.field.pendingOut}</dt><dd>{user.pendingOut}</dd></div>
                    <div><dt>{A.field.pendingIn}</dt><dd>{user.pendingIn}</dd></div>
                    {/* El id del canal ya no se publica en el perfil, así que este campo solo existe como resto
                        legacy: pintarlo siempre enseñaba un "—" a todo el mundo. El canal de alguien se ve ahora
                        por lo que guardan sus amistades, que es el dato de abajo. El id EN SÍ no se enseña: no se
                        puede abrir un gist ajeno desde aquí, y lo accionable es que lo siga publicando. */}
                    {user.socialGistId ? (
                      <div><dt>{A.field.socialGist}</dt><dd>{A.field.socialGistPresent}</dd></div>
                    ) : null}
                    {/* Cuántos canales suyos hay en circulación, no cuáles: con más de uno hay deriva (y ahí sí
                        aparece el bloque que lo explica); con uno, está sano. La lista de ids no decidía nada. */}
                    <div>
                      <dt>{A.field.friendGists}</dt>
                      <dd>{describeChannels(user.friendSocialGistIds.length, A.field.channelNone)}</dd>
                    </div>
                    {/* El otro canal: con él un amigo carga sus LISTAS compartidas. Vacío no es un fallo —
                        significa que no tiene la sincronización de listas configurada—, así que no lleva señal. */}
                    <div>
                      <dt>{A.field.friendGamesGists}</dt>
                      <dd>{describeChannels(user.friendGamesGistIds.length, A.field.listsNone)}</dd>
                    </div>
                    {/* Solo cuando alguno de sus amigos le ve con otro nombre: en el caso normal repetir el nick
                        que ya está arriba no aporta nada. */}
                    {/* Los DOS nombres, etiquetados por origen. Antes solo se pintaba el de las amistades como "el
                        viejo", y eso era afirmar lo que el panel no puede saber: el nick vigente vive en su gist. */}
                    {staleNames.length > 0 ? (
                      <>
                        <div><dt>{A.field.profileNameSource}</dt><dd>{user.displayName.trim()}</dd></div>
                        <div><dt>{A.field.staleFriendNames}</dt><dd>{staleNames.join(', ')}</dd></div>
                      </>
                    ) : null}
                    {/* Solo se dice si está al día o no: la URL ocuparía una línea entera para no informar de nada
                        que no se vea ya en el avatar. Y solo con amistades: sin ellas no hay foto que comparar. */}
                    {user.friendKnownPhotos.length > 0 ? (
                      <div>
                        <dt>{A.field.friendPhoto}</dt>
                        <dd>{photoIsStale ? A.field.friendPhotoStale : A.field.friendPhotoFresh}</dd>
                      </div>
                    ) : null}
                    {user.stalePendingOut > 0 ? (
                      <div>
                        <dt>{A.field.stalePending}</dt>
                        <dd>{A.field.stalePendingDetail(user.stalePendingOut, user.fossilPendingOut)}</dd>
                      </div>
                    ) : null}
                    <div><dt>{A.field.etag}</dt><dd>{user.hasSocialEtag ? A.field.yes : A.field.no}</dd></div>
                    {/* Tres estados en vez de un sí/no: "no" se leía como "no tiene", cuando lo más frecuente es
                        que la haya ocultado. Cuál de los tres es y por qué, en el `title`. */}
                    <div>
                      <dt>{A.field.photo}</dt>
                      <dd className={`admin-photo-state is-${photoState.kind}`} title={photoState.hint}>
                        {photoState.label}
                      </dd>
                    </div>
                    <div><dt>{A.field.schema}</dt><dd>{user.schemaVersion || A.field.none}</dd></div>
                  </dl>

                  {/* Deriva de gist: DE DÓNDE sale (su perfil, sus amistades, o las dos) y cuántos canales hay.
                      Los ids no se enseñan porque no hay nada que decidir con ellos: la deriva la resuelve su
                      dueño al abrir el hub, y desde aquí no hay acción posible ni con id ni sin él. */}
                  {user.anomalies.includes('gist-drift') ? (
                    <div className="admin-gist-drift" role="group" aria-label={A.gist.driftTitle}>
                      <span className="admin-field-label">{A.gist.driftTitle}</span>
                      <p className="admin-card-note">{A.gist.driftHint}</p>
                      <dl className="admin-user-data">
                        <div>
                          <dt>{A.gist.profileGist}</dt>
                          {/* Lo habitual desde la purga: el perfil ya no publica id y la deriva se ve entre las
                              propias amistades. Decirlo evita leer el hueco como un dato que no se pudo cargar. */}
                          <dd>{user.socialGistId ? A.gist.profileGistOwn : A.gist.profileGistPurged}</dd>
                        </div>
                        <div>
                          <dt>{A.gist.friendGist}</dt>
                          <dd>{describeChannels(user.friendSocialGistIds.length, A.field.channelNone)}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}

                  {/* Identidad denormalizada rancia: sus amigos le ven con el nombre (o la foto) de cuando se
                      hicieron amigos. Su cliente lo arregla solo al abrir el espacio social, guardar el perfil o
                      publicar; quien no pasa por ahí lo arrastra, y esta es la única vía que no depende de él. */}
                  {identityIsStale ? (
                    <div className="admin-gist-drift" role="group" aria-label={A.healIdentity.title}>
                      <span className="admin-field-label">{A.healIdentity.title}</span>
                      <p className="admin-card-note">{A.healIdentity.hint}</p>
                      {/* Aviso cuando los nombres no coinciden: propagar escribe el del PERFIL, que puede ser el
                          viejo. Sin esto, el botón deshacía en las amistades un nombre que ya era el correcto. */}
                      {staleNames.length > 0 ? (
                        <p className="admin-warning">{A.field.nameMismatchHint}</p>
                      ) : null}
                      {/* DESEMPATE A MANO: los nombres en circulación, cada uno con su origen, para elegir el bueno.
                          El panel no puede saberlo (el nick vive en el gist), pero quien mira sí puede decidirlo. */}
                      {staleNames.length > 0 ? (
                        <div className="admin-name-choice" role="group" aria-label={A.chooseName.title}>
                          <span className="admin-field-label">{A.chooseName.title}</span>
                          <p className="admin-card-note">{A.chooseName.hint}</p>
                          <div className="admin-actions">
                            {[
                              { value: user.displayName.trim(), origin: A.chooseName.current },
                              ...staleNames.map((known) => ({ value: known, origin: A.chooseName.fromFriends })),
                            ]
                              .filter((option) => option.value)
                              .map((option) => (
                                <button
                                  key={`${option.origin}-${option.value}`}
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={busy}
                                  aria-label={A.chooseName.btnAria(option.value, name)}
                                  onClick={() =>
                                    setPending({
                                      title: A.chooseName.confirm(name, option.value),
                                      run: () => void vm.chooseDisplayName(user, option.value),
                                    })
                                  }
                                >
                                  {`${A.chooseName.btn(option.value)} — ${option.origin}`}
                                </button>
                              ))}
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            // La confirmación dice el nombre EXACTO que se va a escribir, no solo a quién.
                            title: A.healIdentity.confirmWithName(name, user.displayName.trim() || user.knownAs.trim()),
                            run: () => void vm.healIdentity(user),
                          })
                        }
                      >
                        {busy ? A.working : A.healIdentity.btn}
                      </button>
                    </div>
                  ) : null}

                  {/* Solicitudes que envió y nadie aceptó en 180 días. El botón solo aparece cuando de verdad hay
                      alguna purgable: la señal avisa a los 90 días, pero borrar espera al doble de margen. */}
                  {user.fossilPendingOut > 0 ? (
                    <div className="admin-gist-drift" role="group" aria-label={A.fossil.title}>
                      <span className="admin-field-label">{A.fossil.title}</span>
                      <p className="admin-card-note">{A.fossil.hint}</p>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            title: A.fossil.confirm(name, user.fossilPendingOut),
                            run: () => void vm.purgeFossilRequests(user),
                          })
                        }
                      >
                        {busy ? A.working : A.fossil.btn(user.fossilPendingOut)}
                      </button>
                    </div>
                  ) : null}

                  {/* Cutover de identidad: el documento no vive en `profiles/{uid}`. Lo que hace falta saber antes
                      de pulsar no son los ids —da igual cuál sea el actual: el destino es siempre el canónico—,
                      sino si hay destino y qué va a pasar con lo que hay allí. Sin uid en el documento no hay
                      destino: el botón se bloquea con el motivo, que no es un fallo sino el turno del dueño. */}
                  {user.anomalies.includes('foreign-doc-id') ? (
                    <div className="admin-gist-drift" role="group" aria-label={A.cutover.title}>
                      <span className="admin-field-label">{A.cutover.title}</span>
                      <p className="admin-card-note">{A.cutover.hint}</p>
                      <dl className="admin-user-data">
                        <div>
                          <dt>{A.cutover.targetLabel}</dt>
                          {/* El destino es siempre `profiles/{uid}`: enseñar el id no daba nada que comprobar
                              que no diga ya "su documento canónico". Lo que decide es la línea de abajo. */}
                          <dd>{cutoverTargetKnown ? A.cutover.targetCanonical : A.field.none}</dd>
                        </div>
                        {/* Mover y fusionar no son la misma operación y no tienen las mismas consecuencias: quien
                            pulsa el botón debe saber cuál de las dos va a ocurrir ANTES de pulsarlo. Sale del censo
                            ya cargado, pero si viene recortado la ausencia de gemelo no prueba nada. */}
                        {cutoverTargetKnown ? (
                          <div>
                            <dt>{A.cutover.outcomeLabel}</dt>
                            <dd>
                              {user.canonicalTwinFound
                                ? A.cutover.outcomeMerge
                                : vm.census?.truncated
                                  ? A.cutover.outcomeUnknown
                                  : A.cutover.outcomeMove}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy || !cutoverTargetKnown}
                        title={cutoverTargetKnown ? undefined : A.cutover.unknownUid}
                        // Igual que en los restos legacy: el motivo del bloqueo va en el nombre accesible, porque
                        // con `aria-label` presente el `title` no se anuncia.
                        aria-label={cutoverTargetKnown ? A.cutover.btn : `${A.cutover.btn} — ${A.cutover.unknownUid}`}
                        onClick={() =>
                          setPending({
                            title: A.cutover.confirm(name),
                            run: () => void vm.migrateIdentity(user),
                          })
                        }
                      >
                        {busy ? A.working : A.cutover.btn}
                      </button>
                    </div>
                  ) : null}

                  <div className="admin-card-actions">
                    {legacyTags.length === 0 ? (
                      <span className="admin-legacy-clean">{A.legacyNone}</span>
                    ) : (
                      <span className="admin-legacy" aria-label={A.legacyAria}>
                        {legacyTags.map((tag) => {
                          // El email de un perfil que no se identifica por el uid NO se purga: es su única
                          // vía de recuperación. Se muestra bloqueado y con el motivo en el `title`.
                          const locked = tag.field === 'email' && !user.idMatchesUid;
                          return (
                            <button
                              key={tag.field}
                              type="button"
                              className="admin-legacy-tag"
                              disabled={busy || locked}
                              title={locked ? A.legacyEmailLocked : A.legacyPurgeAria(tag.label, name)}
                              // El motivo del bloqueo va en el NOMBRE accesible, no solo en `title`: con un
                              // `aria-label` presente, el `title` no se anuncia y quedaría un botón
                              // deshabilitado sin explicación para quien usa lector de pantalla.
                              aria-label={
                                locked
                                  ? `${A.legacyPurgeAria(tag.label, name)} — ${A.legacyEmailLocked}`
                                  : A.legacyPurgeAria(tag.label, name)
                              }
                              onClick={() =>
                                setPending({
                                  title: tag.confirm(name),
                                  run: () => void vm.purgeLegacy(user, tag.field),
                                })
                              }
                            >
                              {tag.label}
                            </button>
                          );
                        })}
                      </span>
                    )}
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            title: user.socialEnabled ? A.confirmDisable(name) : A.confirmEnable(name),
                            run: () => void vm.toggleSocial(user),
                          })
                        }
                      >
                        {busy ? A.working : user.socialEnabled ? A.disableBtn : A.enableBtn}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            title: `${A.confirmDelete(name)} ${A.deleteScope}`,
                            run: () => void vm.deleteUser(user),
                          })
                        }
                      >
                        {A.deleteBtn}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={pending !== null}
        title={pending?.title || ''}
        confirmLabel={A.confirmAccept}
        onCancel={closeConfirm}
        onConfirm={acceptConfirm}
      />
    </section>
  );
});
