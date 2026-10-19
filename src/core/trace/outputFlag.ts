// Here, not in `@core/text`: exported from that barrel it reshuffled the start-up chunks (+4 kB brotli).
import { tokenise } from '../memory/lexical';

/** Narration verbs that give the tense away; both lists [provisional]. */
const PAST = /\b(was|were|had|did|said|asked|looked|turned|walked|felt|saw|took|made|went|came|stood|knew|thought|seemed|began)\b/gi;
const PRESENT =
  /\b(is|are|am|has|have|does|say|says|ask|asks|look|looks|turn|turns|walk|walks|feel|feels|see|sees|take|takes|make|makes|go|goes|come|comes|stand|stands|know|knows|think|thinks|seem|seems|begin|begins)\b/gi;
/** Below this many markers a reply says too little to judge. [provisional] */
const MIN_MARKERS = 5;
/** Past share of the markers above which the reply has slipped out of present tense. [provisional] */
const PAST_SHARE = 0.6;

/** Dialogue may be in any tense; only narration outside quotes counts. */
export function pastTense(text: string): boolean {
  const narration = text.replaceAll(/"[^"]*"|“[^”]*”/g, ' ');
  const past = narration.match(PAST)?.length ?? 0;
  const total = past + (narration.match(PRESENT)?.length ?? 0);
  return total >= MIN_MARKERS && past / total > PAST_SHARE;
}

/** Why the last output is offered a retry with a note; shown under it, never retried by itself (that doubles turn time). */
export interface OutputFlag {
  label: string;
  button: string;
  note: string;
}

/** The player's banned phrases first (case-insensitive), then repeated (`fatiguedPhrases`, already tokenised), then the tense check. */
export function outputFlag(text: string, banned: readonly string[], repeats: readonly string[] = []): OutputFlag | undefined {
  const lower = text.toLowerCase();
  const hit = banned.map((p) => p.trim()).find((p) => p !== '' && lower.includes(p.toLowerCase()));
  if (hit !== undefined) return { label: `Uses "${hit}"`, button: 'Retry without it', note: `Never write "${hit}".` };
  const words = ` ${tokenise(text).join(' ')} `;
  const repeat = repeats.find((p) => words.includes(` ${p} `));
  if (repeat !== undefined) return { label: `Repeats: "${repeat}"`, button: 'Retry without it', note: `Never write "${repeat}".` };
  if (pastTense(text)) return { label: 'Past tense', button: 'Retry in present tense', note: 'Write in second person, present tense.' };
  return undefined;
}
