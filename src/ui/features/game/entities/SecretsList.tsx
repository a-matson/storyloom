import { lineEdits } from '@app/session/lines';
import { secretEdits } from '@app/session/secret';
import { andList, secretsOf, YOU } from '@core/memory';
import type { Adventure, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Section } from '../sidebar/Section';
import { Line } from './cards/FactRows';
import { showAction } from './EntityDetails';

/** A checkbox per character: ticked knows the secret. You are not listed; you always know. */
export function KnownBy({
  cast,
  knownBy,
  label,
  onChange,
}: {
  cast: readonly Entity[];
  knownBy: readonly string[];
  label: string;
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-wrap gap-x-3 gap-y-1 border-0 p-0 text-caption">
      <legend className="sr-only">{label}</legend>
      <span className="text-muted-foreground">Known to you and</span>
      {cast.map((e) => (
        <label key={e.id} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={knownBy.includes(e.id)}
            onChange={(ev) => onChange(ev.target.checked ? [...knownBy, e.id] : knownBy.filter((k) => k !== e.id))}
          />
          {e.name}
        </label>
      ))}
    </fieldset>
  );
}

export const charactersOf = (adventure: Adventure) => adventure.entities.filter((e) => e.kind === 'character');

/** What the prompt does with a secret, and for whom: every character not ticked. */
export function HiddenFrom({ cast, knownBy }: { cast: readonly Entity[]; knownBy: readonly string[] }) {
  const outsiders = cast.filter((e) => !knownBy.includes(e.id)).map((e) => e.name);
  const who = outsiders.length ? `${andList(outsiders)} ${outsiders.length > 1 ? 'are' : 'is'}` : 'anyone else is';
  return <p className="m-0 text-caption text-muted-foreground">While {who} there, the story is not told this action's words or any line that repeats them.</p>;
}

/** The player's secrets: the gist, who knows it, and delete. Marked from a Do/Say's "Secret". */
export function SecretsList({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const secrets = secretsOf(adventure.assertions);
  if (secrets.length === 0) return null;
  const lines = lineEdits(api);
  const edits = secretEdits(api);
  const cast = charactersOf(adventure);
  return (
    <Section title="Secrets">
      {secrets.map((s) => (
        <div key={s.id} className="flex flex-col gap-1">
          <ul aria-label="Secret" className="m-0 list-none p-0">
            <Line
              text={s.text}
              fact={s}
              adventure={adventure}
              onShow={showAction}
              onEdit={(t) => lines.editLine(s.id, t)}
              onDelete={() => lines.deleteLine(s.id)}
            />
          </ul>
          <KnownBy cast={cast} knownBy={s.knownBy.filter((k) => k !== YOU)} label={`Who knows: ${s.text}`} onChange={(ids) => edits.setKnownBy(s.id, ids)} />
          <HiddenFrom cast={cast} knownBy={s.knownBy} />
        </div>
      ))}
    </Section>
  );
}
