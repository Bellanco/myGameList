/**
 * Concede (o retira) el custom claim `admin` de una cuenta.
 *
 * ES LA PIEZA QUE FALTABA al cambiar el criterio de administrador: `firestore.rules` y el cliente
 * (`src/core/security/admin.ts`) preguntan por `request.auth.token.admin`, y ese claim SOLO lo puede escribir el
 * servidor con el Admin SDK. Sin este script no hay forma de nombrar a nadie.
 *
 * USO
 *   npm i firebase-admin --prefix /tmp/admin-sdk
 *   node scripts/set-admin-claim.mjs --sdk /tmp/admin-sdk/node_modules --key clave.json --email alguien@example.com
 *   node scripts/set-admin-claim.mjs --sdk ... --key clave.json --email alguien@example.com --check
 *   node scripts/set-admin-claim.mjs --sdk ... --key clave.json --uid <uid> --revoke
 *
 * `firebase-admin` NO es dependencia del proyecto (no hace falta para construir ni para probar, y son unos
 * cuantos megas). Igual que `firebase-tools` en `test:rules`, se trae al vuelo y se le dice dónde está con
 * `--sdk`; también sirve `ADMIN_SDK_PATH`.
 *
 * DOS TRAMPAS QUE ESTE SCRIPT YA SORTEA, y que costaron dos intentos:
 *
 *  1. `NODE_PATH` NO SIRVE. Esa variable solo la mira la resolución de CommonJS (`require`); este fichero es un
 *     módulo ES y sus `import()` la ignoran. De ahí `--sdk` y el `createRequire` de `loadAdminSdk`.
 *  2. LA API NAMESPACED YA NO EXISTE. Desde firebase-admin 14, `require('firebase-admin')` devuelve la API
 *     MODULAR —`initializeApp`, `cert`, `applicationDefault`…— y ya NO trae `admin.credential` ni `admin.auth()`.
 *     Lo de siempre (`admin.credential.applicationDefault()`) revienta con «Cannot read properties of undefined».
 *     Por eso aquí se usan los subpaths `firebase-admin/app` y `firebase-admin/auth`, que existen desde la v10 y
 *     valen para todas las versiones modernas.
 *
 * LA CLAVE DE SERVICIO no se commitea NUNCA: se descarga de la consola de Firebase (Configuración del proyecto →
 * Cuentas de servicio → Generar nueva clave privada), se usa y se borra. Da acceso total al proyecto.
 *
 * DESPUÉS DE EJECUTARLO hay que VOLVER A INICIAR SESIÓN en la app, o esperar a que el ID token se renueve (hasta
 * una hora): el claim viaja dentro del token, y el que el navegador tiene en memoria es el de antes. La app
 * reintenta forzando el refresco al abrir el panel (`useAdminViewModel`), así que en la práctica basta con
 * recargar `/admin`.
 *
 * ORDEN AL MIGRAR: primero este script, después desplegar `firestore.rules`. Al revés, el panel se queda sin
 * nadie dentro hasta que el claim llegue.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] || '' : '';
};

const email = value('email');
const uid = value('uid');
const key = value('key') || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
const revoke = flag('revoke');
const check = flag('check');

if (!email && !uid) {
  console.error('Falta a quién: usa --email <correo> o --uid <uid>.');
  console.error('Ejemplo: node scripts/set-admin-claim.mjs --sdk /tmp/admin-sdk/node_modules --key clave.json --email tu@correo.com');
  process.exit(1);
}

/**
 * Carga los dos módulos del Admin SDK que hacen falta, estén en el proyecto o en la carpeta de `--sdk`.
 *
 * Se piden por SUBPATH (`firebase-admin/app`, `firebase-admin/auth`) y no por la raíz del paquete: es la API
 * estable desde la v10 y la única que sigue existiendo en la v14 (ver la trampa 2 de la cabecera).
 */
