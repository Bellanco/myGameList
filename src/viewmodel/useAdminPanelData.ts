// LO QUE EL PANEL COMPARTE ENTRE PANTALLAS y no sale del censo de Firestore (ver docs/plan-admin-rediseno.md, F1).
//
// Antes vivía todo en `AdminHub`, que era una sola pantalla. Con el panel partido en rutas, la portada necesita el
// gasto de carátulas, el estado de los retos y del aviso; la tabla y la ficha, los enlaces, vetos y ajustes de
// cuota de cada uno. Se piden UNA vez al entrar al panel y se reparten por contexto (`AdminPanelContext`), en vez de
// que cada pantalla vuelva a pedirlos al montarse.
//
// Cada fuente puede no llegar (otro Worker, otra colección): mientras falte, su valor es `null` y quien lo pinta no
// afirma nada —un cero sin datos diría que no hay ningún enlace ni ningún veto—.
import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Una lectura de los retos de hace menos de esto se da por buena al volver a la portada. */
const PREMIOS_FRESH_MS = 5000;

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

  /**
   * El aviso guardado TAL CUAL (también si está programado para más adelante), sin cachés: aquí se está a punto de
   * reescribirlo, y la vista pública lo escondería fuera de su ventana.
   */
  const loadAnnouncement = useCallback(async () => {
    try {
      const module = await import('../model/repository/announcementRepository');
      setAnnouncement(await module.loadAnnouncementForAdmin());
    } catch {
      // Sin documento (o sin red) se abre en blanco, que es lo que hay: un aviso por escribir.
      setAnnouncement(null);
    }
  }, []);

  /** Los retos, que cambia su propia pantalla: se releen al volver a la portada. Es UN documento. */
  // Cuándo se pidió por última vez, y cuál es la última petición: dos lecturas a la vez (entrar al panel y volver a
  // Hoy) pueden contestar en desorden, y la que llega tarde no puede pisar a la más nueva.
  const premiosAskedAt = useRef(0);
  const premiosSeq = useRef(0);
  const loadPremiosStatus = useCallback(async () => {
    premiosAskedAt.current = Date.now();
    const seq = ++premiosSeq.current;
    try {
      const [season, schedule] = await Promise.all([
        import('../model/repository/premios/premiosSeasonRepository'),
        import('../core/premios/votingSchedule'),
      ]);
      const config = await season.fetchVotingConfig();
      if (seq !== premiosSeq.current) return;
      setPremiosStatus({ stage: schedule.getSeasonStage(config), closesAt: config?.closesAtMillis ?? null });
    } catch {
      // Sin lectura, sin línea: no se afirma nada.
    }
  }, []);

  /**
   * Lee los retos SI la última lectura no es de hace un momento. Lo usa la portada al montarse: así se leen al
   * entrar y otra vez al volver de la pantalla de los retos (donde se cierran o publican), pero no dos veces seguidas
   * por un remontaje (el modo estricto de desarrollo monta dos veces).
   */
  const refreshPremiosStatus = useCallback(() => {
    if (Date.now() - premiosAskedAt.current < PREMIOS_FRESH_MS) return;
    void loadPremiosStatus();
  }, [loadPremiosStatus]);

  useEffect(() => {
    if (!enabled) return;
    void loadShares();
    /* Una vez al abrir el panel: es un contador que se mueve despacio —lotes de 50— y lo que se mira es si el día se
       está llenando, no el número al segundo. */
    void leerGastoDeCaratulas().then(setCoverStats);
    void loadAnnouncement();
    // Los retos NO se piden aquí: solo los enseña la portada, y los pide ella al montarse (`refreshPremiosStatus`).
    // Pedirlos también aquí eran dos lecturas a la vez al entrar por la portada.
  }, [enabled, loadShares, loadAnnouncement]);

  return {
    shares,
    loadShares,
    coverStats,
    premiosStatus,
    loadPremiosStatus,
    refreshPremiosStatus,
    announcement,
    setAnnouncement,
    loadAnnouncement,
  };
}

export type AdminPanelData = ReturnType<typeof useAdminPanelData>;
