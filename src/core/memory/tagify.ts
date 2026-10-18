/** Colours and materials: what a look and a place share. [provisional] */
export const COLOUR_WORDS = (
  'black white red green blue grey gray brown yellow orange purple violet pink gold golden silver bronze copper amber ochre ' +
  'burgundy crimson scarlet emerald jade teal azure navy olive ivory cream tan auburn blond blonde ginger chestnut russet dark pale ' +
  'stone wooden iron brick marble granite timber glass leather steel silk velvet wool linen'
).split(' ');
/** Size, count and shape: a look's words a place does not need. [provisional] */
const SHAPE_WORDS = (
  'long short tall small tiny huge large big broad thick thin slender curved curled spiral straight pointed round jagged ' +
  'twisted braided striped spotted one two three four five six pair twin'
).split(' ');
const words = (list: readonly string[]) => new RegExp(`\\b(?:${list.join('|')})\\b`, 'i');
const COLOUR = words(COLOUR_WORDS);
const LOOK = new RegExp(`${words([...COLOUR_WORDS, ...SHAPE_WORDS]).source}|\\d`, 'i');
/** Words that turn a look into what it means, whose it is, or why: the clause stops there. [provisional] */
const TAIL = /(?:^|\s+)\b(?:his|her|their|that|which|who|so|because|indicates?)\b.*$/i;
const LEAD = /^(?:his|her|their|its|the|an?)\s+/i;
/** Past six words a look is prose, not a tag. [provisional] */
const MAX_WORDS = 6;

const cap = (s: string) => s.split(/\s+/).slice(0, MAX_WORDS).join(' ');
// "black and white" is one look; "big and trusting" is a temperament.
const looks = (clause: string) => clause.split(/\s+and\s+/i).every((p) => LOOK.test(p));

/** A player's look answer as short tags: the clauses that show, never empty for a non-empty answer. */
export function tagify(value: string): string[] {
  const kept: string[] = [];
  const firsts: string[] = [];
  for (const sentence of value.split(/[;.\n]/)) {
    // "underbelly, soles are ochre" -> "ochre underbelly"
    const is = /^(.+?)\s+(?:is|are)\s+(.+)$/i.exec(sentence.trim());
    const colour = is?.[2]?.replace(TAIL, '').trim();
    if (is?.[1] && colour && COLOUR.test(colour)) {
      kept.push(cap(`${colour} ${(is[1].split(',')[0] ?? '').trim().replace(LEAD, '')}`));
      continue;
    }
    for (const raw of sentence.split(',')) {
      const c = raw.trim();
      if (c === '') continue;
      const cut = c.replace(TAIL, '').trim();
      firsts.push(cut || c);
      if (cut && looks(cut)) kept.push(cap(cut));
    }
  }
  if (kept.length > 0) return kept;
  const first = firsts.find((f) => !TAIL.test(f)) ?? firsts[0];
  return first === undefined ? [] : [cap(first)];
}
