import { describe, expect, it } from 'vitest';
import { composeSeePrompt, PROMPT_BUDGET } from '@core/image/compose';
import type { Entity } from '@core/model';

const char = (id: string, name: string, description: string, appearance: string): Entity & { appearance: string } => ({
  id,
  kind: 'character',
  name,
  aliases: [],
  description,
  appearance,
  relations: [],
  firstSeen: 0,
  lastSeen: 0,
});

const tamsin = char('t', 'Tamsin', 'Tamsin is a ferrywoman.', 'grey braid, patched cloak');
const bram = char('b', 'Bram', 'Bram is a toll keeper.', 'bald, red beard');
const scene = { location: 'river jetty', present: [], weather: 'low mist' };

describe('See blocks', () => {
  it('omit drops a block entirely', () => {
    const input = { brief: 'Tamsin at the ferry', scene, entities: [tamsin], style: 'oil painting', family: 'sd15' as const };
    const { prompt, blocks } = composeSeePrompt({ ...input, omit: new Set(['style', 'scene'] as const) });
    expect(blocks.style).toBe('');
    expect(blocks.scene).toBe('');
    expect(prompt).not.toContain('oil painting');
    expect(prompt).not.toContain('low mist');
    expect(composeSeePrompt(input).prompt).toContain('oil painting');
  });

  it('dropped lists the cut tags in drop order', () => {
    const long = { ...tamsin, appearance: Array.from({ length: 30 }, (_, i) => `mark ${i}`).join(', ') };
    const { prompt, dropped } = composeSeePrompt({ brief: 'Tamsin and Bram at the ferry', scene, entities: [long, bram], style: '', family: 'sd15' });
    expect(prompt.length).toBeLessThanOrEqual(PROMPT_BUDGET);
    // The second character's looks go first, then the weather, then the cut tail.
    expect(dropped.slice(0, 3)).toEqual(['bald', 'red beard', 'low mist']);
    expect(dropped.at(-1)).toBe('mark 29');
    for (const t of dropped) expect(prompt.split(', ')).not.toContain(t);
  });

  it('drops nothing within the budget', () => {
    expect(composeSeePrompt({ brief: 'Tamsin at the ferry', scene, entities: [tamsin], style: '', family: 'sd15' }).dropped).toEqual([]);
  });
});
