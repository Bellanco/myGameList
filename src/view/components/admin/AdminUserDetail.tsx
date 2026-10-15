import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_PANEL_UI, ADMIN_SHARES_UI, ADMIN_SHELL_UI } from '../../../core/constants/adminLabels';
import {
  ADMIN_ONLY_TIER,
  PROFILE_TIERS,
  PROFILE_TIER_LABELS,
  resolveShareQuota,
  type ProfileTier,
} from '../../../core/constants/tiers';
import { healedFriendPhoto } from '../../../core/social/friendPhoto';
import { createLocalDateFormat } from '../../../core/utils/dateTime';
import type { AdminUserRow, LegacyProfileField } from '../../../model/repository/firebaseAdminRepository';
import type { AdminAnomaly } from '../../../model/types/firestore';
import {
  adminRemoveShare,
  banUser,
  clearQuotaOverride,
  setQuotaOverride,
  unbanUser,
} from '../../../model/repository/shareAdminRepository';
import { AdminUserShares, type ShareActionRequest } from '../AdminUserShares';
import { HubAvatar } from '../socialhub/HubAvatar';
import { Icon } from '../Icon';
import { useAdminPanel } from './AdminPanelContext';

const A = ADMIN_PANEL_UI;
const D = ADMIN_SHELL_UI.detail;
const DAY_FORMAT = createLocalDateFormat({ dateStyle: 'medium' });
const DATE_FORMAT = createLocalDateFormat({ dateStyle: 'medium', timeStyle: 'short' });

/** La consola de Firebase Auth del proyecto. No abre un usuario por uid: se pega el identificador copiado. */
const FIREBASE_AUTH_CONSOLE = 'https://console.firebase.google.com/project/mylists-f7313/authentication/users';

/**
 * Los tres restos legacy, cada uno con su etiqueta y su texto de confirmación. Se purgan POR SEPARADO: borrar el
 * token en claro es urgente y borrar el id del gist apenas aporta y puede costarle una reconexión a su dueño.
 */
const LEGACY_FIELDS = [
  { field: 'email', label: A.legacyEmail, confirm: A.legacyConfirm.email },
  { field: 'gamesGistId', label: A.legacyGamesGist, confirm: A.legacyConfirm.gamesGistId },
  { field: 'token', label: A.legacyToken, confirm: A.legacyConfirm.token },
] as const satisfies ReadonlyArray<{ field: LegacyProfileField; label: string; confirm: (name: string) => string }>;

/** Señales que tienen su propio bloque en «Por resolver», con el botón que las arregla. */
const HANDLED_SIGNALS: ReadonlySet<AdminAnomaly> = new Set<AdminAnomaly>([
  'legacy-fields',
  'legacy-token',
  'stray-photo',
  'gist-drift',
  'friend-name-mismatch',
  'stale-pending-out',
  'foreign-doc-id',
]);

/** Con qué nombre se identifica una fila: el de su perfil o, a falta de él, el que le dan sus amistades. */
export function displayNameOf(user: Pick<AdminUserRow, 'displayName' | 'knownAs'>): string {
  return user.displayName.trim() || user.knownAs.trim() || A.noName;
}

/** Cuántos canales suyos hay en circulación, dicho en palabras (los ids no permiten hacer nada desde aquí). */
function describeChannels(count: number, emptyLabel: string): string {
  if (count === 0) return emptyLabel;
  return count === 1 ? A.field.channelSingle : A.field.channelMany(count);
}

/**
 * Estado de la foto, DEDUCIDO de lo que el panel puede ver: el interruptor de verdad vive en el gist social y estas
 * reglas no dejan leerlo. Sin amistades con las que comparar no se afirma nada (ver `A.field.photoUnknownHint`).
 */
function describePhoto(user: AdminUserRow): { label: string; hint: string; kind: 'on' | 'hidden' | 'off' | 'unknown' } {
  if (user.hasPhoto) return { label: A.field.photoOn, hint: A.field.photoOnHint, kind: 'on' };
  if (user.friendKnownPhotos.some((known) => known.trim())) {
    return { label: A.field.photoHidden, hint: A.field.photoHiddenHint, kind: 'hidden' };
  }
  if (user.friends > 0 || user.pendingOut > 0 || user.pendingIn > 0) {
    return { label: A.field.photoOff, hint: A.field.photoOffHint, kind: 'off' };
  }
  return { label: A.field.photoUnknown, hint: A.field.photoUnknownHint, kind: 'unknown' };
}

