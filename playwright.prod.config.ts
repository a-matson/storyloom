import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// The service worker only registers in a production build. Local only: `pnpm exec playwright test -c playwright.prod.config.ts`.
const port = 5176;

export default defineConfig({
  ...base,
  testMatch: 'prod/**',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'prod', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `vite build --outDir dist-prod && vite preview --outDir dist-prod --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
  },
});
