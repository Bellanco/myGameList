import { useCallback, useEffect, useMemo, useState } from 'react';
import { FILTER_BOOL, TAB_ACTIONS, TAB_ORDER, VALIDATION_MESSAGES } from '../core/constants/labels';
import { HOURS_RANGES } from '../core/constants/uiConfig';
import { sortEs, uniqueCaseInsensitive } from '../core/utils/compare';
import { normalizeTag, safeTrim } from '../core/security/sanitize';
import { loadLocalState, loadLocalStateAsync, normalizeData, saveLocalState } from '../model/repository/localRepository';
import type { TabAction as LabelsTabAction } from '../core/constants/labels';
import type { GameItem, StatusNotice, TabData, TabId, TabSort, ToolbarFilters } from '../model/types/game';

const DEFAULT_FILTERS: ToolbarFilters = {
  search: '',
  genre: '',
  platform: '',
  score: '',
  hours: '',
  only: false,
  deck: false,
};

const DEFAULT_SORT: Record<TabId, TabSort> = {
  c: { col: 'years', asc: false },
  v: { col: 'name', asc: true },
  e: { col: 'name', asc: true },
  p: { col: 'score', asc: false },
};

export interface LookupData {
  genres: string[];
  platforms: string[];
  strengths: string[];
  weaknesses: string[];
}

export type TabAction = LabelsTabAction;

export interface GameDraft {
  id?: number;
  sourceTab?: TabId;
  sourceId?: number;
  name: string;
  genres: string[];
  platforms: string[];
  steamDeck: boolean;
  score: number;
  years: number[];
  strengths: string[];
  weaknesses: string[];
  reasons: string[];
  replayable: boolean;
  retry: boolean;
  hours: number | null;
  review: string;
}

const EMPTY_DRAFT: GameDraft = {
  name: '',
  genres: [],
  platforms: [],
  steamDeck: false,
  score: 0,
  years: [],
  strengths: [],
  weaknesses: [],
  reasons: [],
  replayable: false,
  retry: false,
  hours: null,
  review: '',
};

function toNormalizedDraft(game?: Partial<GameItem>): GameDraft {
  return {
    ...EMPTY_DRAFT,
    ...game,
    score: Number(game?.score || 0),
    years: (game?.years || []).map(Number).filter(Number.isFinite),
    strengths: game?.strengths || [],
    weaknesses: game?.weaknesses || [],
    reasons: game?.reasons || [],
    genres: game?.genres || [],
    platforms: game?.platforms || [],
    review: game?.review || '',
    hours: game?.hours === null ? null : Number(game?.hours),
  };
}

