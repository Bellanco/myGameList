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
import { useAdminViewModel } from '../../viewmodel/useAdminViewModel';
import { ConfirmModal } from '../modals/ConfirmModal';
import { HubAvatar } from './socialhub/HubAvatar';
import { Icon } from './Icon';

const A = ADMIN_PANEL_UI;

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

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

  // Tarjeta propia y NO `.settings-hub`/`.settings-card`: ese hub reparte sus tarjetas en una rejilla de dos
  // columnas a partir de 48rem, y eso partía esta tabla por la mitad. Aquí solo hay una tabla, y va entera.
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
          <div className="admin-table-wrap">
            <table className="admin-table" aria-label={A.table.aria}>
              <thead>
                <tr>
                  <th scope="col">{A.table.user}</th>
                  <th scope="col">{A.tier.column}</th>
                  <th scope="col">{A.table.state}</th>
                  <th scope="col">{A.table.activity}</th>
                  <th scope="col">{A.table.relations}</th>
                  <th scope="col">{A.table.legacy}</th>
                  <th scope="col">{A.table.actions}</th>
                </tr>
              </thead>
              <tbody>
                {vm.users.map((user) => {
                  const name = displayNameOf(user);
                  const busy = vm.busyId === user.id;
                  const legacyTags = LEGACY_FIELDS.filter((entry) => user.legacy[entry.field]);

                  return (
                    <tr key={user.id} className={busy ? 'is-busy' : undefined}>
                      <th scope="row">
                        <span className="admin-user">
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
                        </span>
                      </th>
                      <td>
                        {/* El cambio de rango no pasa por el modal de confirmación: es reversible de un clic y
                            no destruye nada, al contrario que suspender, purgar o borrar. */}
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
                      </td>
                      <td>
                        <span className={`admin-badge ${user.socialEnabled ? 'on' : 'off'}`}>
                          {user.socialEnabled ? A.enabled : A.disabled}
                        </span>
                      </td>
                      <td>{formatActivity(user.updatedAt)}</td>
                      <td>{A.relations(user.friends, user.pending)}</td>
                      <td>
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
                      </td>
                      <td>
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
