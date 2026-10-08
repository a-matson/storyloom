import { Profiler, StrictMode, type ProfilerOnRenderCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Self-hosted fonts: no request leaves the machine.
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root');

// Measurement builds only (VITE_MEASURE_RENDERS=1): count commits and render time for e2e/renders.spec.ts.
const renders = { commits: 0, ms: 0 };
const onRender: ProfilerOnRenderCallback = (_id, _phase, actualMs) => {
  renders.commits += 1;
  renders.ms += actualMs;
};
const measure = import.meta.env['VITE_MEASURE_RENDERS'] === '1';
if (measure) Object.assign(window, { __renders: renders });

// Dev never registers: HMR and the dev-server e2e stay SW-free.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e: unknown) => console.warn('service worker registration failed', e));
}

createRoot(root).render(
  <StrictMode>
    {measure ? (
      <Profiler id="app" onRender={onRender}>
        <App />
      </Profiler>
    ) : (
      <App />
    )}
  </StrictMode>,
);
