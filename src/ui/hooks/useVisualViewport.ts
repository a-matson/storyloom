import { useEffect } from 'react';

/** Sizes the app to the visual viewport, so the soft keyboard shrinks it. iOS Safari ignores `interactive-widget`. */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const root = document.documentElement;
    const sync = () => root.style.setProperty('--app-h', `${vv.height}px`);
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      root.style.removeProperty('--app-h');
    };
  }, []);
}
