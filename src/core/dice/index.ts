import type { Adventure } from '../model';

/**
 * "Consequences (dice)": a d20 per Do turn, its outcome sent as front memory.
 * The Context hook, not Input: Input sees the raw typed text without its type, and front
 * memory set there would be read before the hook anyway. The roll is seeded by the action
 * count, so a retry rolls the same. Keyword DC 14 else 10; bands at DC and DC - 5. [provisional]
 */
const LIBRARY = `function roll(seed) {
  var x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return 1 + ((x >>> 0) % 20);
}
function difficulty(text) {
  return /\\b(attack|fight|climb|sneak|pick|persuade|steal|jump)\\w*/i.test(text) ? 14 : 10;
}
function outcome(r, dc) {
  return r >= dc ? 'succeeds' : r >= dc - 5 ? 'succeeds at a cost' : 'fails badly';
}`;

const CONTEXT = `const modifier = (text) => {
  const last = history[history.length - 1];
  if (last && last.type === 'do') {
    const r = roll(info.actionCount);
    const dc = difficulty(last.text);
    log('d20 ' + r + ' vs ' + dc);
    sections.push({ kind: 'frontMemory', text: '[Outcome: ' + outcome(r, dc) + ']' });
  }
  return { text };
};
modifier(text);`;

export const DICE_SCRIPTS: NonNullable<Adventure['scripts']> = { library: LIBRARY, input: '', context: CONTEXT, output: '' };

export const isDiceScripts = (s: Adventure['scripts']) =>
  s?.library === DICE_SCRIPTS.library && s.input === DICE_SCRIPTS.input && s.context === DICE_SCRIPTS.context && s.output === DICE_SCRIPTS.output;
