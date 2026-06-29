import { describe, expect, it } from 'vitest';
import {
  assembleChunkedSocial,
  buildSocialFiles,
  socialChunkFilename,
} from '../../src/model/repository/socialProjection';
import { assertValidSocialGist } from '../../src/model/schemas/socialGistSchema';
import type { SocialGistData } from '../../src/model/types/social';

const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

// Entrada de `sharedLists` con la forma PÚBLICA estricta (sharedGame del schema): sin campos privados.
function makeShared(id: number) {
  return {
    id,
    name: `Juego ${id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    rating: 4,
    snippet: 's'.repeat(120), // snippet realista (≤160) para inflar el tamaño y forzar overflow
  };
}

function makeData(perTab: number): SocialGistData {
  const sharedLists: Record<string, ReturnType<typeof makeShared>[]> = { c: [], v: [], e: [], p: [] };
  let id = 1;
  for (const tab of ['c', 'v', 'e', 'p']) {
    for (let i = 0; i < perTab; i += 1) sharedLists[tab].push(makeShared(id++));
  }
  return {
    profile: {
      name: 'Yo',
      private: false,
      favoriteGames: [],
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists,
    },
    activity: [],
    posts: [],
    updatedAt: 1,
    schemaVersion: 2,
  } as unknown as SocialGistData;
}

/** Simula la respuesta de gist: ancla + ficheros de overflow, tal como los subiría writeSocialGist. */
function toGistFiles(data: SocialGistData): Record<string, { content: string }> {
  const { anchor, chunkFiles } = buildSocialFiles(data);
  const files: Record<string, { content: string }> = {
    [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(anchor) },
  };
  for (const [name, file] of Object.entries(chunkFiles)) files[name] = { content: JSON.stringify(file) };
  return files;
}

function idsByTab(sharedLists: Record<string, Array<{ id: number }>>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const tab of ['c', 'v', 'e', 'p']) out[tab] = (sharedLists[tab] || []).map((g) => g.id).sort((a, b) => a - b);
  return out;
}

describe('A6 — chunking del gist social (sharedLists)', () => {
  it('con pocas listas no genera overflow (un único fichero) y el reensamblado es identidad', () => {
    const data = makeData(3);
    const { anchor, chunkFiles } = buildSocialFiles(data);

    expect(Object.keys(chunkFiles)).toHaveLength(0);
    expect(anchor.chunkIndex?.chunks).toHaveLength(1); // solo `main`

    const files = toGistFiles(data);
    const reassembled = assembleChunkedSocial(JSON.parse(files[SOCIAL_GIST_FILENAME].content), files) as SocialGistData;
    expect(idsByTab(reassembled.profile.sharedLists as never)).toEqual(idsByTab(data.profile.sharedLists as never));
  });

  it('con listas grandes parte en varios ficheros y el round-trip reconstruye TODAS las entradas sin pérdida ni duplicados', () => {
    const data = makeData(2500); // ~10k entradas → fuerza main + varios chunks
    const { chunkFiles } = buildSocialFiles(data);
    expect(Object.keys(chunkFiles).length).toBeGreaterThanOrEqual(1); // hay overflow real
    // Los ficheros de overflow siguen el patrón de nombre esperado.
    for (const name of Object.keys(chunkFiles)) expect(name).toMatch(/^myGameList\.social-chunk-c\d+\.json$/);

    const files = toGistFiles(data);
    const reassembled = assembleChunkedSocial(JSON.parse(files[SOCIAL_GIST_FILENAME].content), files) as SocialGistData;

    // Mismo conjunto exacto de ids por pestaña (sin pérdida, sin duplicados).
    expect(idsByTab(reassembled.profile.sharedLists as never)).toEqual(idsByTab(data.profile.sharedLists as never));
    const total = (sl: Record<string, unknown[]>) => ['c', 'v', 'e', 'p'].reduce((n, t) => n + (sl[t]?.length || 0), 0);
    expect(total(reassembled.profile.sharedLists as never)).toBe(10000);
  });

  it('el ancla (con chunkIndex + bucket main) sigue cumpliendo la allowlist estricta del schema social', () => {
    const { anchor } = buildSocialFiles(makeData(2500));
    expect(() => assertValidSocialGist(anchor)).not.toThrow();
  });

  it('un chunk ausente conserva lo disponible (no rompe la lectura)', () => {
    const data = makeData(2500);
    const files = toGistFiles(data);
    // Elimina un fichero de overflow: el reensamblado debe seguir devolviendo el resto sin lanzar.
    const aChunk = Object.keys(files).find((n) => n !== SOCIAL_GIST_FILENAME)!;
    delete files[aChunk];
    const reassembled = assembleChunkedSocial(JSON.parse(files[SOCIAL_GIST_FILENAME].content), files) as SocialGistData;
    const total = (sl: Record<string, unknown[]>) => ['c', 'v', 'e', 'p'].reduce((n, t) => n + (sl[t]?.length || 0), 0);
    expect(total(reassembled.profile.sharedLists as never)).toBeGreaterThan(0);
    expect(total(reassembled.profile.sharedLists as never)).toBeLessThan(10000);
    expect(socialChunkFilename('c1')).toBe('myGameList.social-chunk-c1.json');
  });
});
