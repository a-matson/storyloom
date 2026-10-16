// Not re-exported from `./index`: only the lazy memory jobs build it, so its wording stays off the start-up bundle.

/**
 * The state read: the P8b ask, each subject's record, then the passage. The ask keeps its measured wording ("at most
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
      // A stored location (older saves, items) is not sent: read B no longer writes it, so it would only be echoed.
      Object.entries(now)
        .filter(([k]) => k !== 'location')
        .map(([k, v]) => `${k} ${v}`)
        .join('; ') || 'nothing yet'
    }`;
  // The ask leads and the variable cap trails the passage, so slot 1 reuses the ask from its prompt cache (M17-2).
  return (
    'What changed by the end of the passage? The most important first: who, which key, the new value in at most four words, ' +
    'and at = the [number] of the paragraph that shows it. Only a value different from the record below: never repeat a value the record already has, even reworded. Only what the passage states. ' +
    // Without a meaning per key the 12B put awake/unconscious under mood and kneeling under location;
    // holds named things nobody had listed ("revolver"). With it: rejections other than unchanged 31 → 14 of ~120.
    // [measured: 2026-10-14-state-m13-3b-keys.json]
    'Keys: posture = standing, sitting, kneeling, lying; ' +
    'condition = the body: awake, asleep, unconscious, hurt, drunk; mood = a feeling; wearing = clothes; ' +
    'holds = an item listed below that someone now carries.\n\n' +
    `Who is in the scene, with their record before this passage ("you" is the player):\n${records.map(line).join('\n')}\n\n---\n${passage}\n---\n\n` +
    `At most ${max} entries.\n` +
    (grammar ? '' : 'Return {"changes":[{"who":"<Name>","key":"<key>","now":"<new value>","at":<number>}]}.\n') +
    // With "never repeat" above: cap hits 18/24 → 0/24, read B 11.4 → 7.8 s; "skip values that did not change" alone left 7/24.
    // [measured: 2026-10-15-state-s4b.json]
    'If nothing changed, return {"changes":[]}.\n' +
    'Write the JSON on one line with no spaces after the commas.'
  );
}
