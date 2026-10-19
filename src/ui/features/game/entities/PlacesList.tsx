import { entityEdits } from '@app/session/entities';
import type { Adventure, ScriptState } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Select } from '@ui/components/ui/field';
import { Section } from '../sidebar/Section';
import { PlaceLinks } from './PlaceLinks';

type PlaceAsk = NonNullable<ScriptState['__placeAsk']>;

/** Yes puts the new place inside the old one, so moving between them is no change of place; either answer ends the ask. */
const answer = (api: GameApi, ask: PlaceAsk, yes: boolean) =>
  api.mutate((_, adv) => {
    const { __placeAsk: _done, ...rest } = adv.scriptState;
    adv.scriptState = rest;
    const inside = adv.entities.find((e) => e.kind === 'place' && e.name === ask.inside);
    if (yes && inside) adv.entities = adv.entities.map((e) => (e.kind === 'place' && e.name === ask.place && e !== inside ? { ...e, partOf: inside.id } : e));
  });

/** The story's places with their other names: which is inside which, the ways between them, and Merge for two names of one place. */
export function PlacesList({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const places = adventure.entities.filter((e) => e.kind === 'place');
  const ask = adventure.scriptState.__placeAsk;
  if (places.length === 0 && !ask) return null;
  const edits = entityEdits(api);
  return (
    <>
      {/* Outside the collapsed list, so the question is seen when it arrives. */}
      {ask && (
        <p className="text-caption flex items-center gap-2">
          <span className="grow">
            Is {ask.place} inside {ask.inside}?
          </span>
          <Button variant="ghost" onClick={() => answer(api, ask, true)}>
            Yes
          </Button>
          <Button variant="ghost" onClick={() => answer(api, ask, false)}>
            No
          </Button>
        </p>
      )}
      <Section title="Places">
        <ul aria-label="Places" className="m-0 flex list-none flex-col gap-2 p-0">
          {places.map((p) => {
            const others = places.filter((o) => o !== p);
            return (
              <li key={p.id} className="flex flex-col gap-1 text-caption">
                <span>
                  {p.name}
                  {p.aliases.length > 0 && <span className="text-muted-foreground"> · {p.aliases.join(', ')}</span>}
                </span>
                <span className="flex gap-1.5">
                  <Select
                    aria-label={`${p.name} is inside`}
                    className="text-caption grow"
                    value={p.partOf ?? ''}
                    onChange={(e) => edits.setPartOf(p.id, e.target.value || undefined)}
                  >
                    <option value="">Not inside another place</option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        inside {o.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label={`Merge ${p.name} into`}
                    className="text-caption grow"
                    value=""
                    onChange={(e) => {
                      const into = others.find((o) => o.id === e.target.value);
                      if (into && confirm(`Merge ${p.name} into ${into.name}? ${p.name} becomes another name for it.`)) void edits.merge(into.id, p.id);
                    }}
                  >
                    <option value="">Merge into…</option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </span>
                <PlaceLinks p={p} places={places} edits={edits} />
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
