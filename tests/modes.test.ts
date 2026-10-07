import { describe, expect, it } from 'vitest';
import { parseSlash } from '@ui/features/game/modes';

describe('parseSlash', () => {
  it('switches mode and keeps the rest', () => {
    expect(parseSlash('/say hello there')).toEqual({ kind: 'mode', mode: 'say', rest: 'hello there' });
    expect(parseSlash('/do')).toEqual({ kind: 'mode', mode: 'do', rest: '' });
  });

  it('returns a correction with its text intact', () => {
    expect(parseSlash('/correct Lena has blue eyes, not green!')).toEqual({ kind: 'correct', text: 'Lena has blue eyes, not green!' });
  });

  it('ignores anything else', () => {
    expect(parseSlash('hello')).toBeNull();
    expect(parseSlash('/corrected')).toBeNull();
  });
});
