import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  decrypt,
  decryptFromString,
  decryptWithDeviceKey,
  encrypt,
  encryptToString,
  encryptWithDeviceKey,
} from '../../src/core/security/crypto';

describe('crypto (C3) — cifrado por secreto derivado', () => {
  it('round-trip v2: descifra con el mismo secreto', async () => {
    const secret = 'uid-abc-123';
    const blob = await encryptToString('ghp_tokensecreto', secret);
    expect(await decryptFromString(blob, secret)).toBe('ghp_tokensecreto');
  });

  it('escritura nueva es v2 con salt aleatorio por mensaje', async () => {
    const a = await encrypt('hola', 'secreto');
    const b = await encrypt('hola', 'secreto');
    expect(a.version).toBe(2);
    expect(a.salt).toBeTruthy();
    // Salt e IV aleatorios → dos cifrados del mismo texto difieren.
    expect(a.salt).not.toBe(b.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('descifra con secreto incorrecto falla', async () => {
    const blob = await encryptToString('dato', 'secreto-bueno');
    await expect(decryptFromString(blob, 'secreto-malo')).rejects.toBeDefined();
  });

  it('retrocompat: sigue descifrando payloads v1 (salt fijo, 100k iteraciones)', async () => {
    // Payload v1 generado con el esquema antiguo (salt fijo 'myGameList-v1-salt', 100000 iteraciones).
    // Se reconstruye aquí con WebCrypto para fijar la garantía de lectura retrocompatible.
    const secret = 'uid-legacy';
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('myGameList-v1-salt'), iterations: 100000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, enc.encode('token-viejo'));
    const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    const v1 = { version: 1, iv: toB64(iv), ciphertext: toB64(new Uint8Array(ct)) };
    expect(await decrypt(v1, secret)).toBe('token-viejo');
  });
});

describe('crypto (C4) — clave de dispositivo no exportable', () => {
  it('round-trip con clave de dispositivo', async () => {
    const blob = await encryptWithDeviceKey('ghp_local');
    expect(blob).not.toContain('ghp_local'); // no hay token en claro en el blob
    expect(await decryptWithDeviceKey(blob)).toBe('ghp_local');
  });
});
