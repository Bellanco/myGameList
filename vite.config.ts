import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  server: {
    port: 8000,
    open: true,
  },
  build: {
    outDir: '../dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['public/**/*.test.ts'],
    exclude: ['node_modules'],
  },
});
