import { describe, expect, it } from 'vitest';
import { applyScriptSections, renderBody, type ContextSection } from '@core/context';
import type { ScriptSection } from '@core/ports';
import { createApproxTokenizer } from '@core/text';

const tokenizer = createApproxTokenizer();

const built: ContextSection[] = [
  { kind: 'instructions', text: 'You are a narrator.', tokens: 5, cacheable: true },
  { kind: 'plotEssentials', text: 'A desert city.', tokens: 4, cacheable: true },
  { kind: 'history', text: 'Recent Story:\nYou walk in.', tokens: 7, cacheable: true },
  { kind: 'authorsNote', text: "[Author's note: tense]", tokens: 6, cacheable: false },
  { kind: 'lastAction', text: '> You wait.', tokens: 4, cacheable: false },
];

const plain = (sections: ContextSection[]): ScriptSection[] => sections.map((s) => ({ kind: s.kind, text: s.text, cacheable: s.cacheable }));

/** `applyScriptSections` never returns an error for these fixtures; this keeps the tests readable. */
function apply(returned: ScriptSection[]) {
  const out = applyScriptSections(returned, built, tokenizer);
  if ('error' in out) throw new Error(out.error);
  return out;
}

describe('applyScriptSections', () => {
  it('keeps the cache and the body when nothing changed', () => {
    const out = apply(plain(built));
    expect(out.cache).toBe('kept');
    expect(renderBody(out.sections)).toBe(renderBody(built));
    expect(out.sections).toEqual(built);
  });

  it('recounts an edited section outside the prefix without breaking the cache', () => {
    const edited = plain(built).map((s) => (s.kind === 'authorsNote' ? { ...s, text: "[Author's note: tense, and the lamps are out]" } : s));
    const out = apply(edited);
    expect(out.cache).toBe('kept');
    expect(renderBody(out.sections)).toContain('the lamps are out');
    const note = out.sections.find((s) => s.kind === 'authorsNote');
    expect(note?.tokens).toBeGreaterThan(6);
  });

  it('breaks the cache when a cacheable section changes', () => {
    const edited = plain(built).map((s) => (s.kind === 'plotEssentials' ? { ...s, text: 'A drowned city.' } : s));
    expect(apply(edited).cache).toBe('broken');
  });

  it('breaks the cache when a cacheable section is dropped', () => {
    expect(apply(plain(built).filter((s) => s.kind !== 'history')).cache).toBe('broken');
  });

  it('keeps the cache for a script section inserted after the prefix', () => {
    const returned = [...plain(built)];
    returned.splice(3, 0, { kind: 'script', text: 'The air tastes of iron.' });
    const out = apply(returned);
    expect(out.cache).toBe('kept');
    expect(out.sections[3]).toMatchObject({ kind: 'script', cacheable: false });
    expect(out.sections[3]?.tokens).toBeGreaterThan(0);
    expect(renderBody(out.sections).indexOf('iron')).toBeGreaterThan(renderBody(out.sections).indexOf('You walk in'));
  });

  it('breaks the cache for a section inserted inside the prefix', () => {
    const returned = [...plain(built)];
    returned.splice(1, 0, { kind: 'script', text: 'Rules: be brief.' });
    expect(apply(returned).cache).toBe('broken');
  });

  it('rejects an unknown kind', () => {
    expect(applyScriptSections([{ kind: 'sidebar', text: 'x' }], built, tokenizer)).toEqual({ error: 'unknown section kind: sidebar' });
  });
});
