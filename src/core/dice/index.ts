import type { Adventure } from '../model';

/**
 * "Consequences (dice)": a d20 per Do turn, its outcome sent as front memory.
 * The Input hook sets `state.memory.frontMemory` on a Do and clears it on any other type
 * (a Continue runs onInput too); retry does not run onInput, so it keeps the outcome. Seeded
 * by `actionCount + 1`: the count the old Context script saw after the action was appended,
 * so prompts stay byte-identical. Keyword DC 14 else 10; bands at DC and DC - 5. [provisional]
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

const INPUT = `const modifier = (text) => {
  let front = '';
  if (info.actionType === 'do') {
    const r = roll(info.actionCount + 1);
    const dc = difficulty(text);
    log('d20 ' + r + ' vs ' + dc);
    front = '[Outcome: ' + outcome(r, dc) + ']';
  }
  state.memory = { ...(state.memory || {}), frontMemory: front };
  return { text };
};
modifier(text);`;

/** The M21-5 Context script: old saves still hold it, so the switch must still read as on. */
const LEGACY_CONTEXT = `const modifier = (text) => {
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

type Scripts = NonNullable<Adventure['scripts']>;

export const DICE_SCRIPTS: Scripts = { library: LIBRARY, input: INPUT, context: '', output: '' };
export const LEGACY_DICE: Scripts = { library: LIBRARY, input: '', context: LEGACY_CONTEXT, output: '' };

const same = (a: Scripts, b: Scripts) => a.library === b.library && a.input === b.input && a.context === b.context && a.output === b.output;

export const isDiceScripts = (s: Adventure['scripts']) => s !== undefined && (same(s, DICE_SCRIPTS) || same(s, LEGACY_DICE));
