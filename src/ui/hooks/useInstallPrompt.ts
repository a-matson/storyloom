import { useSyncExternalStore } from 'react';

/** Chrome's `BeforeInstallPromptEvent`; not in lib.dom. */
interface InstallPrompt {
  prompt(): Promise<unknown>;
}

// Registered at import, not in an effect: Chrome may fire the event before React mounts.
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const set = (next: InstallPrompt | null) => {
  deferred = next;
  listeners.forEach((l) => l());
};

window.addEventListener('beforeinstallprompt', (e) => {
  if (!('prompt' in e) || typeof e.prompt !== 'function') return;
  e.preventDefault();
  const prompt = e.prompt.bind(e);
  set({ prompt: async () => prompt() });
});
window.addEventListener('appinstalled', () => set(null));

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const install = () => {
  if (!deferred) return;
  // The event can prompt once; Chrome fires a fresh one if the user dismisses.
  deferred.prompt().catch((e: unknown) => console.warn('install prompt failed', e));
  set(null);
};

/** `install` is non-null while the browser offers to install the app. */
export function useInstallPrompt(): (() => void) | null {
  return useSyncExternalStore(subscribe, () => (deferred ? install : null));
}
