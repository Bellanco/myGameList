import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    port: 8000,
    open: false,
    hmr: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
