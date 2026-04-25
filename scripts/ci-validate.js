const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const docsDir = path.join(root, 'docs');
const requiredFiles = [
  path.join(publicDir, 'index.html'),
  path.join(publicDir, 'style.css'),
  path.join(publicDir, 'robots.txt'),
  path.join(publicDir, '_headers'),
  path.join(publicDir, 'manifest.json'),
  path.join(publicDir, 'service-worker.js'),
  path.join(publicDir, 'ts', 'main.ts'),
  path.join(publicDir, 'ts', 'migrate.ts'),
  path.join(publicDir, 'ts', 'sync.ts'),
  path.join(publicDir, 'ts', 'app.ts'),
  path.join(publicDir, 'ts', 'constants.ts'),
  path.join(root, 'README.md'),
  path.join(root, 'CHANGELOG.md'),
  path.join(root, 'tsconfig.json'),
  path.join(root, 'vite.config.ts'),
  path.join(root, 'vitest.config.js'),
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
// Check for main.ts as module entry point (ES6 modules via Vite)
if (!html.includes('type="module"') || !html.includes('ts/main.ts')) {
  fail('index.html does not reference ts/main.ts as module entry point');
}

console.log('CI validation passed. All required files are present.');
