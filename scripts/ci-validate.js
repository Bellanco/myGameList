const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const dataDir = path.join(root, 'data');
const docsDir = path.join(root, 'docs');
const requiredFiles = [
  path.join(publicDir, 'index.html'),
  path.join(publicDir, 'style.css'),
  path.join(publicDir, 'robots.txt'),
  path.join(publicDir, '_headers'),
  path.join(publicDir, 'js', 'migrate.js'),
  path.join(publicDir, 'js', 'sync.js'),
  path.join(publicDir, 'js', 'app.js'),
  path.join(dataDir, 'myGames.json'),
  path.join(docsDir, 'SYNC_FLOW.md'),
  path.join(docsDir, 'TEST_SYNC.md'),
  path.join(root, 'README.md'),
  path.join(root, 'CHANGELOG.md'),
];

const fail = (message) => {
  console.error('CI validation failed:', message);
  process.exit(1);
};

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    fail(`Missing required file: ${path.relative(root, file)}`);
  }
}

const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const requiredScripts = ['js/migrate.js', 'js/sync.js', 'js/app.js'];
for (const script of requiredScripts) {
  if (!html.includes(`src="${script}"`)) {
    fail(`index.html does not reference required script: ${script}`);
  }
}

const jsonPath = path.join(dataDir, 'myGames.json');
try {
  JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (err) {
  fail(`Invalid JSON in ${path.relative(root, jsonPath)}: ${err.message}`);
}

const jsFiles = [
  path.join(publicDir, 'js', 'migrate.js'),
  path.join(publicDir, 'js', 'sync.js'),
  path.join(publicDir, 'js', 'app.js'),
];
for (const file of jsFiles) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(code, { filename: file });
  } catch (err) {
    fail(`JavaScript syntax error in ${path.relative(root, file)}: ${err.message}`);
  }
}

console.log('CI validation passed. All required files are present and syntactically valid.');
