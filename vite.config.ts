import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vite + Vitest share this config. The app is a static PWA: `vite build`
// produces ./dist, which `llama-server --path ./dist` can serve directly so
// the UI and the inference server share one origin (no CORS).
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
    // Local inference servers are called directly from the browser at
    // http://localhost:<port>; localhost is a secure context so no proxy is
    // required. If a backend refuses cross-origin requests (Ollama without
    // OLLAMA_ORIGINS), uncomment the proxy below and point the provider at
    // /api instead.
    // proxy: { '/api': { target: 'http://localhost:8080', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Thresholds = measured baseline (2026-10-02), rounded down; raise them, never lower.
    coverage: {
      provider: 'v8',
      // Unit coverage of logic; the UI is covered by Playwright, not counted here.
      include: ['src/core/**', 'src/adapters/**', 'src/app/**'],
      reporter: ['text-summary'],
      thresholds: { statements: 80, branches: 67, functions: 79, lines: 84 },
    },
  },
});
