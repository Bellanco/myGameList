/* ═══════════════════════════════════════════════════════════════════
   MIGRATE.JS — Conversión de formato heredado a nomenclatura oficial
   Este fichero puede eliminarse una vez todos los datos estén
   migrados al formato v12 (claves en inglés camelCase).
═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    function migrateGame(game, tab) {
        /* Si ya tiene la clave 'name', está en formato v12: no tocar */
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

        const out = {};
        if (game.id !== undefined) out.id = game.id;
        out.name = game.nombre || '';

        const platforms = game.plataformas || (game.plataforma ? [game.plataforma] : []);
        if (platforms.length) out.platforms = platforms;

        const genres = game.generos || (game.genero ? [game.genero] : []);
        if (genres.length) out.genres = genres;

        if (game.steam_deck) out.steamDeck = true;

        if (tab === 'c') {
            if (game.puntuacion) out.score = game.puntuacion;
            if (game.rejugabilidad) out.replayable = true;
            if (game.horas != null) out.hours = game.horas;
            if (game.años?.length) out.years = game.años;
            if (game.pf?.length) out.strengths = game.pf;
            if (game.pd?.length) out.weaknesses = game.pd;
            if (game.reseña) out.review = game.reseña;
        } else if (tab === 'v') {
            if (game.pf?.length) out.strengths = game.pf;
            if (game.reseña) out.review = game.reseña;
            if (game.volver) out.retry = true;
            const reasons = Array.isArray(game.razones)
                ? game.razones
                : (typeof game.razon === 'string' && game.razon ? [game.razon] : []);
            if (reasons.length) out.reasons = reasons;
        } else if (tab === 'e') {
            if (game.pf?.length) out.strengths = game.pf;
            if (game.pd?.length) out.weaknesses = game.pd;
            if (game.reseña) out.review = game.reseña;
        } else if (tab === 'p') {
            if (game.puntuacion) out.score = game.puntuacion;
        }

        return out;
    }

    window.migrateData = function (data) {
        if (!data || typeof data !== 'object') return data;
        return {
            c: (Array.isArray(data.c) ? data.c : []).map(g => migrateGame(g, 'c')),
            v: (Array.isArray(data.v) ? data.v : []).map(g => migrateGame(g, 'v')),
            e: (Array.isArray(data.e) ? data.e : []).map(g => migrateGame(g, 'e')),
            p: (Array.isArray(data.p) ? data.p : []).map(g => migrateGame(g, 'p')),
            deleted: Array.isArray(data.deleted) ? data.deleted : [],
            updatedAt: Number(data.updatedAt ?? data.meta?.updatedAt ?? 0) || Date.now(),
        };
    };
}());