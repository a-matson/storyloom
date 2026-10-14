import { useState } from 'react';
import { lineEdits } from '@app/session/lines';
import { isCurrent, textOf, YOU } from '@core/memory';
import type { Adventure } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input, Select } from '@ui/components/ui/field';
import { Switch } from '@ui/components/ui/switch';
import { SECTION, SECTION_BODY, SECTION_HEADER } from '../sidebar/Section';
import { Line } from './cards/FactRows';
import { showAction } from './EntityDetails';

const PRONOUNS = ['she/her', 'he/him', 'they/them'];

/** The player's own record: pronouns, the third-person name, and what they wrote about themselves. Only the player writes here. */
export function YouCard({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const [draft, setDraft] = useState('');
  const edits = lineEdits(api);
  const plot = adventure.plot;
  const enabled = plot.thirdPerson?.enabled ?? false;
  const name = plot.thirdPerson?.name ?? '';
  const mine = adventure.assertions.filter((a) => a.subject === YOU && a.producer === 'player' && isCurrent(a) && a.kind !== 'conflict');
  const add = () => {
    if (draft.trim()) edits.addLine(YOU, { kind: 'trait', text: draft.trim() });
    setDraft('');
  };
  return (
    <section className={SECTION} aria-label="You">
      <header className={SECTION_HEADER}>
        <span className="grow">You</span>
        <Select
          className="h-7 w-32 text-caption"
          aria-label="Pronouns"
          value={plot.you?.pronouns ?? ''}
          onChange={(e) => api.updatePlot({ you: { ...plot.you, pronouns: e.target.value || undefined } })}
        >
          <option value="">Pronouns</option>
          {PRONOUNS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </header>
      <div className={SECTION_BODY}>
        <div className="flex items-center gap-2 text-caption">
          <span className="grow">Third person</span>
          <Input
            className="h-7 w-30 text-caption"
            placeholder="Name"
            aria-label="Third-person name"
            value={name}
            onChange={(e) => api.updatePlot({ thirdPerson: { enabled, name: e.target.value } })}
          />
          <Switch aria-label="Third person" checked={enabled} onChange={(on) => api.updatePlot({ thirdPerson: { enabled: on, name } })} />
        </div>
        <ul className="flex flex-col gap-1.5 empty:hidden">
          {mine.map((a) => (
            <Line
              key={a.id}
              text={textOf(a)}
              fact={a}
              adventure={adventure}
              onShow={showAction}
              onEdit={(t) => edits.editLine(a.id, t)}
              onDelete={() => edits.deleteLine(a.id)}
            />
          ))}
        </ul>
        <Input
          className="h-8 text-caption"
          placeholder="Add something about you, then Enter"
          aria-label="Add a line about you"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      </div>
    </section>
  );
}
