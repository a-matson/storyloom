import { SENTENCE } from '../memory/support';
import type { Tokenizer } from '../text/tokenizer';
import { renderSection } from './render';
import type { ContextSection } from './types';

/** The tone's cap: the essentials' first sentence, cut. [provisional] */
export const TONE_WORDS = 20;

/** The essentials' first sentence, at most `TONE_WORDS` words; '' when there are none. */
export function toneOf(essentials: string): string {
  const first = essentials.trim().match(SENTENCE)?.[0]?.trim() ?? '';
  return first.split(/\s+/).filter(Boolean).slice(0, TONE_WORDS).join(' ');
}

/**
 * Front memory or a script section after the action pulls the model off the story's register,
 * so the essentials' tone rides in the author's note, next to the action. Same array when off.
 */
export function withTone(sections: ContextSection[], essentials: string, tokenizer: Tokenizer): ContextSection[] {
  const tone = toneOf(essentials);
  if (!tone || !sections.some((s) => (s.kind === 'frontMemory' || s.kind === 'script') && s.text.trim() !== '')) return sections;
  const prev = sections.find((s) => s.kind === 'authorsNote');
  if (prev) {
    // `[Author's note: …]`: the tone goes before the closing bracket.
    const text = prev.text.endsWith(']') ? `${prev.text.slice(0, -1).replace(/[.;]\s*$/, '')}; tone: ${tone}]` : `${prev.text} [tone: ${tone}]`;
    return sections.map((s) => (s === prev ? { ...s, text, tokens: tokenizer.count(text), trimmed: false } : s));
  }
  const text = renderSection('authorsNote', `tone: ${tone}`);
  const at = sections.findIndex((s) => s.kind === 'retryNote' || s.kind === 'lastAction');
  const out = [...sections];
  out.splice(at < 0 ? out.length : at, 0, { kind: 'authorsNote', text, tokens: tokenizer.count(text), cacheable: false });
  return out;
}