/**
 * LA FICHA DE UNA PERSONA, en un panel lateral sobre la tabla (`/admin/usuarios/:id`).
 *
 * Es lo que antes era cada tarjeta del censo, con las mismas acciones y las mismas confirmaciones: primero lo que
 * hay por resolver (una señal y el botón que la arregla, juntos), luego el rango, sus enlaces y sus datos, y al
 * final lo que no arregla nada y destruye algo. Se cierra con Escape, con el botón o pulsando fuera.
 */
export const AdminUserDetail = memo(function AdminUserDetail({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const { vm, data, confirm, runShareAction, copyUid, accounts } = useAdminPanel();
  const email = accounts.byUid.get(user.uid)?.email || '';
  const name = displayNameOf(user);
  const target = { uid: user.uid, name: user.displayName.trim() || user.knownAs.trim() };
  const busy = vm.busyId === user.id;
  const now = Date.now();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Si hay un diálogo encima (la confirmación), Escape es suyo.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const legacyTags = LEGACY_FIELDS.filter((entry) => user.legacy[entry.field]);
  // Sin `uid` en el documento, el censo lo iguala al id y no hay destino que proponer.
  const cutoverTargetKnown = Boolean(user.uid) && user.uid !== user.id;
  // Nombres que sus amistades guardan y que ya no son el que publica: es lo que le ven sus amigos.
  const staleNames = user.displayName.trim()
    ? user.friendKnownNames.filter((known) => known !== user.displayName.trim())
    : [];
  // Rancia = la que el panel ESCRIBIRÍA no es la que hay (`healedFriendPhoto`): una amistad sin foto no cuenta,
  // porque podría ser una que ocultó y el panel no se la pone.
  const photoIsStale = user.friendKnownPhotos.some((known) => known !== healedFriendPhoto(known, user.photoURL));
  const identityIsStale = staleNames.length > 0 || photoIsStale;
  // Cuota REAL: su rango resuelto con su ajuste individual, con la misma función que aplica el servidor.
  const override = data.shares.overrides[user.uid];
  const hasQuotaOverride = Boolean(override && (override.maxActive || override.ttlDays));
  const quota = resolveShareQuota(user.tier, override);
  const userShares = data.shares.byUser[user.uid] || [];
  const photoState = describePhoto(user);
  const signup = user.createdAt > 0 ? user.createdAt : user.estimatedFirstSeenAt;
  // Las señales sin bloque propio (inactividad, esquema antiguo, fechas raras…) se dicen como píldora: no hay nada
  // que pulsar, pero tienen que verse.
  const informative = user.anomalies.filter((code) => !HANDLED_SIGNALS.has(code));
  const hasFixes =
    legacyTags.length > 0 ||
    user.anomalies.includes('gist-drift') ||
    identityIsStale ||
    user.stalePendingOut > 0 ||
    user.anomalies.includes('stray-photo') ||
    user.anomalies.includes('foreign-doc-id') ||
    informative.length > 0;

  return (
    <>
      <div className="adm-scrim" onClick={onClose} aria-hidden="true" />
      <aside className={`adm-drawer${busy ? ' is-busy' : ''}`} aria-label={D.aria(name)}>
        <div className="adm-drawer-top">
          <button type="button" className="btn btn-secondary adm-sm" onClick={onClose} aria-label={D.closeAria}>
            <Icon name="close" />
            <span>{D.close}</span>
          </button>
          {/* El uid no se pinta: es una cadena ilegible. Se COPIA, que es lo que hace falta para buscarle en Auth. */}
          <button type="button" className="adm-link" aria-label={A.copyUidAria(name)} onClick={() => void copyUid(user.uid)}>
            <Icon name="content-copy" />
            {A.copyUid}
          </button>
        </div>

        <header className="adm-drawer-id">
          <span className={`adm-ava-ring tier-${user.tier}`}>
            <HubAvatar photoURL={user.photoURL} sizeClass="hub-avatar-md" />
          </span>
          <div>
            <h3>
              {name}
              {!user.displayName.trim() && user.knownAs.trim() ? <em className="admin-known-as"> · {A.knownAsHint}</em> : null}
            </h3>
            <p>
              {signup > 0
                ? user.createdAt > 0
                  ? D.signup(DAY_FORMAT.format(new Date(signup)))
                  : D.signupEstimated(DAY_FORMAT.format(new Date(signup)))
                : A.field.createdAtUnknown}
              {' · '}
              <span title={user.updatedAt > 0 ? DATE_FORMAT.format(new Date(user.updatedAt)) : undefined}>
                {user.updatedAt > 0 ? D.activity(A.field.lastActivityAgo(user.updatedAt, now)) : A.never}
              </span>
            </p>
          </div>
          <span className={`admin-badge ${user.socialEnabled ? 'on' : 'off'}`}>{user.socialEnabled ? A.enabled : A.disabled}</span>
        </header>

        <dl className="adm-facts">
          <div><dt>{D.facts.friends}</dt><dd>{user.friends}</dd></div>
          <div><dt>{D.facts.shares}</dt><dd>{userShares.length}</dd></div>
          <div><dt>{D.facts.pending}</dt><dd>{user.pendingOut + user.pendingIn}</dd></div>
        </dl>

        {hasFixes ? (
          <section className="adm-section" aria-label={D.sections.fix}>
            <h4>{D.sections.fix}</h4>

            {informative.length > 0 ? (
              <ul className="admin-anomalies" aria-label={A.anomalies.aria}>
                {informative.map((code) => (
                  <li key={code} className="admin-anomaly" title={A.anomalies[code].hint}>{A.anomalies[code].label}</li>
                ))}
              </ul>
            ) : null}

            {/* Restos legacy: cada campo es su botón de purga. */}
            {legacyTags.length > 0 ? (
              <div className="admin-gist-drift is-severe" role="group" aria-label={A.legacyAria}>
                <span className="admin-field-label">{A.anomalies['legacy-fields'].label}</span>
                <span className="admin-legacy">
                  {legacyTags.map((tag) => {
                    // El email de un perfil que no se identifica por el uid NO se purga: es su única vía de recuperación.
                    const locked = tag.field === 'email' && !user.idMatchesUid;
                    return (
                      <button
                        key={tag.field}
                        type="button"
                        className="admin-legacy-tag"
                        disabled={busy || locked}
                        title={locked ? A.legacyEmailLocked : A.legacyPurgeAria(tag.label, name)}
                        aria-label={locked ? `${A.legacyPurgeAria(tag.label, name)}. ${A.legacyEmailLocked}` : A.legacyPurgeAria(tag.label, name)}
                        onClick={() => confirm({ title: tag.confirm(name), run: () => vm.purgeLegacy(user, tag.field) })}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </span>
              </div>
            ) : null}

            {user.anomalies.includes('stray-photo') ? (
              <div className="admin-gist-drift is-severe" role="group" aria-label={A.strayPhoto.title}>
                <span className="admin-field-label">{A.strayPhoto.title}</span>
                <p className="admin-card-note">{A.strayPhoto.hint}</p>
                <button
                  type="button"
                  className="btn btn-secondary adm-sm"
                  disabled={busy || vm.clearingStrayPhotos}
                  onClick={() => confirm({ title: A.strayPhoto.confirm(name), run: () => vm.clearStrayPhoto(user) })}
                >
                  {busy ? A.working : A.strayPhoto.btn}
                </button>
              </div>
            ) : null}

            {/* Deriva de gist: de dónde sale y cuántos canales hay. Sin acción posible desde aquí. */}
            {user.anomalies.includes('gist-drift') ? (
              <div className="admin-gist-drift is-severe" role="group" aria-label={A.gist.driftTitle}>
                <span className="admin-field-label">{A.gist.driftTitle}</span>
                <p className="admin-card-note">{A.gist.driftHint}</p>
                <dl className="admin-user-data">
                  <div>
                    <dt>{A.gist.profileGist}</dt>
                    <dd>{user.socialGistId ? A.gist.profileGistOwn : A.gist.profileGistPurged}</dd>
                  </div>
                  <div>
                    <dt>{A.gist.friendGist}</dt>
                    <dd>{describeChannels(user.friendSocialGistIds.length, A.field.channelNone)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {/* Identidad denormalizada rancia: sus amigos le ven con el nombre o la foto de cuando se hicieron amigos. */}
            {identityIsStale ? (
              <div className="admin-gist-drift" role="group" aria-label={A.healIdentity.title}>
                <span className="admin-field-label">
                  {staleNames.length > 0 && photoIsStale
                    ? A.healIdentity.titleBoth
                    : staleNames.length > 0
                      ? A.healIdentity.titleName
                      : A.healIdentity.titlePhoto}
                </span>
                <p className="admin-card-note">{A.healIdentity.hint}</p>
                {staleNames.length > 0 ? (
                  <>
                    <dl className="admin-user-data">
                      <div><dt>{A.field.profileNameSource}</dt><dd>{user.displayName.trim()}</dd></div>
                      <div><dt>{A.field.staleFriendNames}</dt><dd>{staleNames.join(', ')}</dd></div>
                    </dl>
                    <p className="admin-warning">{A.field.nameMismatchHint}</p>
                    {/* DESEMPATE A MANO: los nombres en circulación, cada uno con su origen. */}
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
                              className="btn btn-secondary adm-sm"
                              disabled={busy}
                              aria-label={A.chooseName.btnAria(option.value, name)}
                              onClick={() =>
                                confirm({
                                  title: A.chooseName.confirm(name, option.value),
                                  run: () => vm.chooseDisplayName(user, option.value),
                                })
                              }
                            >
                              {`${A.chooseName.btn(option.value)} (${option.origin})`}
                            </button>
                          ))}
                      </div>
                    </div>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary adm-sm"
                  disabled={busy}
                  onClick={() =>
                    confirm({
                      // El nombre exacto que se va a escribir, solo cuando el nombre es lo que está en disputa.
                      title:
                        staleNames.length > 0
                          ? A.healIdentity.confirmWithName(name, user.displayName.trim() || user.knownAs.trim())
                          : A.healIdentity.confirmPhoto(name),
                      run: () => vm.healIdentity(user),
                    })
                  }
                >
                  {busy ? A.working : staleNames.length > 0 ? A.healIdentity.btn : A.healIdentity.btnPhoto}
                </button>
              </div>
            ) : null}

            {user.stalePendingOut > 0 && user.fossilPendingOut === 0 ? (
              <div className="admin-gist-drift" role="group" aria-label={A.field.stalePending}>
                <span className="admin-field-label">{A.field.stalePending}</span>
                <p className="admin-card-note">{A.field.stalePendingDetail(user.stalePendingOut, user.fossilPendingOut)}</p>
              </div>
            ) : null}

            {/* Solicitudes que envió y nadie aceptó en 180 días: el botón solo cuando hay alguna purgable. */}
            {user.fossilPendingOut > 0 ? (
              <div className="admin-gist-drift" role="group" aria-label={A.fossil.title}>
                <span className="admin-field-label">{A.fossil.title}</span>
                <p className="admin-card-note">{A.fossil.hint}</p>
                <button
                  type="button"
                  className="btn btn-danger adm-sm"
                  disabled={busy}
                  onClick={() => confirm({ title: A.fossil.confirm(name, user.fossilPendingOut), run: () => vm.purgeFossilRequests(user) })}
                >
                  {busy ? A.working : A.fossil.btn(user.fossilPendingOut)}
                </button>
              </div>
            ) : null}

            {/* Cutover de identidad: el documento no vive en `profiles/{uid}`. */}
            {user.anomalies.includes('foreign-doc-id') ? (
              <div className="admin-gist-drift" role="group" aria-label={A.cutover.title}>
                <span className="admin-field-label">{A.cutover.title}</span>
                <p className="admin-card-note">{A.cutover.hint}</p>
                <dl className="admin-user-data">
                  <div>
                    <dt>{A.cutover.targetLabel}</dt>
                    <dd>{cutoverTargetKnown ? A.cutover.targetCanonical : A.field.none}</dd>
                  </div>
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
                  className="btn btn-secondary adm-sm"
                  disabled={busy || !cutoverTargetKnown}
                  title={cutoverTargetKnown ? undefined : A.cutover.unknownUid}
                  aria-label={cutoverTargetKnown ? A.cutover.btn : `${A.cutover.btn}. ${A.cutover.unknownUid}`}
                  onClick={() => confirm({ title: A.cutover.confirm(name), run: () => vm.migrateIdentity(user) })}
                >
                  {busy ? A.working : A.cutover.btn}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="adm-section" aria-label={D.sections.tier}>
          <h4>{D.sections.tier}</h4>
          {/* Sin modal: cambiar el rango es reversible de un clic y no destruye nada. */}
          <div className="adm-seg" role="group" aria-label={A.tier.selectAria(name)}>
            {PROFILE_TIERS.map((tier: ProfileTier) => {
              // Mithril solo en la fila del propio admin; se pinta deshabilitado para que se vea que existe.
              const reserved = tier === ADMIN_ONLY_TIER && user.uid !== vm.ownUid;
              return (
                <button
                  key={tier}
                  type="button"
                  className={`tier-${tier}`}
                  aria-pressed={user.tier === tier}
                  disabled={busy || reserved}
                  title={reserved ? A.tier.reservedHint : undefined}
                  onClick={() => {
                    if (user.tier !== tier) void vm.changeTier(user, tier);
                  }}
                >
                  <span className="adm-dot" aria-hidden="true" />
                  {PROFILE_TIER_LABELS[tier]}
                </button>
              );
            })}
          </div>
        </section>

        {/* Lo que ha publicado ESTA persona: la pregunta siempre es esa, no «qué enlaces hay en total». */}
        <section className="adm-section" aria-label={D.sections.shares}>
          <h4>{D.sections.shares}</h4>
          <AdminUserShares
            uid={user.uid}
            shares={userShares}
            banned={data.shares.banned.has(user.uid)}
            tier={user.tier}
            quota={quota}
            hasOverride={hasQuotaOverride}
            onConfirm={(request: ShareActionRequest) => confirm({ title: request.title, run: () => request.run() })}
            onRemove={(token) => runShareAction(async () => {
              await adminRemoveShare(token);
              return ADMIN_SHARES_UI.removed;
            }, target)}
            onBan={(uid, options) => runShareAction(async () => {
              const purged = await banUser(uid, options);
              return ADMIN_SHARES_UI.banned(purged);
            }, target)}
            onUnban={(uid) => runShareAction(async () => {
              await unbanUser(uid);
              return ADMIN_SHARES_UI.unbanned;
            }, target)}
            onQuota={(uid, values) => runShareAction(async () => {
              await setQuotaOverride(uid, values);
              return ADMIN_SHARES_UI.quotaSet;
            }, target)}
            onQuotaClear={(uid) => runShareAction(async () => {
              await clearQuotaOverride(uid);
              return ADMIN_SHARES_UI.quotaCleared;
            }, target)}
          />
        </section>

        <section className="adm-section" aria-label={D.sections.data}>
          <h4>{D.sections.data}</h4>
          <dl className="adm-rows">
            {/* De Firebase Auth, no del perfil (que no lo lleva: lo lee cualquiera con sesión). Sin la lectura de Auth, no sale. */}
            {email ? <div><dt>{D.email}</dt><dd>{email}</dd></div> : null}
            <div><dt>{A.field.friends}</dt><dd>{user.friends}</dd></div>
            {user.pendingOut > 0 ? <div><dt>{A.field.pendingOut}</dt><dd>{user.pendingOut}</dd></div> : null}
            {user.pendingIn > 0 ? <div><dt>{A.field.pendingIn}</dt><dd>{user.pendingIn}</dd></div> : null}
            <div>
              <dt>{A.field.photo}</dt>
              <dd className={`admin-photo-state is-${photoState.kind}`} title={photoState.hint}>{photoState.label}</dd>
            </div>
            {user.socialGistId ? <div><dt>{A.field.socialGist}</dt><dd>{A.field.socialGistPresent}</dd></div> : null}
            <div>
              <dt>{A.field.friendGamesGists}</dt>
              <dd>{describeChannels(user.friendGamesGistIds.length, A.field.listsNone)}</dd>
            </div>
            {legacyTags.length === 0 ? <div><dt>{A.legacyAria}</dt><dd>{A.legacyNone}</dd></div> : null}
          </dl>
          <div className="adm-actions">
            <Link className="btn btn-open adm-sm" to={`/social/profiles/${encodeURIComponent(user.uid)}`}>
              {D.openProfile}
              <Icon name="angle-right" className="ui-icon btn-open-go" />
            </Link>
            <a
              className="btn btn-secondary adm-sm"
              href={FIREBASE_AUTH_CONSOLE}
              target="_blank"
              rel="noreferrer noopener"
              title={D.openAuthHint}
              onClick={() => void copyUid(user.uid)}
            >
              {D.openAuth}
            </a>
          </div>
        </section>

        <section className="adm-section adm-danger-zone" aria-label={D.sections.more}>
          <h4>{D.sections.more}</h4>
          <div className="adm-actions">
            <button
              type="button"
              className="btn btn-secondary adm-sm"
              disabled={busy}
              onClick={() =>
                confirm({
                  title: user.socialEnabled ? A.confirmDisable(name) : A.confirmEnable(name),
                  run: () => vm.toggleSocial(user),
                  tone: user.socialEnabled ? 'danger' : 'primary',
                })
              }
            >
              {busy ? A.working : user.socialEnabled ? A.disableBtn : A.enableBtn}
            </button>
            <button
              type="button"
              className="btn btn-secondary adm-sm"
              disabled={busy}
              onClick={() => confirm({ title: A.achievementsConfirm(name), run: () => vm.clearAchievements(user) })}
            >
              {A.achievementsBtn}
            </button>
            <button
              type="button"
              className="btn btn-danger adm-sm"
              disabled={busy}
              onClick={() =>
                confirm({
                  title: A.confirmDelete(name),
                  body: A.deleteScope,
                  typeToConfirm: name,
                  confirmLabel: A.deleteBtn,
                  run: async () => {
                    await vm.deleteUser(user);
                    onClose();
                  },
                })
              }
            >
              <Icon name="trash" />
              {A.deleteBtn}
            </button>
          </div>
        </section>
      </aside>
    </>
  );
});
