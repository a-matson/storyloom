// Not re-exported from `./index`: only the lazy memory jobs build it, so its wording stays off the start-up bundle.

/**
 * The state read: each subject's record, the passage, then the P8b ask in its measured wording ("at most
 * four words", one line with no spaces: "a few words" padded values to the cap and cut 24 of 30 replies).
 * No "effect on/off" ask: the 12B used it as a dump (P8). [measured: 2026-10-13-state-probe-m12-dogfood-p8b]
 */
export function statePrompt(
  records: readonly { who: string; now: Readonly<Record<string, string>> }[],
  passage: string,
  max: number,
  grammar: boolean,
): string {
  const line = ({ who, now }: (typeof records)[number]) =>
    `${who}: ${
      Object.entries(now)
        .map(([k, v]) => `${k} ${v}`)
        .join('; ') || 'nothing yet'
    }`;
  return (
    `Who is in the scene, with their record before this passage ("you" is the player):\n${records.map(line).join('\n')}\n\n---\n${passage}\n---\n\n` +
    `What changed by the end of the passage? At most ${max} entries, the most important first: who, which key, the new value in at most four words, ` +
    'and at = the [number] of the paragraph that shows it. Only a value no longer true at the end; skip values that did not change. Only what the passage states. ' +
    // Without a meaning per key the 12B put awake/unconscious under mood and kneeling under location;
    // holds named things nobody had listed ("revolver"). With it: rejections other than unchanged 31 → 14 of ~120.
    // [measured: 2026-10-14-state-m13-3b-keys.json]
    'Keys: location = the place they are in; posture = standing, sitting, kneeling, lying; ' +
    'condition = the body: awake, asleep, unconscious, hurt, drunk; mood = a feeling; wearing = clothes; ' +
    'holds = an item listed above that someone now carries.\n' +
    (grammar ? '' : 'Return {"changes":[{"who":"<Name>","key":"<key>","now":"<new value>","at":<number>}]}.\n') +
    'Write the JSON on one line with no spaces after the commas.'
  );
}