export function useGameListViewModel() {
  const initial = loadLocalState();

  const [data, setData] = useState<TabData>(normalizeData(initial));
  const [meta, setMeta] = useState({
    updatedAt: initial.updatedAt,
    etag: initial.etag,
    lastRemoteUpdatedAt: initial.lastRemoteUpdatedAt,
  });
  const [filters, setFilters] = useState<Record<TabId, ToolbarFilters>>({
    c: { ...DEFAULT_FILTERS },
    v: { ...DEFAULT_FILTERS },
    e: { ...DEFAULT_FILTERS },
    p: { ...DEFAULT_FILTERS },
  });
  const [sort, setSort] = useState<Record<TabId, TabSort>>(DEFAULT_SORT);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{ title: string; action: () => void } | null>(null);
  const [editingTab, setEditingTab] = useState<TabId>('c');
  const [draft, setDraft] = useState<GameDraft>(EMPTY_DRAFT);
  const [adminTab, setAdminTab] = useState<'genres' | 'platforms' | 'strengths' | 'weaknesses'>('genres');

  useEffect(() => {
    let cancelled = false;

    const hydrateFromFallback = async () => {
      const hydrated = await loadLocalStateAsync();
      if (cancelled) return;

      setData((prev) => {
        const currentHasData = prev.c.length > 0 || prev.v.length > 0 || prev.e.length > 0 || prev.p.length > 0 || prev.deleted.length > 0;
        const hydratedHasData = hydrated.c.length > 0 || hydrated.v.length > 0 || hydrated.e.length > 0 || hydrated.p.length > 0 || hydrated.deleted.length > 0;

        if (!hydratedHasData) return prev;
        if (currentHasData && hydrated.updatedAt <= (prev.updatedAt || 0)) return prev;

        return normalizeData(hydrated);
      });

      setMeta((prev) => {
        if (hydrated.updatedAt <= (prev.updatedAt || 0)) return prev;
        return {
          ...prev,
          updatedAt: hydrated.updatedAt,
          etag: hydrated.etag,
          lastRemoteUpdatedAt: hydrated.lastRemoteUpdatedAt,
        };
      });
    };

    void hydrateFromFallback();

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    (nextData: TabData, nextMeta = meta) => {
      const normalized = normalizeData(nextData);
      const updatedAt = Date.now();
      const payload = {
        ...normalized,
        updatedAt,
        etag: nextMeta.etag,
        lastRemoteUpdatedAt: nextMeta.lastRemoteUpdatedAt,
      };

      setData(normalized);
      setMeta((prev) => ({ ...prev, updatedAt }));
      saveLocalState(payload);
    },
    [meta],
  );

  const tabCounts = useMemo(
    () => ({
      c: data.c.length,
      v: data.v.length,
      e: data.e.length,
      p: data.p.length,
    }),
    [data],
  );

  const lookups = useMemo<LookupData>(() => {
    const genres = new Set<string>();
    const platforms = new Set<string>();
    const strengths = new Set<string>();
    const weaknesses = new Set<string>();

    for (const game of [...data.c, ...data.v, ...data.e, ...data.p]) {
      game.genres.forEach((value) => genres.add(value));
      game.platforms.forEach((value) => platforms.add(value));
      (game.strengths || []).forEach((value) => strengths.add(value));
      (game.weaknesses || []).forEach((value) => weaknesses.add(value));
      (game.reasons || []).forEach((value) => weaknesses.add(value));
    }

    return {
      genres: [...genres].sort(sortEs),
      platforms: [...platforms].sort(sortEs),
      strengths: [...strengths].sort(sortEs),
      weaknesses: [...weaknesses].sort(sortEs),
    };
  }, [data]);

  const tabActions: Record<TabId, TabAction[]> = TAB_ACTIONS;

  const setFilter = useCallback((tab: TabId, key: keyof ToolbarFilters, value: string | boolean) => {
    setFilters((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [key]: value,
      },
    }));
  }, []);

  const clearFilter = useCallback((tab: TabId, key: keyof ToolbarFilters) => {
    setFilters((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [key]: DEFAULT_FILTERS[key],
      },
    }));
  }, []);

  const clearAllFilters = useCallback((tab: TabId) => {
    setFilters((prev) => ({ ...prev, [tab]: { ...DEFAULT_FILTERS } }));
  }, []);

  const sortBy = useCallback((tab: TabId, column: string) => {
    setSort((prev) => {
      const current = prev[tab];
      if (current.col === column) {
        return {
          ...prev,
          [tab]: {
            ...current,
            asc: !current.asc,
          },
        };
      }

      return {
        ...prev,
        [tab]: {
          col: column,
          asc: ['score', 'years', 'hours', 'retry', 'replayable'].includes(column) ? false : true,
        },
      };
    });
  }, []);

  const getFilteredList = useCallback(
    (tab: TabId): GameItem[] => {
      const tabData = data[tab];
      const state = filters[tab];
      const config = FILTER_BOOL[tab];

      const filtered = tabData.filter((game) => {
        if (state.search && !game.name.toLowerCase().includes(state.search.toLowerCase())) return false;
        if (state.genre && !game.genres.some((value) => value.toLowerCase().includes(state.genre.toLowerCase()))) return false;
        if (state.platform && !game.platforms.some((value) => value.toLowerCase().includes(state.platform.toLowerCase()))) return false;
        if (state.deck && !game.steamDeck) return false;
        if (state.score && Number(game.score || 0) < Number(state.score)) return false;
        if (state.only && config && !Boolean(game[config.field])) return false;

        if (state.hours) {
          const range = HOURS_RANGES.find((entry) => entry.key === state.hours);
          const hours = Number(game.hours || 0);
          if (!range || !range.check(hours)) return false;
        }

        return true;
      });

      const currentSort = sort[tab];

      return filtered.sort((a, b) => {
        let va: string | number | boolean = '';
        let vb: string | number | boolean = '';

        if (currentSort.col === 'years') {
          va = a.years?.length ? Math.max(...a.years) : 0;
          vb = b.years?.length ? Math.max(...b.years) : 0;
        } else if (currentSort.col === 'genres') {
          va = a.genres[0] || '';
          vb = b.genres[0] || '';
        } else {
          const key = currentSort.col as keyof GameItem;
          va = (a[key] as string | number | boolean | undefined) ?? '';
          vb = (b[key] as string | number | boolean | undefined) ?? '';
        }

        if (typeof va === 'boolean') {
          va = Number(va);
          vb = Number(vb);
        }

        if (typeof va === 'number' && typeof vb === 'number') {
          return currentSort.asc ? va - vb : vb - va;
        }

        return currentSort.asc ? sortEs(String(va || ''), String(vb || '')) : sortEs(String(vb || ''), String(va || ''));
      });
    },
    [data, filters, sort],
  );

  const notify = useCallback((kind: StatusNotice['kind'], message: string) => {
    setNotice({ kind, message });
    window.clearTimeout((notify as unknown as { _timer?: number })._timer);
    (notify as unknown as { _timer?: number })._timer = window.setTimeout(() => {
      setNotice(null);
    }, 3200);
  }, []);

  const openNewGame = useCallback((tab: TabId) => {
    setEditingTab(tab);
    setDraft(EMPTY_DRAFT);
    setFormModalOpen(true);
  }, []);

  const openEditGame = useCallback(
    (tab: TabId, id: number) => {
      const game = data[tab].find((entry) => entry.id === id);
      if (!game) return;
      setEditingTab(tab);
      setDraft(toNormalizedDraft(game));
      setFormModalOpen(true);
    },
    [data],
  );

  const migrateGame = useCallback(
    (sourceTab: TabId, id: number, targetTab: TabId) => {
      const source = data[sourceTab].find((item) => item.id === id);
      if (!source) return;

      const migrated = toNormalizedDraft(source);
      migrated.sourceId = id;
      migrated.sourceTab = sourceTab;

      if (targetTab === 'c') {
        migrated.years = migrated.years.length ? migrated.years : [new Date().getFullYear()];
        migrated.score = migrated.score || 5;
        migrated.replayable = false;
        migrated.weaknesses = migrated.weaknesses.length ? migrated.weaknesses : migrated.reasons;
      }

      if (targetTab === 'v') {
        migrated.reasons = migrated.reasons.length ? migrated.reasons : migrated.weaknesses;
        migrated.retry = true;
      }

      if (targetTab === 'e') {
        migrated.weaknesses = migrated.weaknesses.length ? migrated.weaknesses : migrated.reasons;
      }

      setEditingTab(targetTab);
      setDraft(migrated);
      setFormModalOpen(true);
    },
    [data],
  );

  const saveDraft = useCallback(
    (tab: TabId, nextDraft: GameDraft) => {
      const now = Date.now();
      const base: GameItem = {
        id: nextDraft.id || Math.max(0, ...TAB_ORDER.flatMap((key) => data[key].map((item) => item.id))) + 1,
        _ts: now,
        name: safeTrim(nextDraft.name, 120),
        genres: uniqueCaseInsensitive(nextDraft.genres.map(normalizeTag).filter(Boolean)),
        platforms: uniqueCaseInsensitive(nextDraft.platforms.map(normalizeTag).filter(Boolean)),
        steamDeck: nextDraft.steamDeck,
        review: safeTrim(nextDraft.review, 4000),
        score: Math.max(0, Math.min(5, Number(nextDraft.score || 0))),
        years: [...new Set((nextDraft.years || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b),
        strengths: uniqueCaseInsensitive((nextDraft.strengths || []).map(normalizeTag).filter(Boolean)),
        weaknesses: uniqueCaseInsensitive((nextDraft.weaknesses || []).map(normalizeTag).filter(Boolean)),
        reasons: uniqueCaseInsensitive((nextDraft.reasons || []).map(normalizeTag).filter(Boolean)),
        replayable: nextDraft.replayable,
        retry: nextDraft.retry,
        hours: nextDraft.hours === null ? null : Number(nextDraft.hours),
      };

      if (!base.name || !base.genres.length || !base.platforms.length) {
        notify('warn', 'Revisa los campos obligatorios antes de guardar.');
        return;
      }

      if (tab === 'c' && !base.years?.length) {
        notify('warn', 'Debes añadir al menos un año para completados.');
        return;
      }

      const nextData: TabData = {
        ...data,
        [tab]: data[tab].some((item) => item.id === base.id)
          ? data[tab].map((item) => (item.id === base.id ? { ...item, ...base } : item))
          : [...data[tab], base],
      };

      if (nextDraft.sourceTab && nextDraft.sourceId) {
        nextData[nextDraft.sourceTab] = nextData[nextDraft.sourceTab].filter((item) => item.id !== nextDraft.sourceId);
      }

      persist(nextData);
      setFormModalOpen(false);
      setDraft(EMPTY_DRAFT);
      notify('ok', 'Juego guardado correctamente');
    },
    [data, notify, persist],
  );

  const deleteGame = useCallback(
    (tab: TabId, id: number) => {
      const game = data[tab].find((item) => item.id === id);
      if (!game) return;

      setConfirmState({
        title: `¿Eliminar "${game.name}"?`,
        action: () => {
          const nextData: TabData = {
            ...data,
            [tab]: data[tab].filter((item) => item.id !== id),
            deleted: [...data.deleted, { id, _ts: Date.now() }],
            updatedAt: Date.now(),
          };
          persist(nextData);
          setExpandedId(null);
          notify('ok', 'Juego eliminado');
        },
      });
    },
    [data, notify, persist],
  );

  const removeTagAcrossGames = useCallback(
    (tabKey: 'genres' | 'platforms' | 'strengths' | 'weaknesses', value: string) => {
      const normalizeMatch = (entry: string) => entry.toLowerCase() !== value.toLowerCase();
      const nextData: TabData = {
        ...data,
        c: data.c.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? game.genres.filter(normalizeMatch) : game.genres,
          platforms: tabKey === 'platforms' ? game.platforms.filter(normalizeMatch) : game.platforms,
          strengths: tabKey === 'strengths' ? (game.strengths || []).filter(normalizeMatch) : game.strengths,
          weaknesses: tabKey === 'weaknesses' ? (game.weaknesses || []).filter(normalizeMatch) : game.weaknesses,
        })),
        v: data.v.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? game.genres.filter(normalizeMatch) : game.genres,
          platforms: tabKey === 'platforms' ? game.platforms.filter(normalizeMatch) : game.platforms,
          strengths: tabKey === 'strengths' ? (game.strengths || []).filter(normalizeMatch) : game.strengths,
          reasons: tabKey === 'weaknesses' ? (game.reasons || []).filter(normalizeMatch) : game.reasons,
        })),
        e: data.e.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? game.genres.filter(normalizeMatch) : game.genres,
          platforms: tabKey === 'platforms' ? game.platforms.filter(normalizeMatch) : game.platforms,
          strengths: tabKey === 'strengths' ? (game.strengths || []).filter(normalizeMatch) : game.strengths,
          weaknesses: tabKey === 'weaknesses' ? (game.weaknesses || []).filter(normalizeMatch) : game.weaknesses,
        })),
        p: data.p.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? game.genres.filter(normalizeMatch) : game.genres,
          platforms: tabKey === 'platforms' ? game.platforms.filter(normalizeMatch) : game.platforms,
        })),
        updatedAt: Date.now(),
      };

      persist(nextData);
      notify('ok', 'Etiqueta eliminada');
    },
    [data, notify, persist],
  );

  const renameTagAcrossGames = useCallback(
    (tabKey: 'genres' | 'platforms' | 'strengths' | 'weaknesses', oldValue: string, newValue: string) => {
      const normalized = normalizeTag(newValue);
      if (!normalized) return;

      const targetSet = lookups[tabKey];
      const existing = targetSet.find((value) => value.toLowerCase() === normalized.toLowerCase());
      const finalValue = existing || normalized;
      const wasMerge = Boolean(existing && existing.toLowerCase() !== oldValue.toLowerCase());

      const replace = (values: string[] = []) => {
        if (!values.some((value) => value.toLowerCase() === oldValue.toLowerCase())) return values;
        return uniqueCaseInsensitive(values.map((value) => (value.toLowerCase() === oldValue.toLowerCase() ? finalValue : value)));
      };

      const nextData: TabData = {
        ...data,
        c: data.c.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? replace(game.genres) : game.genres,
          platforms: tabKey === 'platforms' ? replace(game.platforms) : game.platforms,
          strengths: tabKey === 'strengths' ? replace(game.strengths) : game.strengths,
          weaknesses: tabKey === 'weaknesses' ? replace(game.weaknesses) : game.weaknesses,
        })),
        v: data.v.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? replace(game.genres) : game.genres,
          platforms: tabKey === 'platforms' ? replace(game.platforms) : game.platforms,
          strengths: tabKey === 'strengths' ? replace(game.strengths) : game.strengths,
          reasons: tabKey === 'weaknesses' ? replace(game.reasons) : game.reasons,
        })),
        e: data.e.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? replace(game.genres) : game.genres,
          platforms: tabKey === 'platforms' ? replace(game.platforms) : game.platforms,
          strengths: tabKey === 'strengths' ? replace(game.strengths) : game.strengths,
          weaknesses: tabKey === 'weaknesses' ? replace(game.weaknesses) : game.weaknesses,
        })),
        p: data.p.map((game) => ({
          ...game,
          _ts: Date.now(),
          genres: tabKey === 'genres' ? replace(game.genres) : game.genres,
          platforms: tabKey === 'platforms' ? replace(game.platforms) : game.platforms,
        })),
        updatedAt: Date.now(),
      };

      persist(nextData);
      notify('ok', wasMerge ? VALIDATION_MESSAGES.tagMerged : VALIDATION_MESSAGES.tagUpdated);
    },
    [data, lookups, notify, persist],
  );

  return {
    data,
    meta,
    setMeta,
    filters,
    sort,
    expandedId,
    setExpandedId,
    notice,
    setNotice,
    formModalOpen,
    setFormModalOpen,
    adminModalOpen,
    setAdminModalOpen,
    confirmState,
    setConfirmState,
    editingTab,
    draft,
    setDraft,
    tabCounts,
    lookups,
    adminTab,
    setAdminTab,
    getFilteredList,
    setFilter,
    clearFilter,
    clearAllFilters,
    sortBy,
    openNewGame,
    openEditGame,
    migrateGame,
    saveDraft,
    deleteGame,
    removeTagAcrossGames,
    renameTagAcrossGames,
    notify,
    persist,
    tabActions,
  };
}
