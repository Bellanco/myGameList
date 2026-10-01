import { memo, useState, useSyncExternalStore } from 'react';
import { COMMON_ICONS } from '../../core/constants/icons';
import { UI_MESSAGES } from '../../core/constants/labels';
import { IMPORT_UI as IMPORT_TEXTS } from '../../core/constants/importLabels';
import { SETTINGS_UI } from '../../core/constants/settingsLabels';
import { TOUR_CARD } from '../../core/constants/onboardingCardLabels';
import { isTourVisible, offeredTour, parseTourState } from '../../core/onboarding/tourState';
import { onboardingStore, saveTourState } from '../../model/repository/onboardingStore';
import { useGithubConnection } from '../../viewmodel/sync/githubConnection';
import { FilePickerButton } from './FilePickerButton';
import { Icon } from './Icon';
import { PlayniteNote } from './import/PlayniteNote';
import { ImportGuides } from './import/ImportGuides';
import { GithubSyncCard } from './sync/GithubSyncCard';
// La hoja de las pantallas de Ajustes viaja en los chunks perezosos que la usan y no en el bundle base (mismo
// patrón que `stats.scss` y `social.scss`). Se importa desde CADA pantalla que la necesita: si se importara solo
// desde una, entrar por otra ruta la dejaría sin estilo.
import '../../styles/settings.scss';

// El botón de importar dice lo mismo que el de la lista vacía, que viaja en el arranque (`labels.ts`); el título
// y la nota de la tarjeta solo salen aquí (`importLabels`).
const IMPORT_BUTTON = UI_MESSAGES.import.integrations;
const IMPORT_CARD = IMPORT_TEXTS.integrations;

interface SettingsHubProps {
  onExport: () => void;
  onImport: (file: File, overwrite: boolean) => void;
  /** Archivo JSON de «Playnite Library Exporter»: App lo parsea, lo mete en la bandeja y avisa. */
  onImportLibrary: (file: File) => void;
  /** Nº de juegos esperando en la bandeja (el acceso solo se ofrece si hay alguno). */
  inboxCount: number;
  onOpenInbox: () => void;
}

/**
 * «Integración» — todo lo que entra y sale de la aplicación: la sincronización con GitHub, la importación de
 * la biblioteca y las copias de seguridad.
 *
 * Aquí vivió también el editor de etiquetas, y compartir componente salía caro por los dos lados: esta
 * pantalla cargaba con aquel editor y la de filtros arrastraba todo esto —veinte props incluidas— sin usar
 * nada. Separadas, el chunk de cada una trae solo lo que pinta.
 */
