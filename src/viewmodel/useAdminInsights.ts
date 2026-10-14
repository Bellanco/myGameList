// Las cifras de la comunidad y los pendientes del panel (docs/plan-admin-rediseno.md, F3-F4).
//
// Al tener el censo: se calculan las cifras de hoy, se leen las fotos diarias de los últimos 90 días y, si la de
// hoy no existe, se guarda (una escritura al día como mucho). Las fotos son lo único que permite decir «ayer» y
// pintar activos por día; mientras no se pueden leer, la portada enseña las cifras de hoy sin diferencias.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDailySnapshot,
  communityTotals,
  localDayKey,
  previousSnapshot,
  type DailySnapshot,
} from '../core/admin/communityStats';
import type { AdminCensus } from '../model/repository/firebaseAdminRepository';
import {
  loadAdminTodos,
  loadDailySnapshots,
  saveAdminTodos,
  saveDailySnapshot,
  type AdminTodo,
} from '../model/repository/admin/adminPanelStore';

/** Cuántos días de fotos se leen: los de la gráfica de Comunidad. */
export const SNAPSHOT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `loadedAt` es cuándo se leyó el censo: las cifras se calculan con ESE reloj, no con el de cada render, para que
 * «activos hoy» no cambie solo por dejar el panel abierto.
 */
export function useAdminInsights(census: AdminCensus | null, loadedAt: number) {
  const [snapshots, setSnapshots] = useState<DailySnapshot[] | null>(null);
  const [todos, setTodos] = useState<AdminTodo[] | null>(null);
  const [todosError, setTodosError] = useState('');
  const savedToday = useRef('');

  const now = loadedAt || Date.now();
  const totals = useMemo(() => (census ? communityTotals(census.users, now) : null), [census, now]);

  // Las fotos: se leen una vez por censo y, si falta la de hoy, se toma con este censo.
  useEffect(() => {
    if (!census || !totals) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadDailySnapshots(localDayKey(now - (SNAPSHOT_DAYS - 1) * DAY_MS));
        if (cancelled) return;
        const today = localDayKey(now);
        if (!loaded.some((snapshot) => snapshot.day === today) && savedToday.current !== today) {
          savedToday.current = today;
          const snapshot = buildDailySnapshot(totals, census.totals.friendships, now);
          try {
            await saveDailySnapshot(snapshot);
            loaded.push(snapshot);
          } catch (error) {
            console.warn('[admin] no se pudo guardar la foto diaria:', error);
          }
        }
        if (!cancelled) setSnapshots(loaded);
      } catch (error) {
        // Sin fotos (reglas sin desplegar, sin red): la portada sigue con las cifras de hoy.
        console.warn('[admin] no se pudieron leer las fotos diarias:', error);
        if (!cancelled) setSnapshots([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [census, totals, now]);

  // Una vez: los pendientes no dependen del censo, solo esperan a que haya sesión de administrador.
  const hasCensus = census !== null;
  useEffect(() => {
    if (!hasCensus) return;
    let cancelled = false;
    loadAdminTodos()
      .then((items) => {
        if (!cancelled) setTodos(items);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTodos([]);
        setTodosError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [hasCensus]);

  /** Guarda la lista y se queda con lo guardado. Si falla, vuelve a la de antes y lo dice. */
  const writeTodos = useCallback(async (next: AdminTodo[]) => {
    const before = todos;
    setTodos(next);
    try {
      setTodos(await saveAdminTodos(next));
      setTodosError('');
    } catch (error) {
      setTodos(before);
      setTodosError(error instanceof Error ? error.message : String(error));
    }
  }, [todos]);

  const addTodo = useCallback(
    (text: string, due: string) =>
      writeTodos([
        ...(todos || []),
        { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), due, done: false, createdAt: Date.now() },
      ]),
    [todos, writeTodos],
  );
  const toggleTodo = useCallback(
    (id: string) => writeTodos((todos || []).map((item) => (item.id === id ? { ...item, done: !item.done } : item))),
    [todos, writeTodos],
  );
  const removeTodo = useCallback((id: string) => writeTodos((todos || []).filter((item) => item.id !== id)), [todos, writeTodos]);

  const today = localDayKey(now);
  const dueTodos = (todos || []).filter((item) => !item.done && item.due && item.due <= today).length;

  return {
    now,
    totals,
    snapshots,
    yesterday: snapshots ? previousSnapshot(snapshots, now) : null,
    todos,
    todosError,
    dueTodos,
    addTodo,
    toggleTodo,
    removeTodo,
  };
}

export type AdminInsights = ReturnType<typeof useAdminInsights>;
