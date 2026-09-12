import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Lanza los tests de reglas de Firestore (`npm run test:rules`) asegurándose antes de que el emulador tenga un JDK
// que le sirva. El emulador de Firestore es un .jar y firebase-tools >= 15 se niega a arrancarlo con Java < 21:
//
//   Error: firebase-tools no longer supports Java version before 21.
//
// El mensaje no dice cuál es el Java que ha encontrado ni dónde hay otro mejor, así que en una máquina con varios
// JDK instalados (lo normal) o en un CI que no ha fijado el suyo, el fallo parece del test y no del entorno. Este
// envoltorio hace tres cosas: si el `java` del PATH ya vale, no toca nada; si no vale pero hay un JDK 21+ instalado,
// lo pone delante solo para este proceso; y si no hay ninguno, corta con un mensaje que dice qué instalar.
const MIN_JAVA = 21;

/** Versión mayor del `java` de un JAVA_HOME (o del PATH si `home` es null); null si no se puede ejecutar. */
function majorVersion(home) {
  const bin = home ? path.join(home, 'bin', 'java') : 'java';
  // `java -version` escribe en stderr, no en stdout.
  const { stderr, error } = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  if (error) return null;
  const version = stderr?.match(/version "([^"]+)"/)?.[1];
  if (!version) return null;
  // "1.8.0_292" es Java 8; de Java 9 en adelante el primer número ya es el mayor.
  const partes = version.split('.');
  return Number.parseInt(partes[0] === '1' ? partes[1] : partes[0], 10) || null;
}

/** JDK instalados que el sistema conoce, sin garantía de versión ni de orden. */
function candidatos() {
  const encontrados = [];
  if (process.env.JAVA_HOME) encontrados.push(process.env.JAVA_HOME);
  if (process.platform === 'darwin') {
    try {
      encontrados.push(execFileSync('/usr/libexec/java_home', ['-v', `${MIN_JAVA}+`]).toString().trim());
    } catch {
      // Sin JDK 21+ registrado en macOS: seguimos con el resto de rutas.
    }
  }
  for (const raiz of ['/usr/lib/jvm', '/opt/java', '/opt/homebrew/opt']) {
    if (!existsSync(raiz)) continue;
    for (const entrada of readdirSync(raiz)) {
      encontrados.push(path.join(raiz, entrada));
      // Homebrew cuelga el JDK de un subdirectorio (`openjdk@21/libexec/openjdk.jdk/Contents/Home`).
      encontrados.push(path.join(raiz, entrada, 'libexec', 'openjdk.jdk', 'Contents', 'Home'));
    }
  }
  return encontrados;
}

const entorno = { ...process.env };
const enPath = majorVersion(null);

if (!enPath || enPath < MIN_JAVA) {
  const valido = candidatos().find((home) => existsSync(path.join(home, 'bin', 'java')) && majorVersion(home) >= MIN_JAVA);
  if (!valido) {
    console.error(
      `\nLos tests de reglas necesitan un JDK ${MIN_JAVA} o superior para el emulador de Firestore` +
        `${enPath ? ` (el del PATH es Java ${enPath})` : ' (no hay java en el PATH)'}.\n` +
        'Instala uno y vuelve a intentarlo:\n' +
        '  macOS:  brew install openjdk@21\n' +
        '  Ubuntu: sudo apt-get install -y openjdk-21-jdk\n' +
        "  CI:     actions/setup-java con java-version: '21'\n"
    );
    process.exit(1);
  }
  console.log(`Usando el JDK de ${valido} para el emulador de Firestore.`);
  entorno.JAVA_HOME = valido;
  entorno.PATH = `${path.join(valido, 'bin')}${path.delimiter}${entorno.PATH}`;
}

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const firebase = path.join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');
if (!existsSync(firebase)) {
  console.error('\nFalta firebase-tools: ejecuta `npm ci` antes de los tests de reglas.\n');
  process.exit(1);
}

const { status } = spawnSync(
  firebase,
  ['emulators:exec', '--only', 'firestore', 'vitest run --config vitest.rules.config.js'],
  { stdio: 'inherit', env: entorno, cwd: raiz }
);
process.exit(status ?? 1);
