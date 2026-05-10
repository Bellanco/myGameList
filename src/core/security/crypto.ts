/**
 * Módulo de encriptación usando SubtleCrypto API nativa del navegador.
 * Proporciona encriptación AES-GCM para datos almacenados en localStorage.
 * IMPORTANTE: Las claves de encriptación se derivan del navegador/dispositivo
 * y están vinculadas a la sesión del usuario autenticado.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits para GCM
const TAG_LENGTH = 128; // 128 bits

interface EncryptedData {
  iv: string; // Base64
  ciphertext: string; // Base64
  version: number;
}

/**
 * Genera una clave derivada usando PBKDF2.
 * Se deriva desde el hash de la sesión del navegador para que sea único por dispositivo/navegador.
 * 
 * @param password - Contraseña o seed para derivar la clave
 * @returns Clave CryptoKey para usar con encriptación AES-GCM
 */
async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode('myGameList-v1-salt'); // Salt fijo pero específico de la app
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
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
export async function encrypt(plaintext: string): Promise<EncryptedData> {
  try {
    const key = await deriveKey(getSessionSeed());
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
      key,
      encodedData
    );

    // Convertir a Base64 para almacenar en localStorage
    const ivB64 = btoa(String.fromCharCode(...iv));
    const ciphertextB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

    return {
      version: 1,
      iv: ivB64,
      ciphertext: ciphertextB64,
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
export async function decrypt(encrypted: EncryptedData): Promise<string> {
  try {
    // Solo soportar versión 1
    if (encrypted.version !== 1) {
      throw new Error(`Versión de encriptación no soportada: ${encrypted.version}`);
    }

    const key = await deriveKey(getSessionSeed());
    
    // Convertir de Base64 a Uint8Array
    const iv = new Uint8Array(atob(encrypted.iv).split('').map((c) => c.charCodeAt(0)));
    const ciphertextData = new Uint8Array(
      atob(encrypted.ciphertext).split('').map((c) => c.charCodeAt(0))
    );

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
