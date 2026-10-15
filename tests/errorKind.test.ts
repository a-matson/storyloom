import { describe, expect, it } from 'vitest';
import { errorKindOf } from '@core/turn/traced';

describe('errorKindOf', () => {
  it.each(['network error', 'Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'])(
    'reads a fetch TypeError "%s" as network',
    (message) => {
      expect(errorKindOf(new TypeError(message))).toBe('network');
    },
  );

  it('keeps a code TypeError unknown and a carried kind as is', () => {
    expect(errorKindOf(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe('unknown');
    expect(errorKindOf(Object.assign(new TypeError('network error'), { kind: 'provider' }))).toBe('provider');
  });
});
