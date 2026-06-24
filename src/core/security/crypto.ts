/**
 * Módulo de cifrado AES-GCM (SubtleCrypto nativo). Ofrece DOS mecanismos con garantías distintas:
 *
 * 1) Cifrado por SECRETO derivado (PBKDF2) — `encrypt`/`decrypt`/`encryptToString`/`decryptFromString`.
 *    La clave se DERIVA de un `secret`. Si el secreto es reproducible en cualquier dispositivo (p. ej. el uid de
 *    Google), el dato se puede descifrar tras reinstalar o en otro equipo. OJO: el uid NO es un secreto de alta
 *    entropía (es público y suele acompañar al ciphertext), así que esto es OFUSCACIÓN, no confidencialidad real
 *    frente a quien acceda al dato. La protección efectiva del token de GitHub en `privateConfig` es la REGLA
 *    owner-only de Firestore, no este cifrado. v2 usa salt aleatorio por mensaje + 600k iteraciones PBKDF2.
 *
 * 2) Cifrado por CLAVE DE DISPOSITIVO no exportable (C4) — `encryptWithDeviceKey`/`decryptWithDeviceKey`.
 *    Clave AES-GCM aleatoria, NO exportable, guardada en IndexedDB: ni el propio JS puede leer su material.
 *    Sirve para secretos LOCALES en reposo (la copia operativa del token en localStorage). NO sirve para datos que
 *    deban descifrarse en otro dispositivo. Protege ante copia del localStorage; no ante XSS ya ejecutándose en el origen.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits para GCM
const TAG_LENGTH = 128; // 128 bits
const SALT_LENGTH = 16; // 128 bits de salt aleatorio por mensaje (v2)

// C3: el v1 usaba salt fijo + 100k iteraciones. v2 usa salt aleatorio por mensaje (guardado en el payload) y
// 600k iteraciones (recomendación OWASP 2023+ para PBKDF2-HMAC-SHA256). Se mantiene la LECTURA de v1 para no
// invalidar tokens ya cifrados; toda escritura nueva es v2.
const PBKDF2_ITERATIONS_V1 = 100_000;
const PBKDF2_ITERATIONS_V2 = 600_000;
const LEGACY_FIXED_SALT = 'myGameList-v1-salt';

interface EncryptedData {
  iv: string; // Base64
  ciphertext: string; // Base64
  version: number;
  salt?: string; // Base64 — presente desde v2 (salt aleatorio por mensaje)
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(atob(b64).split('').map((c) => c.charCodeAt(0)));
}

/**
 * Genera una clave derivada usando PBKDF2.
 * Se deriva desde el hash de la sesión del navegador para que sea único por dispositivo/navegador.
 * 
 * @param password - Contraseña o seed para derivar la clave
 * @returns Clave CryptoKey para usar con encriptación AES-GCM
 */
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Obtiene o genera una clave maestra para esta sesión.
 * Se basa en información del navegador para crear una clave única por dispositivo.
 * NOTA: Esto NO es una clave de usuario, es una clave de sesión local.
 */
function getSessionSeed(): string {
  // Usar información del navegador para crear un seed único
  // Esto hace que la encriptación sea específica del navegador/dispositivo
  const ua = navigator.userAgent;
  const lang = navigator.language;
  const tz = new Date().getTimezoneOffset().toString();
  
  // Combinar para crear un seed único
  return `${ua}|${lang}|${tz}`;
}

/**
 * Encripta datos de forma simétrica.
 * Los datos se encriptan con AES-GCM usando una clave derivada de la sesión.
 * 
 * @param plaintext - Texto a encriptar (típicamente JSON stringificado)
 * @returns Objeto con IV y ciphertext en Base64
 */
export async function encrypt(plaintext: string, seed: string = getSessionSeed()): Promise<EncryptedData> {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const key = await deriveKey(seed, salt, PBKDF2_ITERATIONS_V2);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      encodedData
    );

    return {
      version: 2,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    };
  } catch (error) {
    console.error('Encryptión falló:', error);
    throw error;
  }
}

/**
 * Desencripta datos encriptados.
 * 
 * @param encrypted - Objeto con IV y ciphertext en Base64
 * @returns Texto desencriptado
 */
