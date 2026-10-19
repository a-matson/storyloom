import { describe, expect, it } from 'vitest';
import { COMMANDS, MODE_IDS } from '@ui/features/game/modes';
import { filterEntries, paletteEntries, type PaletteContext } from '@ui/features/game/palette';

const noop = () => undefined;
const ctx: PaletteContext = {
  api: { retry: noop, submit: noop, erase: noop, undo: noop, redo: noop },
  draft: noop,
  markSecret: noop,
  openContext: noop,
  toggleSidebar: noop,
  openSection: noop,
};
const entries = paletteEntries(ctx);

describe('command palette', () => {
  it('has an entry for every slash command and every mode', () => {
    const ids = entries.map((e) => e.id);
    for (const id of [...COMMANDS, ...MODE_IDS]) expect(ids).toContain(id);
  });

  it('inserts a slash command rather than running it', () => {
    const drafts: unknown[] = [];
    paletteEntries({ ...ctx, draft: (d) => drafts.push(d) })
      .find((e) => e.id === 'wait')
      ?.run();
    expect(drafts).toEqual([{ text: '/wait ' }]);
  });

  it('ranks a prefix match before a subsequence match', () => {
    // "re" is a prefix of Retry and Redo, a subsequence of "/correct" (listed first).
    const labels = filterEntries(entries, 're').map((e) => e.label);
    expect(labels.slice(0, 2)).toEqual(['Retry', 'Redo']);
    expect(labels).toContain('/correct');
  });

  it('matches slash commands with or without the slash', () => {
    expect(filterEntries(entries, '/wai')[0]?.id).toBe('wait');
    expect(filterEntries(entries, 'wai')[0]?.id).toBe('wait');
  });

  it('keeps the order for an empty query', () => {
    expect(filterEntries(entries, '')).toEqual(entries);
  });
});
