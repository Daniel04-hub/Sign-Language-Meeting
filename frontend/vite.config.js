import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite config for SignMeet frontend.
 *
 * Proxy:
 *   /api/ → http://localhost:8000  (Django REST API)
 *   /ws/  → ws://localhost:8000    (Django Channels WebSocket)
 */
export default defineConfig({
  plugins: [react()],

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
  },

  server: {
    port: 5173,
    proxy: {
      // REST API — forward to Django
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // WebSocket signaling — forward to Daphne
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
