import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  server: {
    port: 8000,
    open: false,
    hmr: false,
  },
  build: {
    outDir: '../dist',
    sourcemap: false,
  },
});
