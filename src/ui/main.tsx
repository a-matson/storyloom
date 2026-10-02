import { Profiler, StrictMode, type ProfilerOnRenderCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './theme.css';

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
