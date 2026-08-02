import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ADMIN_PANEL_UI } from '../../core/constants/labels';
import {
  ADMIN_ONLY_TIER,
  PROFILE_TIERS,
  PROFILE_TIER_LABELS,
  type ProfileTier,
} from '../../core/constants/tiers';
import {
  ADMIN_PROFILES_LIMIT,
  type AdminUserRow,
  type LegacyProfileField,
} from '../../model/repository/firebaseAdminRepository';
import type { AdminAnomaly } from '../../model/types/firestore';
import { useAdminViewModel } from '../../viewmodel/useAdminViewModel';
import { ConfirmModal } from '../modals/ConfirmModal';
import { HubAvatar } from './socialhub/HubAvatar';
import { Icon } from './Icon';

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
  'enabled-without-gist',
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
  const [notice, setNotice] = useState('');
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  const copyUid = useCallback(async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      setNotice(A.copiedUid);
      // El acuse se retira solo: es una confirmación de un gesto, no un estado de la pantalla, y dejarlo fijo
      // hace dudar de a qué copia se refiere tras el segundo clic.
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(''), 2500);
    } catch {
      // Sin permiso de portapapeles no hay nada que decir: el uid está a la vista y se puede seleccionar.
    }
  }, []);

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
          <p>{vm.census?.users.length ? A.emptyFiltered : A.empty}</p>
        ) : (
          <ul className="admin-user-grid" aria-label={A.table.aria}>
            {vm.users.map((user) => {
              const name = displayNameOf(user);
              const busy = vm.busyId === user.id;
              const legacyTags = LEGACY_FIELDS.filter((entry) => user.legacy[entry.field]);
              const visibleAnomalies = user.anomalies.filter((code) => !LEGACY_ANOMALIES.has(code));

              return (
                <li key={user.id} className={`admin-user-card${busy ? ' is-busy' : ''}`}>
                  <header className="admin-user-head">
                    <HubAvatar name={name} photoURL={user.photoURL} />
                    <span className="admin-user-text">
                      <b>
                        {name}
                        {/* Se avisa de que ese nombre no sale de su perfil, sino de sus amistades. */}
                        {!user.displayName.trim() && user.knownAs.trim() ? (
                          <em className="admin-known-as"> · {A.knownAsHint}</em>
                        ) : null}
                      </b>
                      {/* El uid es la única identidad que queda en el cliente: se copia de un clic para
                          buscarla en Firebase Auth, que es donde vive el correo. */}
                      <button
                        type="button"
                        className="admin-uid"
                        title={A.copyUid}
                        aria-label={`${A.copyUid}: ${user.uid}`}
                        onClick={() => void copyUid(user.uid)}
                      >
                        <code>{user.uid}</code>
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
                    <div><dt>{A.field.lastFriendship}</dt><dd>{formatActivity(user.lastFriendshipAt)}</dd></div>
                    <div><dt>{A.field.profileId}</dt><dd><code>{user.profileId || A.field.none}</code></dd></div>
                    <div><dt>{A.field.socialGist}</dt><dd><code>{user.socialGistId || A.field.none}</code></dd></div>
                    <div><dt>{A.field.etag}</dt><dd>{user.hasSocialEtag ? A.field.yes : A.field.no}</dd></div>
                    <div><dt>{A.field.photo}</dt><dd>{user.hasPhoto ? A.field.yes : A.field.no}</dd></div>
                    <div><dt>{A.field.schema}</dt><dd>{user.schemaVersion || A.field.none}</dd></div>
                    {/* Solo si difiere del uid: en el caso normal repetirlo no aporta nada. */}
                    {!user.idMatchesUid ? (
                      <div><dt>{A.field.docId}</dt><dd><code>{user.id}</code></dd></div>
                    ) : null}
                  </dl>

                  {/* Deriva de gist: se enseñan LOS DOS ids (el que publica y el que ven sus amistades) para que
                      la decisión sea comprobable, y se ofrece unificar. El árbitro decide con evidencia; el
                      administrador no tiene que adivinar cuál es el bueno. */}
                  {user.anomalies.includes('gist-drift') ? (
                    <div className="admin-gist-drift" role="group" aria-label={A.gist.driftTitle}>
                      <span className="admin-field-label">{A.gist.driftTitle}</span>
                      <dl className="admin-user-data">
                        <div><dt>{A.gist.profileGist}</dt><dd><code>{user.socialGistId}</code></dd></div>
                        <div>
                          <dt>{A.gist.friendGist}</dt>
                          <dd>{user.friendSocialGistIds.map((gistId) => <code key={gistId}>{gistId}</code>)}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        title={A.gist.unifyHint}
                        onClick={() =>
                          setPending({ title: A.gist.confirm(name), run: () => void vm.unifyGist(user) })
                        }
                      >
                        {busy ? A.working : A.gist.unifyBtn}
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
