import { COMMON_WORDS } from '../memory/commonWords';
import { knownByLabel, type Secret } from '../memory/secrets';
import { SENTENCE } from '../memory/support';
import type { Action, Entity } from '../model/types';
import { actionStoryText } from '../text/formatting';
import type { Tokenizer } from '../text/tokenizer';
import type { Redaction, RenderedSections, SectionKind } from './types';

/** A sentence sharing at least this many of a gist's content words, and this share of them, retells it. [provisional] */
export const ECHO_WORDS = 3;
export const ECHO_SHARE = 0.4;
const CUT = '[…]';
const SCANNED: SectionKind[] = ['history', 'memories', 'storySummary', 'cast'];
/** `refreshSummary` keeps a memory's mark, so a summary sentence holding it tells a secret. */
const MARK = 'known only to';

const words = (s: string) => new Set((s.toLowerCase().match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 4 && !COMMON_WORDS.has(w)));

/** The sentence retells the gist in other words: no span can catch that, so shared content words do. */
export function echoes(sentence: string, gist: string): boolean {
  const n = shared(gist, sentence);
  return n >= ECHO_WORDS && n >= ECHO_SHARE * words(gist).size;
}

/** How many content words `a` and `b` share. */
export function shared(a: string, b: string): number {
  const s = words(b);
  return [...words(a)].filter((w) => s.has(w)).length;
}

/** The secrets a character in the cast does not know: the ones to cut. */
export const secretsToCut = (secrets: readonly Secret[], cast: readonly Entity[]): Secret[] =>
  secrets.filter((s) => cast.some((e) => e.kind === 'character' && !s.knownBy.includes(e.id)));

/**
 * Cuts each secret in `cut` out of the sections in `out`: the marked action's span (else its whole text) in history,
 * any sentence echoing the gist, and summary sentences holding a mark. A label naming the secret re-sent the gist,
 * and leading questions drew it out 0/3 and 0/3 (M17). Cuts only shrink a section, so its tokens are recounted in place.
 */
export function redactSecrets(
  out: RenderedSections,
  cut: readonly Secret[],
  actions: readonly Action[],
  entities: readonly Entity[],
  tokenizer: Tokenizer,
): Redaction[] {
  const redactions: Redaction[] = [];
  if (!cut.length) return redactions;
  const edit = (section: SectionKind, f: (text: string) => string) => {
    const r = out.get(section);
    const text = r && f(r.text);
    if (r && text !== undefined && text !== r.text) out.set(section, { ...r, text, tokens: tokenizer.count(text) });
  };

  edit('history', (text) =>
    cut.reduce((t, s) => {
      const action = actions[s.at];
      const said = action ? actionStoryText(action) : '';
      if (!said || !t.includes(said)) return t;
      const span = s.span && said.includes(s.span) ? s.span : said;
      redactions.push({ secretId: s.id, section: 'history', text: span });
      return t.replace(said, () => said.replace(span, () => CUT));
    }, text),
  );

  for (const section of SCANNED)
    edit(section, (text) =>
      text.replace(SENTENCE, (sentence) => {
        const marked = section === 'storySummary' && sentence.includes(MARK);
        const s = marked ? (cut.find((c) => sentence.includes(knownByLabel(c, entities))) ?? cut[0]) : cut.find((c) => echoes(sentence, c.text));
        if (!s) return sentence;
        redactions.push({ secretId: s.id, section, text: sentence.trim() });
        return marked ? '' : `${/^\s*/.exec(sentence)?.[0] ?? ''}${CUT}`;
      }),
    );
  return redactions;
}
