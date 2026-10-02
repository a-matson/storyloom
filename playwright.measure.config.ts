import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Production build with the Profiler compiled in, served by `vite preview`.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:5175' },
  webServer: [
    { command: 'vite preview --outDir dist-measure --port 5175 --strictPort', port: 5175, reuseExistingServer: false },
    // A fast GPU's stream (~200 tok/s); the in-app demo's 40 ms/word is slower than a frame.
    { command: 'node scripts/fake-backend.ts 8089 5', url: 'http://localhost:8089/health', reuseExistingServer: false },
  ],
});
