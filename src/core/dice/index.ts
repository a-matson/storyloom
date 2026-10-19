import type { Adventure } from '../model';

/**
 * "Consequences (dice)": a d20 per Do turn, its outcome sent as front memory.
 * The Input hook sets `state.memory.frontMemory` on a Do and clears it on any other type
 * (a Continue runs onInput too); a plain retry does not run onInput, so it keeps the outcome. Seeded
 * by `actionCount + 1`: the count the old Context script saw after the action was appended,
 * so prompts stay byte-identical. Keyword DC 14 else 10; bands at DC and DC - 5. [provisional]
 * A Re-roll (`info.retry > 0`) rolls seed `actionCount + retry` in the Context hook and writes the
 * new outcome to front memory too, so a later plain retry keeps it.
 */
const ROLL = `function roll(seed) {
  var x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return 1 + ((x >>> 0) % 20);
}
function difficulty(text) {
  return /\\b(attack|fight|climb|sneak|pick|persuade|steal|jump)\\w*/i.test(text) ? 14 : 10;
}`;

const OLD_LIBRARY = `${ROLL}
function outcome(r, dc) {
  return r >= dc ? 'succeeds' : r >= dc - 5 ? 'succeeds at a cost' : 'fails badly';
}`;

/** `info.consequences`: fair is the old bands; harsh moves both up 3; none never fails badly. [provisional] */
const library = (dc: string) => `${ROLL}
function outcome(r, dc, level) {
  if (level === 'none') return r >= dc + 5 ? 'succeeds with flair' : r >= dc - 5 ? 'succeeds' : 'succeeds at a cost';
  var d = level === 'harsh' ? dc + 3 : dc;
  return r >= d ? 'succeeds' : r >= d - 5 ? 'succeeds at a cost' : 'fails badly';
}
function rolled(seed, text) {
  var r = roll(seed);
  var dc = ${dc};
  var o = outcome(r, dc, info.consequences);
  log('d20 ' + r + ' vs ' + dc + ' · ' + o);
  return '[Outcome: ' + o + ']';
}`;

/** `info.tension`: DC +2 when tense, +4 in action. [provisional] */
const LIBRARY = library(`difficulty(text) + (info.tension === 'action' ? 4 : info.tension === 'tense' ? 2 : 0)`);
/** The M24-2 library, before tension; saves still hold it. */
const CONSEQUENCE_LIBRARY = library('difficulty(text)');

const INPUT = `const modifier = (text) => {
  const front = info.actionType === 'do' ? rolled(info.actionCount + 1, text) : '';
  state.memory = { ...(state.memory || {}), frontMemory: front };
  return { text };
};
modifier(text);`;

const CONTEXT = `const modifier = (text) => {
  const last = history[history.length - 1];
  if (info.retry > 0 && last && last.type === 'do') {
    const front = rolled(info.actionCount + info.retry, last.text);
    state.memory = { ...(state.memory || {}), frontMemory: front };
    const i = sections.findIndex((s) => s.kind === 'frontMemory');
    if (i >= 0) sections[i] = { ...sections[i], text: front };
    else sections.push({ kind: 'frontMemory', text: front });
  }
  return { text };
};
modifier(text);`;

/** The M24-1 Input script. */
const OLD_INPUT = `const modifier = (text) => {
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

/** The M21-5 Context script. */
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

export const DICE_SCRIPTS: Scripts = { library: LIBRARY, input: INPUT, context: CONTEXT, output: '' };
export const LEGACY_DICE: Scripts = { library: OLD_LIBRARY, input: '', context: LEGACY_CONTEXT, output: '' };
/** Old saves still hold these, so the switch must still read as on. */
export const PREVIOUS_DICE: Scripts[] = [LEGACY_DICE, { library: OLD_LIBRARY, input: OLD_INPUT, context: '', output: '' }];

const same = (a: Scripts, b: Scripts) => a.library === b.library && a.input === b.input && a.context === b.context && a.output === b.output;

/** The M24-2 scripts: Re-roll and consequences work, tension does not raise DCs until the dice are switched off and on. */
export const CONSEQUENCE_DICE: Scripts = { ...DICE_SCRIPTS, library: CONSEQUENCE_LIBRARY };

export const isDiceScripts = (s: Adventure['scripts']) => s !== undefined && [DICE_SCRIPTS, CONSEQUENCE_DICE, ...PREVIOUS_DICE].some((d) => same(s, d));

/** Re-roll and the consequences level need the current script; an older one is upgraded by switching the dice off and on. */
export const isCurrentDice = (s: Adventure['scripts']) => s !== undefined && (same(s, DICE_SCRIPTS) || same(s, CONSEQUENCE_DICE));

/** The latest roll among a turn's script log lines, without the hook prefix: `d20 7 vs 10 · succeeds at a cost`. */
export const diceLine = (logs: readonly string[]) => logs.findLast((l) => /: d20 \d+ vs \d+ · /.test(l))?.replace(/^\w+: /, '');