export async function decrypt(encrypted: EncryptedData, seed: string = getSessionSeed()): Promise<string> {
  try {
    let salt: Uint8Array<ArrayBuffer>;
    let iterations: number;
    if (encrypted.version === 1) {
      // Retrocompat: salt fijo + 100k iteraciones (tokens cifrados antes de C3).
      salt = new Uint8Array(new TextEncoder().encode(LEGACY_FIXED_SALT));
      iterations = PBKDF2_ITERATIONS_V1;
    } else if (encrypted.version === 2) {
      if (!encrypted.salt) {
        throw new Error('Payload v2 sin salt');
      }
      salt = base64ToBytes(encrypted.salt);
      iterations = PBKDF2_ITERATIONS_V2;
    } else {
      throw new Error(`Versión de encriptación no soportada: ${encrypted.version}`);
    }

    const key = await deriveKey(seed, salt, iterations);

    const iv = base64ToBytes(encrypted.iv);
    const ciphertextData = base64ToBytes(encrypted.ciphertext);

    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      ciphertextData
    );

    return new TextDecoder().decode(plaintext);
  } catch (error) {
    console.error('Desencriptación falló:', error);
    throw error;
  }
}

/**
 * Detecta si SubtleCrypto está disponible en el navegador.
 * En navegadores modernos, crypto.subtle siempre debe estar disponible.
 */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

// ---------------------------------------------------------------------------
// C4 — Clave de dispositivo NO exportable (IndexedDB) para cifrar secretos locales EN REPOSO.
// ---------------------------------------------------------------------------

const DEVICE_KEY_DB = 'mygamelist-secure';
const DEVICE_KEY_STORE = 'keys';
const DEVICE_KEY_ID = 'token-key-v1';

function openDeviceKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DEVICE_KEY_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DEVICE_KEY_STORE)) {
        db.createObjectStore(DEVICE_KEY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let _deviceKeyPromise: Promise<CryptoKey> | null = null;

async function loadOrGenerateDeviceKey(): Promise<CryptoKey> {
  const db = await openDeviceKeyDb();
  try {
    const readTx = db.transaction(DEVICE_KEY_STORE, 'readonly');
    const existing = await idbRequest(readTx.objectStore(DEVICE_KEY_STORE).get(DEVICE_KEY_ID));
    if (existing) {
      return existing as CryptoKey;
    }
    // Clave aleatoria NO exportable: el material nunca sale de SubtleCrypto.
    const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']);
    const writeTx = db.transaction(DEVICE_KEY_STORE, 'readwrite');
    await idbRequest(writeTx.objectStore(DEVICE_KEY_STORE).put(key, DEVICE_KEY_ID));
    return key;
  } finally {
    db.close();
  }
}

function getOrCreateDeviceKey(): Promise<CryptoKey> {
  // Cachea la promesa (y por tanto la CryptoKey) en memoria para no tocar IndexedDB en cada cifrado.
  if (!_deviceKeyPromise) {
    _deviceKeyPromise = loadOrGenerateDeviceKey().catch((error) => {
      _deviceKeyPromise = null; // permite reintento tras un fallo transitorio
      throw error;
    });
  }
  return _deviceKeyPromise;
}

/** Cifra un secreto local con la clave de dispositivo no exportable. Devuelve un blob JSON para localStorage. */
export async function encryptWithDeviceKey(plaintext: string): Promise<string> {
  const key = await getOrCreateDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    key,
    new TextEncoder().encode(plaintext),
  );
  return JSON.stringify({ version: 1, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
}

/** Descifra un blob producido por `encryptWithDeviceKey`. Lanza si la clave de dispositivo no coincide. */
export async function decryptWithDeviceKey(payload: string): Promise<string> {
  const key = await getOrCreateDeviceKey();
  const parsed = JSON.parse(payload) as { iv: string; ciphertext: string };
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: base64ToBytes(parsed.iv), tagLength: TAG_LENGTH },
    key,
    base64ToBytes(parsed.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Cifra a una cadena (JSON) usando una clave derivada de `secret`.
 * A diferencia de `encrypt()` (clave por dispositivo/navegador), usar un secreto ESTABLE entre
 * dispositivos (p. ej. el uid de Google) permite descifrar tras reinstalar o en otro equipo.
 */
export async function encryptToString(plaintext: string, secret: string): Promise<string> {
  return JSON.stringify(await encrypt(plaintext, secret));
}

/** Descifra una cadena producida por `encryptToString` usando el mismo `secret`. */
export async function decryptFromString(payload: string, secret: string): Promise<string> {
  const parsed = JSON.parse(payload) as EncryptedData;
  return decrypt(parsed, secret);
}

/**
 * ADVERTENCIA DE SEGURIDAD:
 * =========================
 * Esta encriptación proporciona protección CONTRA LECTURA LOCAL en localStorage.
 * NO proporciona protección contra:
 * - Acceso físico al navegador o cuenta de usuario
 * - Malware en el sistema
 * - Inspector de elementos (Dev Tools) abierto
 * - Ataques de sesión en la red
 * 
 * Para máxima seguridad:
 * 1. Usa HTTPS siempre
 * 2. No compartas credenciales
 * 3. Cierra sesión cuando uses navegadores públicos
 * 4. Considera usar un service worker para manejar datos sensibles
 */