async function loadAdminSdk() {
  const sdkPath = value('sdk') || process.env.ADMIN_SDK_PATH || '';
  const require = sdkPath
    ? createRequire(pathToFileURL(path.join(path.resolve(sdkPath), 'anchor.js')))
    : createRequire(import.meta.url);
  try {
    return { app: require('firebase-admin/app'), auth: require('firebase-admin/auth') };
  } catch (error) {
    console.error('No se pudo cargar `firebase-admin`, que es la única forma de escribir un custom claim.');
    console.error(`  ${error instanceof Error ? error.message : error}`);
    console.error('No es dependencia del proyecto a propósito; tráela al vuelo y dile dónde está:');
    console.error('  npm i firebase-admin --prefix /tmp/admin-sdk');
    console.error('  node scripts/set-admin-claim.mjs --sdk /tmp/admin-sdk/node_modules --key clave.json --email tu@correo.com');
    console.error('(NODE_PATH no vale: solo la mira CommonJS, y este script es un módulo ES.)');
    return null;
  }
}

const sdk = await loadAdminSdk();
if (!sdk) {
  process.exit(1);
}

const { initializeApp, cert, applicationDefault } = sdk.app;
const { getAuth } = sdk.auth;

if (!key) {
  console.error('Falta la clave de servicio: pásala con --key <ruta> o en GOOGLE_APPLICATION_CREDENTIALS.');
  console.error('Consola de Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada.');
  process.exit(1);
}

// Se LEE el fichero y se pasa con `cert()` en vez de dejarlo en manos de `applicationDefault()`: así un error de
// ruta o un JSON que no es una clave de servicio se dice aquí, con su nombre, y no cincuenta líneas más abajo
// como un fallo de autenticación críptico.
let credential;
try {
  const raw = JSON.parse(readFileSync(path.resolve(key), 'utf8'));
  if (!raw.project_id || !raw.private_key || !raw.client_email) {
    console.error(`El fichero ${key} no parece una clave de servicio (le faltan project_id / private_key / client_email).`);
    process.exit(1);
  }
  credential = cert(raw);
  console.log(`Proyecto: ${raw.project_id}`);
} catch (error) {
  console.error(`No se pudo leer la clave de servicio en ${key}: ${error instanceof Error ? error.message : error}`);
  console.error('Si prefieres las credenciales por defecto del entorno, quita --key y exporta GOOGLE_APPLICATION_CREDENTIALS.');
  credential = applicationDefault();
  process.exit(1);
}

initializeApp({ credential });
const auth = getAuth();

const user = email
  ? await auth.getUserByEmail(email).catch(() => null)
  : await auth.getUser(uid).catch(() => null);

if (!user) {
  console.error(`No existe ninguna cuenta con ${email ? `el correo ${email}` : `el uid ${uid}`} en este proyecto.`);
  console.error('Ojo: la cuenta tiene que haber iniciado sesión en la app al menos una vez.');
  process.exit(1);
}

const claimsActuales = user.customClaims || {};

if (check) {
  console.log(`${user.email || user.uid} → admin: ${claimsActuales.admin === true ? 'sí' : 'no'}`);
  console.log(`claims: ${JSON.stringify(claimsActuales)}`);
  process.exit(0);
}

// Se CONSERVAN los demás claims: `setCustomUserClaims` reemplaza el objeto entero, así que escribir solo
// `{ admin: true }` borraría cualquier otro que hubiera. Hoy no hay ninguno; el día que lo haya, este detalle es
// la diferencia entre conceder un permiso y perder otro sin enterarse.
const siguientes = { ...claimsActuales };
if (revoke) {
  delete siguientes.admin;
} else {
  siguientes.admin = true;
}

await auth.setCustomUserClaims(user.uid, siguientes);

console.log(`${revoke ? 'Retirado' : 'Concedido'} el claim admin a ${user.email || user.uid} (uid ${user.uid}).`);
console.log('La cuenta tiene que volver a iniciar sesión (o recargar /admin) para que su token lo traiga.');
if (revoke) {
  console.log('Aviso: el token que ya tenga sigue siendo válido hasta una hora. Para cortar de inmediato:');
  console.log(`  getAuth().revokeRefreshTokens('${user.uid}')`);
}
