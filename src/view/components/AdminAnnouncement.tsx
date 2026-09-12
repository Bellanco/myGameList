import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ADMIN_ANNOUNCEMENT_UI } from '../../core/constants/adminLabels';
import {
  ANNOUNCEMENT_ICONS,
  ANNOUNCEMENT_LIMITS,
  DEFAULT_ANNOUNCEMENT_ICON,
  DEFAULT_INTERVAL_HOURS,
  DEFAULT_REPEATS,
  type Announcement,
  type AnnouncementIcon as IconId,
} from '../../core/announcement/announcement';
import { isValidHttpUrl } from '../../core/security/sanitize';
import { AnnouncementToast } from './AnnouncementToast';
import { AnnouncementIcon, AnnouncementSprite } from './AnnouncementSprite';
import { HubBackButton } from './socialhub/HubBackButton';
// LA HOJA DEL PANEL SE IMPORTA AQUÍ, atada a la pantalla que la usa, y no se da por hecho que la haya traído
// `AdminHub`. Es el fallo mudo de siempre (§12): esta pantalla se monta también desde la ruta de desarrollo
// `/dev/aviso`, y colgando de otro componente salía SIN ESTILOS y sin que nada lo avisara — campos a todo lo
// ancho, las ayudas pegadas al rótulo siguiente y los botones debajo de la barra. Vite la emite en cada chunk
// que de verdad pinta esta pantalla.
import '../../styles/admin.scss';

const A = ADMIN_ANNOUNCEMENT_UI;

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * LA PANTALLA DONDE SE ESCRIBE EL AVISO (`/admin` → «Aviso a los usuarios»).
 *
 * ES LA ÚNICA VISTA DEL PANEL QUE ESCRIBE UN TEXTO QUE VA A LEER TODO EL MUNDO —el censo modera y el catálogo de
 * logros se lee—, y de ahí las dos decisiones que la gobiernan:
 *
 *  · **LA MUESTRA ES LA CÁPSULA DE VERDAD.** No un dibujo parecido: el mismo componente que se le va a pintar a
 *    la gente (`AnnouncementToast` en modo `preview`), con el tema y la paleta que tenga puestos quien escribe.
 *    Un título que no cabe se ve aquí, no en la primera queja.
 *
 *  · **GUARDAR Y VOLVER A PUBLICAR SON DOS BOTONES.** La diferencia no es de matiz: la cuenta de veces vistas de
 *    cada dispositivo cuelga del `id` de la campaña, así que cambiarlo se lo vuelve a enseñar a TODO el mundo,
 *    incluido quien ya pulsó el enlace. Un solo botón «guardar» que a veces hiciera eso sería una trampa; con
 *    dos, corregir una errata no le grita a nadie.
 *
 * TODO LO QUE SE ESCRIBE PASA POR `sanitizeAnnouncement` AL GUARDAR (en el repositorio), que es donde se recorta
 * y se valida de verdad. Aquí se comprueba lo justo para no dejar pulsar un botón que va a fallar.
 */

interface AdminAnnouncementProps {
  /** El aviso que hay ahora mismo en Firestore, o `null` si no hay ninguno. */
  current: Announcement | null;
  /** Guarda y devuelve lo que de verdad ha quedado escrito. Si falla, LANZA: esta pantalla lo dice. */
  onSave: (next: Announcement) => Promise<Announcement>;
  onBack: () => void;
}

/** Identificador de campaña. La hora en base 36: corto, único de sobra y legible en el panel. */
function newCampaignId(): string {
  return `av-${Date.now().toString(36)}`;
}

function draftFrom(current: Announcement | null) {
  return {
    id: current?.id || '',
    kicker: current?.kicker || '',
    title: current?.title || '',
    body: current?.body || '',
    url: current?.url || '',
    icon: (current?.icon || DEFAULT_ANNOUNCEMENT_ICON) as IconId,
    active: current?.active ?? true,
    repeats: String(current?.repeats ?? DEFAULT_REPEATS),
    intervalHours: String(current?.intervalHours ?? DEFAULT_INTERVAL_HOURS),
  };
}

/**
 * UN CAMPO CON SU CONTADOR DEBAJO, el mismo que lleva la reseña al crear o editar un juego
 * (`.field-footer` + `.tag-hint`, ver `FormModal`): el conteo va PEGADO al campo y a la derecha, se pone ámbar al
 * 90 % y rojo al llegar al tope. Aquí importa más que en una reseña, porque estos textos no se recortan con
 * puntos suspensivos en un párrafo: se quedan fuera de una cápsula de 30 rem.
 */
