import { useEffect, useState } from 'react';

/**
 * Minimal hash router. Routes:
 *   #/                    library
 *   #/adventure/<id>      game screen
 *   #/settings            backend + appearance
 *   #/setup               first run (same screen, no back button)
 * Reloading keeps you in the adventure; the browser back button works.
 */
export type Route = { name: 'library' } | { name: 'adventure'; id: string } | { name: 'settings' } | { name: 'setup' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  const [head, ...rest] = path.split('/');
  switch (head) {
    case 'adventure':
      return rest[0] ? { name: 'adventure', id: decodeURIComponent(rest[0]) } : { name: 'library' };
    case 'settings':
      return { name: 'settings' };
    case 'setup':
      return { name: 'setup' };
    default:
      return { name: 'library' };
  }
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'adventure':
      return `#/adventure/${encodeURIComponent(r.id)}`;
    case 'settings':
      return '#/settings';
    case 'setup':
      return '#/setup';
    default:
      return '#/';
  }
}

export function navigate(r: Route, replace = false): void {
  const hash = routeToHash(r);
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
