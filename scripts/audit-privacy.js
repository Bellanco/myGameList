/**
 * Auditoría de privacidad (estática, sin construir la app, sin dependencias).
 * Detecta posibles fugas de datos privados a canales públicos (gist social / Firestore / logs).
 * Categoría A (crítica), B (aviso), C (info). Exit 1 si hay Categoría A.
 *
 * NOTA: hoy el código pre-migración SÍ guarda token/email/uid en Firestore y review en el gist
 * social; este script lo señalará como deuda a resolver en el corte index-only / snippet-split.
 * Por eso aún NO se cablea como gate de CI.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');

const FORBIDDEN_FIELDS = ['review', 'reviewText', 'score', 'hours', 'steamDeck', 'retry', 'replayable', 'uid', 'email', 'githubToken', 'gamesGistId'];

// Ficheros que legítimamente manejan datos privados (no son canales públicos).
const PRIVATE_ALLOW = /(localRepository|indexedDbRepository|idbConnectionRepository|migrateRepository|syncRepository|syncStateRepository|syncMachineRepository)\.ts$/;
// Los ficheros de tipos solo DEFINEN campos, no los escriben.
const TYPE_FILE = /[/\\]model[/\\]types[/\\]/;
// Indicios de que un fichero ESCRIBE a un canal público.
const WRITE_HINT = /(setDoc|updateDoc|addDoc|writeSocialGist|writeGist|method:\s*'PATCH')/;

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

/** Categoría A: campo prohibido como clave de objeto en un fichero que escribe a un canal público. */
function detectForbiddenFields(code, file) {
  if (PRIVATE_ALLOW.test(file) || TYPE_FILE.test(file)) return [];
  if (!WRITE_HINT.test(code)) return [];
  const violations = [];
  code.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
    for (const field of FORBIDDEN_FIELDS) {
      const re = new RegExp(`(^|[{,\\s])(['"]?)${field}\\2\\s*:`);
      if (re.test(line)) {
        violations.push({ category: 'A', file: rel(file), line: i + 1, field, context: line.trim().slice(0, 140), message: `Posible campo privado '${field}' escrito a un canal público` });
      }
    }
  });
  return violations;
}

const B_PATTERNS = [
  { pattern: /\bsnippet\s*[:=]/, file: /ViewModel\.ts$/, message: 'snippet computado en un ViewModel (debe estar en toPublicGame)' },
  { pattern: /fetch\(['"]https:\/\/api\.github/, notFile: /gistRepository/, message: 'API de Gist fuera de gistRepository' },
  { pattern: /\b(setDoc|updateDoc|addDoc)\b/, notFile: /firebaseRepository/, message: 'escritura a Firestore fuera de firebaseRepository' },
  { pattern: /localStorage\.setItem/, notFile: /(localRepository|syncStateRepository|gistRepository)/, message: 'localStorage fuera de los repositorios designados' },
  { pattern: /console\.log[^\n]*\b(token|uid)\b/i, message: 'posible fuga de token/uid en console.log' },
];

function detectPatternB(code, file) {
  const violations = [];
  code.split('\n').forEach((line, i) => {
    if (isCommentLine(line)) return;
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

module.exports = { detectForbiddenFields, detectPatternB, detectPatternC, FORBIDDEN_FIELDS };
