// Lógica PURA de la bandeja de importados (sin IO, sin React → testeable y reutilizable por
// cualquier conector). La persistencia vive en model/repository/import/inboxRepository.ts y el
// cableado con el estado en el view-model. Ver docs/plan-importacion-bibliotecas.md (Anexo A).

import { normalizeName } from '../roulette/roulette';
import { normalizeTag, safeTrim } from '../security/sanitize';
import { uniqueCaseInsensitive } from '../utils/compare';
import type { GameItem } from '../../model/types/game';
import type { ImportInbox, ImportedGame, ImportSource, RawExternalGame, StagingSummary } from '../../model/types/import';

// Caducidad de la bandeja: los importados no clasificados se purgan a los 30 días.
export const IMPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const EMPTY_INBOX: ImportInbox = { imported: [], updatedAt: 0 };

const NAME_MAX = 120;

function cleanTags(values: string[] | undefined): string[] {
  return uniqueCaseInsensitive((values || []).map(normalizeTag).filter(Boolean));
}

/**
 * Inserta en lote juegos crudos en la bandeja aplicando dedupe y fusión (función pura):
 * - **inválido**: sin nombre → se descarta.
 * - **duplicado**: mismo juego (por nombre normalizado) ya importado desde el MISMO origen con el
 *   mismo `externalId` → idempotente, no se toca.
 * - **fusión**: mismo juego (nombre) desde OTRO origen (o mismo origen sin id previo) → se acumulan
 *   plataformas, géneros, orígenes e IDs externos en la entrada existente (un juego puede tenerse en
 *   varias tiendas), sin crear otra entrada.
 * - **nuevo**: en otro caso, entra con un id local nuevo; se marca `existsInLists` si ya está en c/v/e/p.
 *
 * @param existingListNames nombres YA normalizados (via normalizeName) de los juegos en c/v/e/p.
 * @returns una bandeja NUEVA (no muta la de entrada) y el resumen para el aviso.
 */
export function addGamesToInbox(
  inbox: ImportInbox,
  games: RawExternalGame[],
  existingListNames: Set<string>,
  now: number,
): { inbox: ImportInbox; summary: StagingSummary } {
  const summary: StagingSummary = { added: 0, merged: 0, duplicates: 0, invalid: 0, flaggedExisting: 0 };

  // Copias superficiales para no mutar la bandeja de entrada.
  const imported: ImportedGame[] = inbox.imported.map((g) => ({ ...g }));
  let nextId = imported.reduce((max, g) => Math.max(max, g.id), 0) + 1;

  const byName = new Map<string, ImportedGame>();
  for (const g of imported) byName.set(normalizeName(g.name), g);

  for (const raw of games) {
    const name = safeTrim(raw.name, NAME_MAX);
    if (!name) {
      summary.invalid += 1;
      continue;
    }

    const norm = normalizeName(name);
    const source: ImportSource = raw.source;
    const externalId = safeTrim(raw.externalId, NAME_MAX);
    const platforms = cleanTags(raw.platforms);
    const genres = cleanTags(raw.genres);

    const existing = byName.get(norm);
    if (existing) {
      const alreadySameOrigin =
        Boolean(externalId) && existing.sources.includes(source) && existing.externalIds?.[source] === externalId;
      if (alreadySameOrigin) {
        summary.duplicates += 1;
        continue;
      }
      // Fusión: acumular sin duplicar.
      existing.platforms = uniqueCaseInsensitive([...existing.platforms, ...platforms]);
      existing.genres = uniqueCaseInsensitive([...existing.genres, ...genres]);
      if (!existing.sources.includes(source)) existing.sources = [...existing.sources, source];
      if (externalId) existing.externalIds = { ...existing.externalIds, [source]: externalId };
      const rawHours = raw.hours ?? null;
      const rawGrade = raw.grade ?? null;
      if ((existing.hours ?? null) === null && rawHours !== null) existing.hours = rawHours;
      if ((existing.grade ?? null) === null && rawGrade !== null) existing.grade = rawGrade;
      if (!existing.suggestedTab && raw.suggestedTab) existing.suggestedTab = raw.suggestedTab;
      if (!existing.coverUrl && raw.coverUrl) existing.coverUrl = raw.coverUrl;
      summary.merged += 1;
      continue;
    }

    const existsInLists = existingListNames.has(norm);
    const entry: ImportedGame = {
      id: nextId,
      name,
      platforms,
      genres,
      sources: [source],
      externalIds: externalId ? { [source]: externalId } : undefined,
      coverUrl: raw.coverUrl || undefined,
      hours: raw.hours ?? null,
      suggestedTab: raw.suggestedTab,
      grade: raw.grade ?? null,
      existsInLists: existsInLists || undefined,
      importedAt: now,
    };
    nextId += 1;
    imported.push(entry);
    byName.set(norm, entry);
    summary.added += 1;
    if (existsInLists) summary.flaggedExisting += 1;
  }

  return { inbox: { imported, updatedAt: now }, summary };
}

