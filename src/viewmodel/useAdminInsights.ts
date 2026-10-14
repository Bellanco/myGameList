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

  // El censo y sus cifras, para el efecto de las fotos: se leen por ref para que el efecto NO dependa de ellos.
  const latest = useRef({ census, totals });
  useEffect(() => {
    latest.current = { census, totals };
  }, [census, totals]);
  /** El día cuyas fotos ya se han leído. */
  const readDay = useRef('');

  // Las fotos: se leen UNA VEZ AL DÍA, con la primera lectura completa del censo, y si falta la de hoy se toma con
  // ese censo. NO dependen del censo en sí: el censo cambia tras cada acción (se relee la ficha tocada), y atarlas a
  // él releía hasta 90 documentos por cada cambio de rango. Una relectura completa (`loadedAt`) del mismo día
  // tampoco vuelve a pedirlas: la historia no ha cambiado y las cifras de hoy se calculan del censo en vivo.
  useEffect(() => {
    const { census: current, totals: currentTotals } = latest.current;
    if (!loadedAt || !current || !currentTotals) return;
    const today = localDayKey(loadedAt);
    if (readDay.current === today) return;
    readDay.current = today;
    // SIN `cancelled`: con la guarda del día, el segundo montaje del modo estricto no vuelve a pedir nada, así que
    // cancelar el primero dejaba la gráfica vacía para siempre (la misma trampa que tuvo `useAnnouncement`).
    void (async () => {
      try {
        const loaded = await loadDailySnapshots(localDayKey(loadedAt - (SNAPSHOT_DAYS - 1) * DAY_MS));
        if (!loaded.some((snapshot) => snapshot.day === today) && savedToday.current !== today) {
          savedToday.current = today;
          const snapshot = buildDailySnapshot(currentTotals, current.totals.friendships, loadedAt);
          try {
            await saveDailySnapshot(snapshot);
            loaded.push(snapshot);
          } catch (error) {
            console.warn('[admin] no se pudo guardar la foto diaria:', error);
          }
        }
        setSnapshots(loaded);
      } catch (error) {
        // Sin fotos (reglas sin desplegar, sin red): la portada sigue con las cifras de hoy.
        console.warn('[admin] no se pudieron leer las fotos diarias:', error);
        // Se podrá reintentar con la siguiente relectura del censo.
        readDay.current = '';
        setSnapshots([]);
      }
    })();
  }, [loadedAt]);

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
        // Se quedan SIN LEER (`null`), no vacíos: guardar reescribe el documento entero, y una lista vacía por un
        // fallo de red borraría los pendientes de verdad al añadir uno. Sin lectura, el formulario no se ofrece.
        setTodosError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [hasCensus]);

  /** Guarda la lista y se queda con lo guardado. Si falla, vuelve a la de antes y lo dice. */
  const writeTodos = useCallback(async (next: AdminTodo[]) => {
    const before = todos;
    if (before === null) return; // sin la lista leída no se escribe nada (ver la lectura)
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
