import { Textarea } from '@ui/components/ui/textarea';

/** Lines kept in the box. [provisional] */
const MAX_BANNED = 20;

/** Phrases the player never wants in an output; a hit flags it for a retry. Blank lines are kept so typing a newline works. */
export function NeverWrite({ value, onChange }: { value: readonly string[]; onChange: (next: string[]) => void }) {
  return (
    <>
      <label className="text-caption text-muted-foreground" htmlFor="banned">
        Never write (one per line)
      </label>
      <Textarea
        id="banned"
        className="min-h-16"
        placeholder="his voice thick"
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').slice(0, MAX_BANNED))}
      />
    </>
  );
}
