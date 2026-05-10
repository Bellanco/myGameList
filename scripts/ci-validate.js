const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const requiredFiles = [
  path.join(root, 'index.html'),
  path.join(publicDir, 'robots.txt'),
  path.join(publicDir, '_headers'),
  path.join(publicDir, 'manifest.json'),
  path.join(publicDir, 'service-worker.js'),
  path.join(root, 'src', 'main.tsx'),
  path.join(root, 'src', 'App.tsx'),
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

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('type="module"') || !html.includes('/src/main.tsx')) {
  fail('index.html does not reference /src/main.tsx as module entry point');
}

console.log('CI validation passed. All required files are present.');
