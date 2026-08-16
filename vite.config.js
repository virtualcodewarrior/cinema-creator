import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: '/',
  resolve: {
    extensions: ['.jsx', '.js', '.tsx', '.ts', '.json'],
    alias: {
      '@': path.resolve(__dirname, '.'),
      'studio': path.resolve(__dirname, 'packages/studio/src'),
      'ai-agent': path.resolve(__dirname, 'packages/Open-Poe-AI/packages/agents/src'),
      'workflow-builder': path.resolve(__dirname, 'packages/Vibe-Workflow/packages/workflow-builder/src'),
      'design-agent': path.resolve(__dirname, 'packages/Open-AI-Design-Agent/packages/design-agent/src'),
    },
  },
  build: {
    outDir: 'out',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
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