/**
 * Purga (función pura) los importados no clasificados que superan el TTL. Devuelve la misma bandeja si
 * no hay nada que purgar (identidad estable para evitar re-render/escrituras innecesarias).
 */
export function purgeStaleImports(
  inbox: ImportInbox,
  now: number,
  ttlMs: number = IMPORT_TTL_MS,
): { inbox: ImportInbox; removed: number } {
  const kept = inbox.imported.filter((g) => now - g.importedAt <= ttlMs);
  const removed = inbox.imported.length - kept.length;
  if (removed === 0) return { inbox, removed: 0 };
  return { inbox: { imported: kept, updatedAt: now }, removed };
}

/** Elimina una entrada de la bandeja por id (al clasificar o descartar). Pura; identidad estable si no cambia. */
export function removeFromInbox(inbox: ImportInbox, id: number, now: number): ImportInbox {
  const imported = inbox.imported.filter((g) => g.id !== id);
  if (imported.length === inbox.imported.length) return inbox;
  return { imported, updatedAt: now };
}

/** Elimina varias entradas por id en una sola pasada (borrado en lote). Pura; identidad estable si no cambia. */
export function removeManyFromInbox(inbox: ImportInbox, ids: number[], now: number): ImportInbox {
  if (ids.length === 0) return inbox;
  const idSet = new Set(ids);
  const imported = inbox.imported.filter((g) => !idSet.has(g.id));
  if (imported.length === inbox.imported.length) return inbox;
  return { imported, updatedAt: now };
}

/**
 * Fusión para ENRIQUECER un juego que YA existe en las listas con lo aportado por el importado: une
 * géneros y plataformas (sin duplicar) y rellena las horas si el existente no tenía. NO toca el nombre.
 * Devuelve solo los campos a actualizar (para combinar con el juego existente y abrir el formulario).
 */
export function mergeImportedIntoGame(existing: GameItem, item: ImportedGame): Partial<GameItem> {
  return {
    genres: uniqueCaseInsensitive([...(existing.genres || []), ...item.genres]),
    platforms: uniqueCaseInsensitive([...(existing.platforms || []), ...item.platforms]),
    hours: (existing.hours ?? null) === null ? (item.hours ?? null) : existing.hours,
  };
}

/**
 * Mapea un item de la bandeja a los campos de un juego para PRECARGAR el formulario al clasificar.
 * NO se copia: los campos de import (externalIds/coverUrl/sources), ni el año — `years` son los años
 * JUGADOS (no el de lanzamiento), así que el usuario los rellena en el formulario. `grade` (nota del
 * usuario en el origen) sí se precarga cuando viene.
 */
export function importedToPartialGame(item: ImportedGame): Partial<GameItem> {
  const partial: Partial<GameItem> = {
    name: item.name,
    genres: [...item.genres],
    platforms: [...item.platforms],
    hours: item.hours ?? null,
  };
  if (typeof item.grade === 'number') partial.grade = item.grade;
  return partial;
}
