import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Production build with the Profiler compiled in, served by `vite preview`.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:5175' },
  webServer: { command: 'vite preview --outDir dist-measure --port 5175 --strictPort', port: 5175, reuseExistingServer: false },
});
