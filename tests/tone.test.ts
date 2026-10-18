import { describe, expect, it } from 'vitest';
import { LlamaServerProvider } from '@adapters/providers/llamaServer';
import { createFakeLlama } from '@adapters/providers/demo/fakeLlama';
import { withTone } from '@core/context';
import { ActionLog } from '@core/log';
import { createBlankAdventure } from '@core/model';
import { NoopScriptRunner, type HookInput, type HookResult } from '@core/ports';
import { prepareContext } from '@core/turn';
import type { ContextSection, SectionKind } from '@core/context';
import { TONE_WORDS } from '@core/context/tone';
import { createApproxTokenizer } from '@core/text';

const tk = createApproxTokenizer();
const sec = (kind: SectionKind, text: string): ContextSection => ({ kind, text, tokens: tk.count(text), cacheable: kind === 'plotEssentials' });
const ESSENTIALS = 'A grim, rain-soaked noir in a dying port. You are a debt collector.';
const base = [sec('plotEssentials', ESSENTIALS), sec('history', 'Recent Story:\nRain.'), sec('lastAction', '> You knock.')];

describe('withTone', () => {
  it('no front memory: sections unchanged (same array)', () => {
    const sections = [...base, sec('authorsNote', "[Author's note: Keep it tense.]")];
    expect(withTone(sections, ESSENTIALS, tk)).toBe(sections);
  });

  it('empty essentials: unchanged', () => {
    const sections = [...base, sec('frontMemory', 'The roll fails.')];
    expect(withTone(sections, '  ', tk)).toBe(sections);
  });

  it('front memory + note: `; tone: …` appended inside the note', () => {
    const sections = [base[0]!, base[1]!, sec('authorsNote', "[Author's note: Keep it tense.]"), base[2]!, sec('frontMemory', 'The roll fails.')];
    const out = withTone(sections, ESSENTIALS, tk);
    const note = out.find((s) => s.kind === 'authorsNote');
    expect(note?.text).toBe("[Author's note: Keep it tense; tone: A grim, rain-soaked noir in a dying port.]");
    expect(note?.tokens).toBe(tk.count(note?.text ?? ''));
    expect(out.map((s) => s.kind)).toEqual(sections.map((s) => s.kind));
  });

  it('front memory, no note: a note section inserted before the last action', () => {
    const out = withTone([...base, sec('frontMemory', 'The roll fails.')], ESSENTIALS, tk);
    expect(out.map((s) => s.kind)).toEqual(['plotEssentials', 'history', 'authorsNote', 'lastAction', 'frontMemory']);
    expect(out[2]).toMatchObject({ text: "[Author's note: tone: A grim, rain-soaked noir in a dying port.]", cacheable: false });
  });

  it('tone ≤ 20 words, first sentence only', () => {
    const long = `${Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')}. Second sentence.`;
    const note = withTone([...base, sec('frontMemory', 'x')], long, tk).find((s) => s.kind === 'authorsNote');
    const tone = /^\[Author's note: tone: (.*)\]$/.exec(note?.text ?? '')?.[1] ?? '';
    expect(tone.split(' ')).toHaveLength(TONE_WORDS);
    expect(note?.text).not.toContain('Second');
  });

  it('a script-inserted `script` section also turns it on', () => {
    const out = withTone([...base, sec('script', 'The air tastes of iron.')], ESSENTIALS, tk);
    expect(out.some((s) => s.kind === 'authorsNote')).toBe(true);
  });
});

describe('prepareContext tone', () => {
  // The dice script's shape: every section back, plus a front memory after the action.
  const dice = new (class extends NoopScriptRunner {
    override async run(input: HookInput): Promise<HookResult> {
      const out = await super.run(input);
      if (input.hook !== 'onModelContext') return out;
      return { ...out, sections: [...(input.sections ?? []).map((s) => ({ kind: s.kind, text: s.text })), { kind: 'frontMemory', text: 'The roll fails.' }] };
    }
  })();
  async function prompt(essentials: string) {
    const handler = createFakeLlama({ wordDelayMs: 0 });
    const provider = new LlamaServerProvider('demo', 'http://demo.invalid', (i, init) => handler(new Request(i, init)));
    const adventure = createBlankAdventure('Test', 'You stand at the gate.');
    adventure.plot.plotEssentials = essentials;
    const log = new ActionLog(adventure.actions);
    log.append('do', '> You x.');
    const prepared = await prepareContext(adventure, log.actions, { provider, tokenizer: tk, scripts: dice });
    if ('stopped' in prepared) throw new Error('context build stopped');
    return prepared;
  }

  it('a dice-script turn with essentials renders the tone', async () => {
    const p = await prompt('A grim noir in a dying port. You collect debts.');
    expect(p.prompt).toMatch(/\[Author's note: [^\]]*; tone: A grim noir in a dying port\.\]\n\n> You x\.\n\nThe roll fails\./);
    expect(p.scriptCache).toBe('kept');
    expect(p.result.budget.used).toBe(p.result.sections.reduce((n, s) => n + s.tokens, 0));
  });

  it('the same turn without essentials sends no tone', async () => {
    const p = await prompt('');
    expect(p.prompt).not.toContain('tone:');
    expect(p.prompt).toContain('> You x.\n\nThe roll fails.');
  });
});
