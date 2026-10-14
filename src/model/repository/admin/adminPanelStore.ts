// LO QUE EL PANEL GUARDA PARA SÍ (docs/plan-admin-rediseno.md): los pendientes, la foto diaria del censo y el
// registro de acciones. Nada de esto lo ve nadie más: las reglas lo reservan a `isAdmin()` (`adminPanel/**` y
// `adminLog/*`), y ninguno contiene datos que el panel no viera ya —son el censo resumido y lo que el administrador
// hace con él—.
//
// Va en Firestore y no en el navegador porque el administrador abre el panel desde más de un aparato, y una lista
// de pendientes que solo existe en el portátil no sirve en el móvil.
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore/lite';
import { sanitizeDailySnapshot, type DailySnapshot } from '../../../core/admin/communityStats';
import { requireServices, toAdminError } from './adminShared';

// ─── Pendientes ───────────────────────────────────────────────────────────────────────────────────────────────

export interface AdminTodo {
  id: string;
  text: string;
  /** `AAAA-MM-DD` o vacío (sin fecha). */
  due: string;
  done: boolean;
  createdAt: number;
}

/** Topes del documento: es una lista de recordatorios, no un gestor de tareas. */
export const ADMIN_TODO_LIMITS = { items: 40, text: 140 } as const;

const TODOS_DOC = ['adminPanel', 'todos'] as const;

function sanitizeTodo(raw: unknown): AdminTodo | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const id = String(data.id || '').slice(0, 40);
  const text = String(data.text || '').trim().slice(0, ADMIN_TODO_LIMITS.text);
  if (!id || !text) return null;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(data.due || '')) ? String(data.due) : '';
  return { id, text, due, done: data.done === true, createdAt: Math.max(0, Number(data.createdAt) || 0) };
}

export function sanitizeTodos(raw: unknown): AdminTodo[] {
  const items = Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : [];
  return items.map(sanitizeTodo).filter((item): item is AdminTodo => item !== null).slice(0, ADMIN_TODO_LIMITS.items);
}

export async function loadAdminTodos(): Promise<AdminTodo[]> {
  const services = await requireServices();
  try {
    const snapshot = await getDoc(doc(services.firestore, ...TODOS_DOC));
    return snapshot.exists() ? sanitizeTodos(snapshot.data()) : [];
  } catch (error) {
    throw toAdminError(error, 'leer los pendientes');
  }
}

/** Reescribe la lista entera (es corta) y devuelve lo que ha quedado guardado. */
export async function saveAdminTodos(items: readonly AdminTodo[]): Promise<AdminTodo[]> {
  const services = await requireServices();
  const clean = sanitizeTodos({ items });
  try {
    await setDoc(doc(services.firestore, ...TODOS_DOC), { items: clean, updatedAt: Date.now() });
  } catch (error) {
    throw toAdminError(error, 'guardar los pendientes');
  }
  return clean;
}

// ─── Foto diaria ──────────────────────────────────────────────────────────────────────────────────────────────

const DAYS_COLLECTION = ['adminPanel', 'stats', 'days'] as const;

/** Las fotos de los últimos `days` días (por la clave `AAAA-MM-DD`, que ordena igual que la fecha). */
export async function loadDailySnapshots(fromDay: string): Promise<DailySnapshot[]> {
  const services = await requireServices();
  try {
    const snapshot = await getDocs(
      query(collection(services.firestore, ...DAYS_COLLECTION), where('day', '>=', fromDay), orderBy('day', 'asc')),
    );
    return snapshot.docs.map((entry) => sanitizeDailySnapshot(entry.data())).filter((item): item is DailySnapshot => item !== null);
  } catch (error) {
    throw toAdminError(error, 'leer las fotos diarias');
  }
}

/**
 * Guarda la foto de hoy SI AÚN NO HAY: una escritura al día como mucho. Quien llama ya ha leído las fotos (para la
 * gráfica), así que sabe si la de hoy existe sin gastar otra lectura.
 */
export async function saveDailySnapshot(snapshot: DailySnapshot): Promise<void> {
  const services = await requireServices();
  try {
    await setDoc(doc(services.firestore, ...DAYS_COLLECTION, snapshot.day), snapshot);
  } catch (error) {
    throw toAdminError(error, 'guardar la foto diaria');
  }
}

