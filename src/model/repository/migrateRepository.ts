import type { GameItem, TabData } from '../types/game';

type LegacyGame = Record<string, unknown>;

function migrateGame(game: LegacyGame, tab: 'c' | 'v' | 'e' | 'p'): Record<string, unknown> {
  if ('name' in game) {
    const out = { ...game };

    if (tab === 'v' && !('reasons' in out)) {
      if (Array.isArray(game.razones)) out.reasons = game.razones;
      else if (typeof game.razon === 'string' && game.razon) out.reasons = [game.razon];
    }

    if ((tab === 'c' || tab === 'e') && !('weaknesses' in out) && Array.isArray(game.pd)) {
      out.weaknesses = game.pd;
    }

    return out;
  }

  const out: Record<string, unknown> = {};
  if (game.id !== undefined) out.id = game.id;
  out.name = game.nombre || '';

  const platforms = (game.plataformas as unknown[]) || (game.plataforma ? [game.plataforma] : []);
  if (platforms.length) out.platforms = platforms;

  const genres = (game.generos as unknown[]) || (game.genero ? [game.genero] : []);
  if (genres.length) out.genres = genres;

  if (game.steam_deck) out.steamDeck = true;

  if (tab === 'c') {
    if (game.puntuacion) out.score = game.puntuacion;
    if (game.rejugabilidad) out.replayable = true;
    if (game.horas != null) out.hours = game.horas;
    if (Array.isArray(game.años) && game.años.length) out.years = game.años;
    if (Array.isArray(game.pf) && game.pf.length) out.strengths = game.pf;
    if (Array.isArray(game.pd) && game.pd.length) out.weaknesses = game.pd;
    if (game.reseña) out.review = game.reseña;
  }

  if (tab === 'v') {
    if (Array.isArray(game.pf) && game.pf.length) out.strengths = game.pf;
    if (game.reseña) out.review = game.reseña;
    if (game.volver) out.retry = true;
    const reasons = Array.isArray(game.razones)
      ? game.razones
      : typeof game.razon === 'string' && game.razon
        ? [game.razon]
        : [];
    if (reasons.length) out.reasons = reasons;
  }

  if (tab === 'e') {
    if (Array.isArray(game.pf) && game.pf.length) out.strengths = game.pf;
    if (Array.isArray(game.pd) && game.pd.length) out.weaknesses = game.pd;
    if (game.reseña) out.review = game.reseña;
  }

  if (tab === 'p' && game.puntuacion) {
    out.score = game.puntuacion;
  }

  return out;
}

export function migrateData(input: unknown): TabData {
  const data = input as Record<string, unknown> | null;

  if (!data || typeof data !== 'object') {
    return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
  }

  return {
    c: (Array.isArray(data.c) ? data.c : []).map((g) => migrateGame(g as LegacyGame, 'c') as unknown as GameItem),
    v: (Array.isArray(data.v) ? data.v : []).map((g) => migrateGame(g as LegacyGame, 'v') as unknown as GameItem),
    e: (Array.isArray(data.e) ? data.e : []).map((g) => migrateGame(g as LegacyGame, 'e') as unknown as GameItem),
    p: (Array.isArray(data.p) ? data.p : []).map((g) => migrateGame(g as LegacyGame, 'p') as unknown as GameItem),
    deleted: Array.isArray(data.deleted) ? (data.deleted as TabData['deleted']) : [],
    updatedAt: Number(data.updatedAt ?? (data.meta as Record<string, unknown> | undefined)?.updatedAt ?? 0) || Date.now(),
  };
}
