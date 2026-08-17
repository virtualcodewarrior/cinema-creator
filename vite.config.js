import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  base: '/',
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, '.'),
      'studio': path.resolve(__dirname, 'packages/studio/src'),
    },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  define: {
    'process.env': '{}',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
});
