import { useEffect, useState } from 'react';
import { isOffline } from '../../core/utils/network';

/**
 * ¿Hay conexión AHORA MISMO? Se suscribe a los eventos `online`/`offline` del navegador.
 *
 * Sirve para dos cosas distintas y ambas importan: contar al usuario por qué la parte social se ha quedado quieta
 * (en vez de dejarle un error de red en crudo) y reaccionar cuando la red vuelve, sin que tenga que recargar.
 *
 * Estado INICIAL desde `navigator.onLine`, no `true` por defecto: quien abre la aplicación ya sin red tiene que ver
 * el aviso en el primer render, no tras el primer fallo.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => !isOffline());

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Reconciliación al montar: entre el estado inicial y este efecto la red puede haber cambiado (pestaña que
    // vuelve del segundo plano, hub social que se monta perezosamente minutos después del arranque).
    setOnline(!isOffline());
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
