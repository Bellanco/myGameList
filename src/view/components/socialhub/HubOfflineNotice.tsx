import { Notice } from '../Notice';
import { SOCIAL_UI } from '../../../core/constants/socialLabels';
import { usePalette } from '../../hooks/usePalette';

/**
 * Aviso de FALTA DE CONEXIÓN del espacio social.
 *
 * Sustituye a lo que se veía antes: el error de red de la librería que hubiera fallado primero (`network offline`,
 * `Failed to fetch`, «Failed to get document because the client is offline»), en inglés y sin decir qué hacer.
 * Aquí se cuenta con las palabras de la aplicación y, sobre todo, con las del TEMA —igual que las dos pantallas de
 * error—, y se dice lo único que importa: lo que se ve es lo último guardado aquí, y se actualizará solo.
 *
 * Es persistente a propósito, no un mensaje de los que se borran a los tres segundos: la condición que lo motiva
 * dura hasta que vuelve la red, así que el aviso también.
 */
export function HubOfflineNotice({ hasCachedData }: { hasCachedData: boolean }) {
  // La paleta, del store de preferencias y no del `dataset` del <html>: así el titular cambia con el tema sin
  // esperar a un remontaje (que es lo que hacen los boundaries, donde no hay más render que el del fallback).
  const { palette } = usePalette();

  return (
    <Notice
      inline
      tone="warn"
      icon="cloud-sync"
      role="status"
      aria-label={SOCIAL_UI.offline.sectionAria}
      kicker={SOCIAL_UI.offline.badge}
      title={SOCIAL_UI.offline.leadByPalette[palette]}
    >
      {hasCachedData ? SOCIAL_UI.offline.body : SOCIAL_UI.offline.bodyEmpty}
    </Notice>
  );
}
