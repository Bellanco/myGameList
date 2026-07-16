import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version?: string };

export default defineConfig({
  // Identificador de build inyectado en tiempo de compilación; lo usa la telemetría para etiquetar errores/eventos.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },
  plugins: [
    react(),
  ],
  server: {
    port: 8000,
    open: false,
  },
  build: {
    outDir: 'dist',
    // Target explícito y moderno: evita sorpresas si cambia el default al actualizar Vite.
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Minificación oxc con eliminación de console.*/debugger en producción (no afecta a dev).
        // Vite 8 usa oxc; el drop va en las opciones de minify de rolldown (compress), no en el transform.
        minify: { compress: { dropConsole: true, dropDebugger: true } },
        manualChunks: (id) => {
          // Vendor chunks for better caching and parallelization
          if (id.includes('node_modules/firebase/')) {
            return 'firebase';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react';
          }
          if (id.includes('node_modules/react-router-dom/')) {
            return 'router';
          }
          if (id.includes('node_modules/@tanstack/react-virtual/')) {
            return 'virtual';
          }
        },
      },
    },
  },
});