export const SettingsHub = memo(function SettingsHub({
  onExport,
  onImport,
  onImportLibrary,
  inboxCount,
  onOpenInbox,
}: SettingsHubProps) {
  const [overwriteImport, setOverwriteImport] = useState(false);
  // La conexión con GitHub la ofrece `App` a todo el árbol: la misma que usa la pasarela del hub social, para
  // que conectar sea el mismo acto en las dos pantallas y no dos formularios que hay que mantener a la par.
  const githubConnection = useGithubConnection();

  return (
    <section className="settings-hub" aria-label={SETTINGS_UI.groups.integration.title}>
      {/* Importación de la biblioteca. Vivía en una pantalla aparte (`/integraciones`) a la que esta tarjeta solo
          sabía navegar; ahora la acción está donde se busca, con su manual al lado. */}
      {/* PRIMERO QUÉ HACE Y EL BOTÓN; el detalle, debajo. Antes esta tarjeta abría con cinco frases seguidas y
          el botón quedaba al final: para importar había que atravesar el muro, y quien ya sabía lo que quería
          lo atravesaba cada vez. */}
      {/* EL ORDEN ES EL DE QUIEN NO SABE TODAVÍA: qué hace esto, qué necesitas, de dónde lo trae, cómo se hace
          y —al final— el botón. Puesto arriba, el botón pedía elegir un fichero a quien aún no sabía qué fichero
          era ni de dónde salía; lo que se gana leyendo primero no lo compensa un clic ahorrado. */}
      <div className="settings-card settings-card-import" style={{ gridColumn: '1 / -1' }} data-tour="import-card">
        <h2>{IMPORT_CARD.title}</h2>
        <p className="settings-card-sub">{IMPORT_CARD.note}</p>

        <PlayniteNote />

        <ImportGuides />

        <div className="settings-actions-lead settings-actions-end">
          <FilePickerButton
            id="import-library-settings"
            className="btn btn-primary"
            label={IMPORT_BUTTON.importBtn}
            ariaLabel={IMPORT_BUTTON.importAria}
            accept=".json,application/json"
            onPick={onImportLibrary}
          />
          {inboxCount > 0 ? (
            <button type="button" className="btn btn-secondary btn-accent" onClick={onOpenInbox}>
              <Icon name={COMMON_ICONS.download} />
              <span>{IMPORT_BUTTON.viewInbox(inboxCount)}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* LA CONEXIÓN CON GITHUB, en el componente que también monta la pasarela del hub social. Estaba escrita
          aquí dentro —y solo aquí—, que es lo que obligaba a quien venía de social a cruzar hasta esta pantalla
          para crear su cuenta y volver luego a mano. Ver `GithubSyncCard`. */}
      {githubConnection ? <GithubSyncCard connection={githubConnection} variant="settings" /> : null}

      <div className="settings-card settings-card-backup">
        <h2>{SETTINGS_UI.backup.title}</h2>
        <p className="settings-card-sub">{SETTINGS_UI.backup.description}</p>

        <div className="settings-backup-row">

          <div className="settings-backup-actions">
            <button className="btn btn-secondary" type="button" onClick={onExport}>
              <Icon name={COMMON_ICONS.download} />
              <span>{SETTINGS_UI.backup.exportBtn}</span>
            </button>
            <FilePickerButton
              id="import-backup-settings"
              className="btn btn-secondary"
              label={SETTINGS_UI.backup.importBtn}
              ariaLabel={SETTINGS_UI.backup.importAriaLabel}
              accept=".json"
              onPick={(file) => onImport(file, overwriteImport)}
            />
          </div>
        </div>

        <label className="settings-backup-toggle">
          <input
            type="checkbox"
            checked={overwriteImport}
            onChange={(event) => setOverwriteImport(event.target.checked)}
          />
          <span className="settings-backup-toggle-track">
            <span className="settings-backup-toggle-thumb" />
          </span>
          <span className="settings-backup-toggle-label">
            {SETTINGS_UI.backup.overwriteLabel}
          </span>
        </label>

        {/* El aviso solo cuando el interruptor está puesto: enseñarlo siempre gasta sitio y asusta a quien
            solo venía a exportar. Cuando se enciende, es exactamente lo que hay que leer. */}
        {overwriteImport ? (
          <div className="settings-backup-warning">
            {SETTINGS_UI.backup.overwriteHint}
          </div>
        ) : null}
      </div>

      <OnboardingCard />
    </section>
  );
});

/**
 * «PRIMEROS PASOS»: la guía, para quien la quiera ver o repetir. Es la única puerta para quien ya usaba la
 * aplicación —a esa persona la guía no se le ofrece sola— y la vuelta para quien la cerró.
 *
 * Abrirla con la guía a medias despliega su lista de misiones; abrirla sin guía, o ya terminada, la ofrece desde
 * el principio. La guía se monta en cuanto cambia el estado (lo escucha `App`), aquí mismo, en Datos.
 */
function OnboardingCard() {
  const raw = useSyncExternalStore(onboardingStore.subscribe, onboardingStore.get, onboardingStore.get);
  const state = parseTourState(raw || null);
  const inProgress = state !== null && isTourVisible(state);
  const finished = state?.status === 'done';

  const open = () => {
    saveTourState(inProgress && state ? { ...state, status: 'menu' } : offeredTour());
  };

  return (
    // A lo ancho, como la de importar: sola en su fila, la regla de escritorio la dejaría en cinco columnas de doce.
    <div className="settings-card settings-card-onboarding" style={{ gridColumn: '1 / -1' }}>
      <h2>{TOUR_CARD.title}</h2>
      <p className="settings-card-sub">{finished ? TOUR_CARD.doneNote : TOUR_CARD.text}</p>
      <button type="button" className="btn btn-secondary settings-onboarding-btn" onClick={open}>
        {inProgress ? TOUR_CARD.resume : finished ? TOUR_CARD.repeat : TOUR_CARD.open}
      </button>
    </div>
  );
}
