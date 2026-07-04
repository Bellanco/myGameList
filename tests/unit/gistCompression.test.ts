import { describe, expect, it } from 'vitest';
import {
  COMPRESSION_ENC,
  COMPRESSION_ENVELOPE_VERSION,
  compressToBase64,
  decodeGistContent,
  decompressFromBase64,
  encodeCompressed,
  isCompressedEnvelope,
} from '../../src/core/utils/gistCompression';

describe('gistCompression', () => {
  it('round-trip exacto de una cadena JSON', async () => {
    const original = JSON.stringify({ a: 1, b: 'hola', c: [1, 2, 3], d: { e: true } });
    const b64 = await compressToBase64(original);
    expect(await decompressFromBase64(b64)).toBe(original);
  });

  it('round-trip con Unicode/emoji', async () => {
    const original = 'áéíóú ñ 日本語 🎮🕹️ — "comillas" & <tags>';
    expect(await decompressFromBase64(await compressToBase64(original))).toBe(original);
  });

  it('round-trip con carga grande (no desborda el stack al hacer base64)', async () => {
    const original = JSON.stringify(
      Array.from({ length: 5000 }, (_, i) => ({ id: i, name: `Juego ${i}`, genres: ['acción', 'rpg'] })),
    );
    const b64 = await compressToBase64(original);
    expect(await decompressFromBase64(b64)).toBe(original);
  });

  it('comprime de verdad (texto repetitivo → base64 más corto que el original)', async () => {
    const original = JSON.stringify(
      Array.from({ length: 1000 }, () => ({ genres: ['acción', 'aventura'], platforms: ['PC', 'PS5'] })),
    );
    const b64 = await compressToBase64(original);
    expect(b64.length).toBeLessThan(original.length);
  });

  it('isCompressedEnvelope detecta el sobre y rechaza JSON normal', () => {
    expect(isCompressedEnvelope({ enc: COMPRESSION_ENC, payload: 'abc' })).toBe(true);
    expect(isCompressedEnvelope({ c: [], v: [] })).toBe(false);
    expect(isCompressedEnvelope({ enc: COMPRESSION_ENC })).toBe(false); // sin payload string
    expect(isCompressedEnvelope(null)).toBe(false);
    expect(isCompressedEnvelope('texto')).toBe(false);
  });

  it('decodeGistContent descomprime el sobre y marca wasCompressed', async () => {
    const plainJson = JSON.stringify({ schemaVersion: 4, fileType: 'games-main', games: {} });
    const envelope = JSON.stringify({
      fileType: 'games',
      schemaVersion: 5,
      enc: COMPRESSION_ENC,
      payload: await compressToBase64(plainJson),
    });
    const decoded = await decodeGistContent(envelope);
    expect(decoded).toEqual({ content: plainJson, wasCompressed: true });
  });

  it('encodeCompressed produce un sobre válido que decodeGistContent revierte (round-trip de escritura)', async () => {
    const anchor = JSON.stringify({ schemaVersion: 4, fileType: 'games-main', games: { 1: { name: 'X' } } });
    const envelope = await encodeCompressed('games', anchor);
    const parsed = JSON.parse(envelope);
    expect(parsed.enc).toBe(COMPRESSION_ENC);
    expect(parsed.schemaVersion).toBe(COMPRESSION_ENVELOPE_VERSION);
    expect(parsed.fileType).toBe('games');
    expect(isCompressedEnvelope(parsed)).toBe(true);
    expect(await decodeGistContent(envelope)).toEqual({ content: anchor, wasCompressed: true });
  });

  it('el sobre comprimido sigue siendo JSON válido (cliente sin soporte no explota al parsear)', async () => {
    const envelope = await encodeCompressed('games', JSON.stringify({ a: 1 }));
    expect(() => JSON.parse(envelope)).not.toThrow();
  });

  it('decodeGistContent deja pasar contenido plano sin tocar', async () => {
    const plain = JSON.stringify({ c: [], v: [], e: [], p: [] });
    expect(await decodeGistContent(plain)).toEqual({ content: plain, wasCompressed: false });
  });

  it('decodeGistContent no lanza con contenido no-JSON (lo devuelve tal cual)', async () => {
    expect(await decodeGistContent('no es json {')).toEqual({ content: 'no es json {', wasCompressed: false });
  });
});
