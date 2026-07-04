// Compresión del contenido de los gists (juegos): gzip nativo (`CompressionStream`) + base64, envuelto en un
// sobre versionado que SIGUE SIENDO JSON válido. Objetivo: reducir el tamaño real almacenado (~70-75%) y
// ralentizar el crecimiento del gist. Ver .github/prompts/migration/GIST-COMPRESSION-PLAN.md.
//
// Fase 0 (este módulo) + Fase 1 (lectura retrocompatible): la LECTURA sabe descomprimir; la ESCRITURA sigue
// GATED (Fase 2). Un cliente sin este soporte que lea un gist comprimido ve un JSON `{enc:...}` que no reconoce
// y lo trata como no-legible (por eso el cutover es en 2 pasos).

/** Marcador del envoltorio comprimido. `payload` = base64(gzip(JSON plano)). */
export const COMPRESSION_ENC = 'gzip+b64';

/** Versión del formato del SOBRE (no del contenido: el JSON de dentro conserva su propio `schemaVersion`). */
export const COMPRESSION_ENVELOPE_VERSION = 5;

/** Sobre versionado que envuelve el contenido comprimido de un fichero del gist. Es JSON válido. */
export interface CompressedEnvelope {
  fileType: string;
  schemaVersion: number;
  enc: typeof COMPRESSION_ENC;
  payload: string;
}

// base64 troceado: `btoa(String.fromCharCode(...bytes))` desborda el stack con arrays grandes, así que
// convertimos en bloques. (Los helpers equivalentes de crypto.ts son privados de ese módulo.)
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000; // 32 KiB por bloque
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function pipeThroughStream(bytes: BufferSource, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

/** Comprime una cadena a base64 (gzip). Async: usa streams nativos. */
export async function compressToBase64(text: string): Promise<string> {
  const input = new TextEncoder().encode(text);
  const compressed = await pipeThroughStream(input, new CompressionStream('gzip'));
  return bytesToBase64(compressed);
}

/** Inverso de `compressToBase64`. */
export async function decompressFromBase64(b64: string): Promise<string> {
  const bytes = base64ToBytes(b64);
  const out = await pipeThroughStream(bytes, new DecompressionStream('gzip'));
  return new TextDecoder().decode(out);
}

/**
 * Envuelve un JSON plano en el sobre comprimido `{fileType, schemaVersion, enc, payload}`. El resultado SIGUE SIENDO
 * JSON válido (un cliente sin soporte lo parsea pero no reconoce `enc` → lo trata como no-legible). Escritura (Fase 2).
 */
export async function encodeCompressed(fileType: string, plainJson: string): Promise<string> {
  const payload = await compressToBase64(plainJson);
  return JSON.stringify({ fileType, schemaVersion: COMPRESSION_ENVELOPE_VERSION, enc: COMPRESSION_ENC, payload });
}

/** ¿El valor parseado es un sobre comprimido `{enc:'gzip+b64', payload:string}`? Tolerante en lectura. */
export function isCompressedEnvelope(value: unknown): value is CompressedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return o.enc === COMPRESSION_ENC && typeof o.payload === 'string';
}

/**
 * Decodifica el `content` de un fichero del gist: si viene comprimido (sobre `enc`), lo descomprime y devuelve el
 * JSON plano; si no, lo devuelve tal cual. Devuelve además si estaba comprimido (para el auto-upgrade de formato).
 * No lanza por contenido no-JSON (lo deja pasar sin tocar para que el `JSON.parse` de aguas abajo dé su propio error).
 */
export async function decodeGistContent(content: string): Promise<{ content: string; wasCompressed: boolean }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { content, wasCompressed: false };
  }
  if (isCompressedEnvelope(parsed)) {
    const plain = await decompressFromBase64(parsed.payload);
    return { content: plain, wasCompressed: true };
  }
  return { content, wasCompressed: false };
}