// ─── Registro de acciones ─────────────────────────────────────────────────────────────────────────────────────

export type AdminLogKind = 'tier' | 'social' | 'legacy' | 'identity' | 'photo' | 'requests' | 'cutover' | 'delete' | 'achievements' | 'shares' | 'announcement';

export interface AdminLogEntry {
  id: string;
  at: number;
  kind: AdminLogKind;
  /** Lo que se hizo, ya en palabras (se escribe con el texto del momento: el registro no se re-traduce). */
  text: string;
  /** Sobre quién (uid) y con qué nombre se le veía entonces. Vacío si la acción no es sobre una persona. */
  targetUid: string;
  targetName: string;
  /**
   * Lo necesario para deshacerla, si se puede. `null` = no tiene vuelta atrás (borrar, purgar…). Solo valores
   * escalares: el registro no guarda copias de documentos.
   */
  undo:
    | { action: 'tier'; profileDocId: string; tier: string; to?: string }
    | { action: 'social'; profileDocId: string; enabled: boolean; to?: boolean }
    | null;
  /** Ya se deshizo: no se ofrece otra vez. */
  undone: boolean;
}

const LOG_COLLECTION = 'adminLog';
export const ADMIN_LOG_PAGE = 60;

const KINDS: readonly AdminLogKind[] = ['tier', 'social', 'legacy', 'identity', 'photo', 'requests', 'cutover', 'delete', 'achievements', 'shares', 'announcement'];

export function sanitizeLogEntry(id: string, raw: unknown): AdminLogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const kind = KINDS.find((value) => value === data.kind);
  const text = String(data.text || '').slice(0, 300);
  if (!kind || !text) return null;
  const rawUndo = data.undo as Record<string, unknown> | null | undefined;
  let undo: AdminLogEntry['undo'] = null;
  if (rawUndo && rawUndo.action === 'tier' && rawUndo.profileDocId) {
    undo = { action: 'tier', profileDocId: String(rawUndo.profileDocId), tier: String(rawUndo.tier || '') };
    if (typeof rawUndo.to === 'string') undo.to = rawUndo.to;
  } else if (rawUndo && rawUndo.action === 'social' && rawUndo.profileDocId) {
    undo = { action: 'social', profileDocId: String(rawUndo.profileDocId), enabled: rawUndo.enabled === true };
    if (typeof rawUndo.to === 'boolean') undo.to = rawUndo.to;
  }
  return {
    id,
    at: Math.max(0, Number(data.at) || 0),
    kind,
    text,
    targetUid: String(data.targetUid || '').slice(0, 128),
    targetName: String(data.targetName || '').slice(0, 80),
    undo,
    undone: data.undone === true,
  };
}

export async function loadAdminLog(pageSize = ADMIN_LOG_PAGE): Promise<AdminLogEntry[]> {
  const services = await requireServices();
  try {
    const snapshot = await getDocs(query(collection(services.firestore, LOG_COLLECTION), orderBy('at', 'desc'), limit(pageSize)));
    return snapshot.docs.map((entry) => sanitizeLogEntry(entry.id, entry.data())).filter((item): item is AdminLogEntry => item !== null);
  } catch (error) {
    throw toAdminError(error, 'leer el registro');
  }
}

/** Apunta una acción. El id lo pone el cliente (hora + azar) para poder devolver la entrada sin releerla. */
export async function appendAdminLog(entry: Omit<AdminLogEntry, 'id' | 'undone'>): Promise<AdminLogEntry> {
  const services = await requireServices();
  const id = `${entry.at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const saved: AdminLogEntry = { ...entry, id, undone: false };
  const { id: _omit, ...data } = saved;
  void _omit;
  try {
    await setDoc(doc(services.firestore, LOG_COLLECTION, id), data);
  } catch (error) {
    throw toAdminError(error, 'apuntar en el registro');
  }
  return saved;
}

export async function markAdminLogUndone(id: string): Promise<void> {
  const services = await requireServices();
  try {
    await setDoc(doc(services.firestore, LOG_COLLECTION, id), { undone: true }, { merge: true });
  } catch (error) {
    throw toAdminError(error, 'marcar la acción como deshecha');
  }
}
