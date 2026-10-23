import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El panel llama a /api/... y Vite lo reenvía al backend (así no hay problemas de CORS en desarrollo).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (ruta) => ruta.replace(/^\/api/, ''),
      },
    },
  },
});
