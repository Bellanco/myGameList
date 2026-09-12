import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminAnnouncement } from '../view/components/AdminAnnouncement';
import { loadAnnouncement, saveAnnouncement } from '../model/repository/announcementRepository';
import type { Announcement } from '../core/announcement/announcement';

/**
 * EL AVISO A LOS USUARIOS, EN LOCAL Y SIN PASAR POR LA PUERTA DEL PANEL (`/dev/aviso`).
 *
 * Solo en desarrollo: `App` monta esta ruta dentro de un `import.meta.env.DEV`, así que en producción el
 * empaquetador se lleva por delante el `import()` y la ruta entera. No existe en la web publicada.
 *
 * POR QUÉ EXISTE, y no es comodidad: en local NO hay Firebase. Las claves `VITE_FIREBASE_*` solo están en el
 * entorno de despliegue, así que `npm run dev` corre sin sesión, `/admin` rebota a las listas —su guarda pide el
 * correo del administrador— y el aviso era lo único del evolutivo que no se podía tocar en la propia máquina.
 * Para redactar el texto, ver la cápsula y afinarlo hacía falta desplegar, que es justo lo que no se quiere
 * hacer con algo que va a salirle a todo el mundo.
 *
 * ⚑ NO ABRE NINGUNA PUERTA. No toca la guarda de `/admin` ni el `access` de `useAdminViewModel`: esto es una
 * ruta aparte que en producción no se compila. Y lo que escribe no viaja a ningún sitio: el servidor de
 * desarrollo atiende `/api/announcement` con un fichero local ignorado por git (ver el plugin
 * `local-announcement-api` en `vite.config.ts`), así que el aviso que se redacta aquí se queda en este
 * ordenador y no le llega a nadie hasta que se publique de verdad desde `/admin`.
 *
 * ES LA MISMA PANTALLA que ve el administrador (`AdminAnnouncement`), no una versión de juguete: si aquí se ve
 * bien, en el panel se ve bien.
 */
export function DevAnnouncementScreen() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAnnouncement(true)
      .then((value) => {
        if (cancelled) return;
        setCurrent(value);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: Announcement): Promise<Announcement> => {
    const saved = await saveAnnouncement(next);
    setCurrent(saved);
    return saved;
  }, []);

  // Hasta que llega la lectura no se monta: el formulario abre con lo que hay publicado, y montarlo vacío para
  // rellenarlo un instante después haría perder lo que se estuviera escribiendo.
  if (!ready) return null;

  return <AdminAnnouncement current={current} onSave={save} onBack={() => navigate('/completados')} />;
}