function Field({ label, help, count, max, children }: {
  label: string;
  help?: string;
  count: number;
  max: number;
  children: ReactNode;
}) {
  const parte = max > 0 ? (count / max) * 100 : 0;
  const aviso = parte >= 100 ? 'has-error' : parte >= 90 ? 'has-warning' : '';

  return (
    <label className="admin-ann-field">
      <span>{label}</span>
      {children}
      <div className="field-footer">
        {help ? <small className="tag-hint">{help}</small> : <span />}
        <small className={`tag-hint ${aviso}`.trim()}>{A.counter(count, max)}</small>
      </div>
    </label>
  );
}

export function AdminAnnouncement({ current, onSave, onBack }: AdminAnnouncementProps) {
  const [draft, setDraft] = useState(() => draftFrom(current));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const set = useCallback(<K extends keyof ReturnType<typeof draftFrom>>(
    key: K,
    value: ReturnType<typeof draftFrom>[K],
  ) => {
    setNotice('');
    setDraft((previous) => ({ ...previous, [key]: value }));
  }, []);

  const titleOk = draft.title.trim().length > 0;
  const urlOk = isValidHttpUrl(draft.url.trim());
  const canSave = titleOk && urlOk && !busy;

  /** Lo que se va a escribir, que es también lo que pinta la muestra: una cosa, no dos que puedan separarse. */
  const composed = useMemo<Announcement>(() => ({
    id: draft.id || newCampaignId(),
    kicker: draft.kicker.trim(),
    title: draft.title.trim(),
    body: draft.body.trim(),
    url: draft.url.trim(),
    icon: draft.icon,
    active: draft.active,
    repeats: Number(draft.repeats) || DEFAULT_REPEATS,
    intervalHours: Number(draft.intervalHours) || DEFAULT_INTERVAL_HOURS,
    updatedAt: Date.now(),
  }), [draft]);

  /**
   * LO QUE PINTA LA MUESTRA. Es `composed` con los huecos rellenos: mientras el título está vacío, la cápsula se
   * quedaba en un disco con la palabra «AVISO» al lado y no había forma de juzgar si el texto va a caber, que es
   * justo para lo que está la muestra. Los marcadores NO se guardan: solo viven aquí.
   */
  const sample = useMemo<Announcement>(() => ({
    ...composed,
    title: composed.title || A.sampleTitle,
    body: composed.body || (composed.title ? '' : A.sampleBody),
  }), [composed]);

  const run = useCallback(async (next: Announcement, done: string) => {
    setBusy(true);
    setNotice(A.saving);
    try {
      const saved = await onSave(next);
      setDraft(draftFrom(saved));
      setNotice(done);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : A.failed);
    } finally {
      setBusy(false);
    }
  }, [onSave]);

  const save = useCallback(() => {
    void run({ ...composed, id: draft.id || newCampaignId() }, A.saved);
  }, [composed, draft.id, run]);

  const republish = useCallback(() => {
    // La confirmación es del navegador a propósito: es una pregunta de una línea en una pantalla que solo ve el
    // administrador, y montar el modal de confirmación aquí traería su chunk por una frase.
    if (!window.confirm(A.republishConfirm)) return;
    void run({ ...composed, id: newCampaignId(), active: true }, A.savedNew);
  }, [composed, run]);

  const toggleActive = useCallback(() => {
    const active = !draft.active;
    void run({ ...composed, id: draft.id || newCampaignId(), active }, active ? A.saved : A.retired);
  }, [composed, draft.active, draft.id, run]);

  return (
    <section className="admin-hub admin-ann" aria-label={A.sectionAria}>
      {/* Los dibujos de la rejilla no están en el sprite del arranque: viajan con esta pantalla. */}
      <AnnouncementSprite />
      <div className="admin-ann-bar">
        <HubBackButton onBack={onBack} label={A.back} />
      </div>

      <div className="admin-card">
        <h2>{A.title}</h2>
        <p className="admin-card-sub">{A.subtitle}</p>
        {A.notes.map((note) => <p className="admin-card-note" key={note}>{note}</p>)}

        <p className="admin-card-note">
          {!current
            ? A.currentNone
            : [
              current.active ? A.currentOn : A.currentOff,
              A.currentSaved(current.updatedAt ? DATE_FORMAT.format(new Date(current.updatedAt)) : '—'),
              A.currentId(current.id),
            ].join(' · ')}
        </p>
      </div>

      <div className="admin-card">
        <h3>{A.previewTitle}</h3>
        <p className="admin-card-note">{A.previewNote}</p>
        {/* La muestra necesita un título y un enlace para tener sentido; sin ellos se enseña igual con lo que
            haya escrito, que es lo que deja ver cómo va quedando mientras se escribe. */}
        <AnnouncementToast announcement={sample} preview />
      </div>

      <div className="admin-card admin-ann-form">
        <Field
          label={A.field.kicker}
          help={A.field.kickerHelp}
          count={draft.kicker.length}
          max={ANNOUNCEMENT_LIMITS.kicker}
        >
          <input
            type="text"
            className="finput"
            value={draft.kicker}
            maxLength={ANNOUNCEMENT_LIMITS.kicker}
            onChange={(event) => set('kicker', event.target.value)}
          />
        </Field>

        <Field
          label={A.field.title}
          help={A.field.titleHelp}
          count={draft.title.length}
          max={ANNOUNCEMENT_LIMITS.title}
        >
          <input
            type="text"
            className="finput"
            value={draft.title}
            maxLength={ANNOUNCEMENT_LIMITS.title}
            onChange={(event) => set('title', event.target.value)}
          />
        </Field>

        <Field
          label={A.field.body}
          help={A.field.bodyHelp}
          count={draft.body.length}
          max={ANNOUNCEMENT_LIMITS.body}
        >
          <textarea
            className="finput"
            rows={2}
            value={draft.body}
            maxLength={ANNOUNCEMENT_LIMITS.body}
            onChange={(event) => set('body', event.target.value)}
          />
        </Field>

        <label className="admin-ann-field">
          <span>{A.field.url}</span>
          <input
            type="url"
            className="finput"
            inputMode="url"
            placeholder="https://"
            value={draft.url}
            maxLength={ANNOUNCEMENT_LIMITS.url}
            onChange={(event) => set('url', event.target.value)}
          />
          <small className="tag-hint">{A.field.urlHelp}</small>
        </label>

        {/* EL ICONO SE ELIGE VIÉNDOLO. Era un desplegable con dieciséis nombres, y el nombre de un dibujo no
            dice cómo queda dentro del disco: había que elegir a ciegas, guardar y mirar la muestra. La rejilla
            enseña los dieciséis a la vez y el elegido se marca; el nombre sigue estando para quien no ve el
            dibujo (`aria-label` y `title`). */}
        <fieldset className="admin-ann-icons">
          <legend>{A.field.icon}</legend>
          <div className="admin-ann-icon-grid">
            {ANNOUNCEMENT_ICONS.map((icon) => (
              <button
                type="button"
                key={icon}
                className={`admin-ann-icon${draft.icon === icon ? ' is-picked' : ''}`}
                aria-pressed={draft.icon === icon}
                aria-label={A.iconNames[icon] || icon}
                title={A.iconNames[icon] || icon}
                onClick={() => set('icon', icon)}
              >
                <AnnouncementIcon name={icon} />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="admin-ann-pair">
          <label className="admin-ann-field">
            <span>{A.field.repeats}</span>
            <input
              type="number"
              className="finput"
              min={1}
              max={ANNOUNCEMENT_LIMITS.repeats}
              step={1}
              value={draft.repeats}
              onChange={(event) => set('repeats', event.target.value)}
            />
            <small>{A.field.repeatsHelp}</small>
          </label>

          <label className="admin-ann-field">
            <span>{A.field.interval}</span>
            <input
              type="number"
              className="finput"
              min={1}
              max={ANNOUNCEMENT_LIMITS.intervalHours}
              step={1}
              value={draft.intervalHours}
              onChange={(event) => set('intervalHours', event.target.value)}
            />
            <small>{A.field.intervalHelp}</small>
          </label>
        </div>

        {!titleOk ? <p className="admin-ann-warn">{A.needTitle}</p> : null}
        {draft.url.trim() && !urlOk ? <p className="admin-ann-warn">{A.needUrl}</p> : null}

        <p className="admin-card-actions">
          <button type="button" className="btn" onClick={save} disabled={!canSave}>{A.save}</button>
          <button type="button" className="btn btn-secondary" onClick={republish} disabled={!canSave}>
            {A.republish}
          </button>
          <button
            type="button"
            className={draft.active ? 'btn btn-danger' : 'btn btn-secondary'}
            onClick={toggleActive}
            disabled={!canSave}
          >
            {draft.active ? A.retire : A.turnOn}
          </button>
        </p>
        {/* EL ACUSE VA PEGADO A LOS BOTONES, y no al final de la ficha: es la respuesta a un gesto que se acaba de
            hacer ahí mismo, y debajo de las tres notas quedaba a media pantalla de distancia del botón pulsado.
            La región viva va SIEMPRE montada aunque esté vacía, igual que en `StatusBanner`: montarla junto con
            el mensaje llega tarde y no se anuncia nada. */}
        <p className="admin-ann-notice" role="status" aria-live="polite">{notice}</p>

        <p className="admin-card-note">{A.saveHelp}</p>
        <p className="admin-card-note">{A.republishHelp}</p>
        <p className="admin-card-note">{A.retireHelp}</p>
      </div>
    </section>
  );
}
