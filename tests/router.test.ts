import { describe, expect, it } from 'vitest';
import { parseHash, routeToHash, type Route } from '@ui/router';

describe('router', () => {
  it('parses scenario routes with an optional child path', () => {
    expect(parseHash('#/scenario/abc')).toEqual({ name: 'scenario', id: 'abc', path: [] });
    expect(parseHash('#/scenario/abc/c1/c2')).toEqual({ name: 'scenario', id: 'abc', path: ['c1', 'c2'] });
    expect(parseHash('#/scenario')).toEqual({ name: 'library' });
  });
  it('round-trips through routeToHash', () => {
    const routes: Route[] = [
      { name: 'library' },
      { name: 'adventure', id: 'a b' },
      { name: 'settings' },
      { name: 'scenario', id: 's/1', path: [] },
      { name: 'scenario', id: 's', path: ['c1', 'c 2'] },
    ];
    for (const r of routes) expect(parseHash(routeToHash(r))).toEqual(r);
  });
});
