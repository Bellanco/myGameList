/**
 * Auditoría de privacidad (estática, sin construir la app, sin dependencias).
 * Detecta posibles fugas de datos privados a canales públicos (gist social / Firestore / logs).
 * Categoría A (crítica), B (aviso), C (info). Exit 1 si hay Categoría A.
 *
 * Consciente de canal: el gist de juegos PRIVADO y el almacenamiento local pueden tener datos completos;
 * los canales PÚBLICOS (Firestore profiles/feed, gist social) no pueden llevar review/score/hours/token.
 * email/gamesGistId/uid se conservan por DECISIÓN de producto → Categoría C (informativa).
 * Falsos positivos del análisis por líneas (args/lecturas) se suprimen con `// audit-allow: <razón>`.
 * Tras el flip B1–B5, Categoría A = 0, por lo que puede usarse como gate de CI.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');

// Campos de datos de juego privados: prohibidos en canales PÚBLICOS (Firestore profiles/feed, gist social).
const GAME_PRIVATE_FIELDS = ['review', 'reviewText', 'score', 'hours', 'steamDeck', 'retry', 'replayable'];
// Secretos: nunca como campo almacenado fuera del almacenamiento privado local.
const SECRET_FIELDS = ['githubToken'];
// Conservados por DECISIÓN de producto (email consentido, gamesGistId es id de gist público, uid = clave de doc): solo info.
const INFO_FIELDS = ['uid', 'email', 'gamesGistId'];

// Almacenamiento privado local: maneja datos completos legítimamente (incluido el token).
const PRIVATE_STORAGE = /(localRepository|indexedDbRepository|idbConnectionRepository|migrateRepository|syncRepository|syncStateRepository|syncMachineRepository)\.ts$/;
// gistRepository contiene el gist de juegos PRIVADO (datos completos legítimos); el path social está
// protegido en runtime por assertNoSocialPrivateFields, que el análisis estático no puede aislar por fichero.
const GAMES_GIST = /gistRepository\.ts$/;
// Los ficheros de tipos solo DEFINEN campos, no los escriben.
const TYPE_FILE = /[/\\]model[/\\]types[/\\]/;
// Indicios de que un fichero ESCRIBE a un canal público.
const WRITE_HINT = /(setDoc|updateDoc|addDoc|writeSocialGist|writeGist|method:\s*'PATCH')/;

// El valor tras `campo:` es un TIPO (declaración de interface), no una escritura de valor.
const TYPE_VALUE = /^(string|number|boolean|null|undefined|unknown|any|void|never|TabId|Record<|Array<|Partial<|\{\s*\})/;

/** True solo si `field` aparece como clave con un VALOR (no como declaración de tipo). */
function fieldWrittenAsValue(line, field) {
  const match = line.match(new RegExp(`(?:^|[{,\\s])(['"]?)${field}\\1\\s*:\\s*(.*)$`));
  if (!match) return false;
  const after = (match[2] || '').trim();
  if (!after || TYPE_VALUE.test(after)) return false; // sin valor o es una declaración de tipo
  return true;
}

function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

/** Categoría A/C: campos sensibles como clave de objeto en un fichero que escribe a un canal público. */
function detectForbiddenFields(code, file) {
  if (PRIVATE_STORAGE.test(file) || TYPE_FILE.test(file)) return [];
  if (!WRITE_HINT.test(code)) return [];
  const isGamesGist = GAMES_GIST.test(file);
  const violations = [];
  code.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (line.includes('audit-allow')) return; // supresión explícita y revisada (con razón en el propio código)
    // Secretos: siempre Categoría A — el token nunca debe ser un campo almacenado en gist/Firestore.
    for (const field of SECRET_FIELDS) {
      if (fieldWrittenAsValue(line, field)) {
        violations.push({ category: 'A', file: rel(file), line: i + 1, field, context: line.trim().slice(0, 140), message: `Secreto '${field}' como campo almacenado en un canal público` });
      }
    }
    // Datos de juego privados: A en canales públicos; en gistRepository se omite (gist de juegos privado + guarda runtime del social).
    if (!isGamesGist) {
      for (const field of GAME_PRIVATE_FIELDS) {
        if (fieldWrittenAsValue(line, field)) {
          violations.push({ category: 'A', file: rel(file), line: i + 1, field, context: line.trim().slice(0, 140), message: `Campo privado de juego '${field}' escrito a un canal público` });
        }
      }
    }
    // Conservados por decisión: solo informativo (no bloquea).
    for (const field of INFO_FIELDS) {
      if (fieldWrittenAsValue(line, field)) {
        violations.push({ category: 'C', file: rel(file), line: i + 1, field, context: line.trim().slice(0, 140), message: `Campo '${field}' en canal público (conservado por decisión: email consentido / gamesGistId público / uid doc-key)` });
      }
    }
  });
  return violations;
}

