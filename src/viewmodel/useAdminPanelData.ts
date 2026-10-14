// LO QUE EL PANEL COMPARTE ENTRE PANTALLAS y no sale del censo de Firestore (ver docs/plan-admin-rediseno.md, F1).
//
// Antes vivía todo en `AdminHub`, que era una sola pantalla. Con el panel partido en rutas, la portada necesita el
// gasto de carátulas, el estado de los retos y del aviso; la tabla y la ficha, los enlaces, vetos y ajustes de
// cuota de cada uno. Se piden UNA vez al entrar al panel y se reparten por contexto (`AdminPanelContext`), en vez de
// que cada pantalla vuelva a pedirlos al montarse.
//
// Cada fuente puede no llegar (otro Worker, otra colección): mientras falte, su valor es `null` y quien lo pinta no
// afirma nada —un cero sin datos diría que no hay ningún enlace ni ningún veto—.
import { useCallback, useEffect, useState } from 'react';
import type { Announcement } from '../core/announcement/announcement';
import type { ShareQuotaOverride } from '../core/constants/tiers';
import { listAllShares, type AdminShareRow } from '../model/repository/shareAdminRepository';
import { leerGastoDeCaratulas, type GastoDeCaratulas } from '../model/repository/coverStatsRepository';

/** Estado de los retos: solo lo que decide si hay algo que hacer allí. */
export type PremiosStatus = { stage: 'none' | 'open' | 'pending'; closesAt: number | null };

export interface AdminSharesState {
  byUser: Record<string, AdminShareRow[]>;
  banned: Set<string>;
  overrides: Record<string, ShareQuotaOverride>;
  /** Total y si la respuesta vino completa. `null` = no llegó (y entonces sus totales no se pintan). */
  summary: { total: number; complete: boolean } | null;
}

const NO_SHARES: AdminSharesState = { byUser: {}, banned: new Set(), overrides: {}, summary: null };

export function useAdminPanelData(enabled: boolean) {
  const [shares, setShares] = useState<AdminSharesState>(NO_SHARES);
  const [coverStats, setCoverStats] = useState<GastoDeCaratulas | null>(null);
  const [premiosStatus, setPremiosStatus] = useState<PremiosStatus | null>(null);
  // `undefined` = aún sin leer: la pantalla del aviso no abre el formulario sobre una foto vieja.
  const [announcement, setAnnouncement] = useState<Announcement | null | undefined>(undefined);

  const loadShares = useCallback(async () => {
    try {
      const page = await listAllShares();
      // Los enlaces de TODOS en una petición y agrupados por usuario: la tabla pinta decenas de filas y una
      // petición por fila sería absurda para un dato que cabe en una sola respuesta.
      const byUser: Record<string, AdminShareRow[]> = {};
      for (const row of page.shares) {
        (byUser[row.uid] ||= []).push(row);
      }
      setShares({
        byUser,
        banned: new Set(page.bans),
        overrides: page.overrides,
        summary: { total: page.shares.length, complete: page.complete },
      });
    } catch {
      // Sin enlaces que enseñar, el resto del panel sigue siendo útil: no se rompe la pantalla por esto.
    }
  }, []);

  /** El aviso publicado, sin la caché del dispositivo: aquí se está a punto de reescribirlo. */
  const loadAnnouncement = useCallback(async () => {
    try {
      const module = await import('../model/repository/announcementRepository');
      setAnnouncement(await module.loadAnnouncement(true));
    } catch {
      // Sin documento (o sin red) se abre en blanco, que es lo que hay: un aviso por escribir.
      setAnnouncement(null);
    }
  }, []);

  /** Los retos, que cambia su propia pantalla: se releen al volver a la portada. Es UN documento. */
  const loadPremiosStatus = useCallback(async () => {
    try {
      const [season, schedule] = await Promise.all([
        import('../model/repository/premios/premiosSeasonRepository'),
        import('../core/premios/votingSchedule'),
      ]);
      const config = await season.fetchVotingConfig();
      setPremiosStatus({ stage: schedule.getSeasonStage(config), closesAt: config?.closesAtMillis ?? null });
    } catch {
      // Sin lectura, sin línea: no se afirma nada.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void loadShares();
    /* Una vez al abrir el panel: es un contador que se mueve despacio —lotes de 50— y lo que se mira es si el día se
       está llenando, no el número al segundo. */
    void leerGastoDeCaratulas().then(setCoverStats);
    void loadAnnouncement();
    void loadPremiosStatus();
  }, [enabled, loadShares, loadAnnouncement, loadPremiosStatus]);

  return {
    shares,
    loadShares,
    coverStats,
    premiosStatus,
    loadPremiosStatus,
    announcement,
    setAnnouncement,
    loadAnnouncement,
  };
}

export type AdminPanelData = ReturnType<typeof useAdminPanelData>;
