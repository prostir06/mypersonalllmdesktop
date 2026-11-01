import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

/** Split stable vendor deps so route chunks stay smaller on repeat visits. */
function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined;

  if (
    id.includes('react-syntax-highlighter') ||
    id.includes('refractor') ||
    id.includes('prismjs')
  ) {
    return 'syntax-highlighter';
  }
  if (
    id.includes('react-markdown') ||
    id.includes('remark-') ||
    id.includes('micromark')
  ) {
    return 'markdown';
  }
  if (id.includes('@tanstack/react-query')) return 'query';
  if (id.includes('react-router')) return 'router';
  if (id.includes('react-dom') || /[/\\]react[/\\]/.test(id)) return 'react-vendor';
  if (id.includes('axios')) return 'axios';
  if (id.includes('bootstrap') || id.includes('react-bootstrap')) return 'bootstrap-ui';
  if (id.includes('react-toastify')) return 'toastify';
  if (id.includes('jspdf')) return 'jspdf';

  return undefined;
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'analyze' &&
      visualizer({
        open: false,
        filename: 'build/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      output: { manualChunks },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    coverage: {
      all: false,
      provider: 'v8',
      include: ['src/hooks/**', 'src/services/**'],
      thresholds: {
        statements: 50,
      },
    },
  },
}));
