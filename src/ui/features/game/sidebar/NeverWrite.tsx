import { actionText, type Action, type AdventureSettings } from '@core/model';
import { FATIGUE_WINDOW, fatiguedPhrases } from '@core/text';
import { Button } from '@ui/components/ui/button';
import { Textarea } from '@ui/components/ui/textarea';
import { SettingSwitch } from './SettingSwitch';

/** Lines kept in the box. [provisional] */
const MAX_BANNED = 20;

/** Phrases the recent AI outputs keep repeating; empty when the player turned it off. */
export function repeatedLately(settings: AdventureSettings, actions: readonly Action[]): string[] {
  if (!settings.autoBanned) return [];
  return fatiguedPhrases(
    actions
      .filter((a) => a.type === 'continue')
      .slice(-FATIGUE_WINDOW)
      .map(actionText),
  );
}

interface Props {
  s: AdventureSettings;
  update: (patch: Partial<AdventureSettings>) => void;
  repeated: readonly string[];
}

/** Phrases the player never wants in an output; a hit flags it for a retry. Blank lines are kept so typing a newline works. */
export function NeverWrite({ s, update, repeated }: Props) {
  const keep = (p: string) => update({ bannedPhrases: [...s.bannedPhrases.filter((x) => x.trim() !== ''), p].slice(0, MAX_BANNED) });
  const kept = new Set(s.bannedPhrases.map((x) => x.trim().toLowerCase()));
  const offered = repeated.filter((p) => !kept.has(p));
  return (
    <>
      <label className="text-caption text-muted-foreground" htmlFor="banned">
        Never write (one per line)
      </label>
      <Textarea
        id="banned"
        className="min-h-16"
        placeholder="his voice thick"
        value={s.bannedPhrases.join('\n')}
        onChange={(e) => update({ bannedPhrases: e.target.value.split('\n').slice(0, MAX_BANNED) })}
      />
      <SettingSwitch
        id="auto-banned"
        label="Flag repeated phrases"
        help="A phrase in 3 of the last 10 replies flags a reply that uses it; Keep adds it to the box"
        checked={s.autoBanned}
        onChange={(autoBanned) => update({ autoBanned })}
      />
      {offered.length > 0 && (
        <ul aria-label="Repeated lately" className="text-caption text-muted-foreground">
          {offered.map((p) => (
            <li key={p} className="flex items-center justify-between gap-2">
              <span>{p}</span>
              <Button variant="ghost" className="h-7 px-2" aria-label={`Keep "${p}"`} onClick={() => keep(p)}>
                Keep
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
