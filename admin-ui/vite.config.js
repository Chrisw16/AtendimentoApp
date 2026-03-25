import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/admin/api': 'http://localhost:3000',
      '/admin/logs': 'http://localhost:3000',
      '/admin/chat': 'http://localhost:3000',
      '/admin/manifest.json': 'http://localhost:3000',
      '/admin/sw.js': 'http://localhost:3000',
      '/admin/icons': 'http://localhost:3000',
      '/admin/favicon.ico': 'http://localhost:3000',
    },
  },
});