const B_PATTERNS = [
  { pattern: /\bsnippet\s*[:=]/, file: /ViewModel\.ts$/, message: 'snippet computado en un ViewModel (debe estar en toPublicGame)' },
  { pattern: /fetch\(['"]https:\/\/api\.github/, notFile: /gistRepository/, message: 'API de Gist fuera de gistRepository' },
  { pattern: /\b(setDoc|updateDoc|addDoc)\b/, notFile: /firebaseRepository/, message: 'escritura a Firestore fuera de firebaseRepository' },
  { pattern: /localStorage\.setItem/, notFile: /(localRepository|syncStateRepository|gistRepository|gistConfigRepository)/, message: 'localStorage fuera de los repositorios designados' },
  { pattern: /console\.log[^\n]*\b(token|uid)\b/i, message: 'posible fuga de token/uid en console.log' },
];

function detectPatternB(code, file) {
  const violations = [];
  code.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (line.includes('audit-allow')) return;
    for (const p of B_PATTERNS) {
      if (p.file && !p.file.test(file)) continue;
      if (p.notFile && p.notFile.test(file)) continue;
      if (p.pattern.test(line)) {
        violations.push({ category: 'B', file: rel(file), line: i + 1, context: line.trim().slice(0, 140), message: p.message });
      }
    }
  });
  return violations;
}

function detectPatternC(code, file) {
  const violations = [];
  code.split('\n').forEach((line, i) => {
    if (/\b(TODO|FIXME)\b/.test(line) && /(sync|privac|token|gist)/i.test(line)) {
      violations.push({ category: 'C', file: rel(file), line: i + 1, context: line.trim().slice(0, 140), message: 'TODO/FIXME relacionado con sync/privacidad' });
    }
    if (/\bas any\b/.test(line) && /(game|review|score|profile|gist)/i.test(line)) {
      violations.push({ category: 'C', file: rel(file), line: i + 1, context: line.trim().slice(0, 140), message: 'cast `as any` en código que maneja datos de juego/perfil' });
    }
  });
  return violations;
}

function run() {
  const files = listSourceFiles(srcDir);
  const violations = [];
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');
    violations.push(...detectForbiddenFields(code, file), ...detectPatternB(code, file), ...detectPatternC(code, file));
  }

  const summary = {
    critical: violations.filter((v) => v.category === 'A').length,
    warnings: violations.filter((v) => v.category === 'B').length,
    info: violations.filter((v) => v.category === 'C').length,
  };
  const report = { runAt: new Date().toISOString(), summary, violations };
  fs.writeFileSync(path.join(root, 'audit-report.json'), JSON.stringify(report, null, 2));

  console.log(`Privacy audit — A:${summary.critical}  B:${summary.warnings}  C:${summary.info}  (audit-report.json)`);
  for (const v of violations) {
    console.log(`  [${v.category}] ${v.file}:${v.line} ${v.field ? `(${v.field}) ` : ''}${v.message}`);
  }
  if (summary.critical > 0) {
    console.log('\nCategoría A detectada. Pre-migración es deuda esperada (token/email/uid en Firestore, review en gist social).');
    process.exitCode = 1;
  }
}

if (require.main === module) run();

module.exports = { detectForbiddenFields, detectPatternB, detectPatternC, GAME_PRIVATE_FIELDS, SECRET_FIELDS, INFO_FIELDS };
