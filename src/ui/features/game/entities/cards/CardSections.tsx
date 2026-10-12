import { useSyncExternalStore, type ReactNode } from 'react';
import type { entityEdits } from '@app/session/entities';
import { ruleEdits } from '@app/session/rules';
import { currentStates, isCurrentState, LOOK_KEYS, rivalKey, setState } from '@core/memory';
import type { Adventure, Entity, EntityFact } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { SectionLabel } from '@ui/components/ui/section-label';
import { showAction } from '../EntityDetails';
import { Has } from '../ItemRows';
import { RuleRow } from '../RuleList';
import { AddRow, type AddKind } from './AddRow';
import { Line } from './FactRows';
import { ConflictLine, EffectLine, FactLine, StateLine, type Card } from './Lines';

interface Props {
  entity: Entity;
  adventure: Adventure;
  api: GameApi;
  edits: ReturnType<typeof entityEdits>;
  onClose: () => void;
  onOpen: (id: string) => void;
}

const LOOKS = new Set<string>(LOOK_KEYS);
const norm = (s: string) => s.trim().toLowerCase();
const isHistory = (f: EntityFact) => f.until !== undefined || f.text.startsWith('looked: ');

function Section({ label, children }: { label: string; children: ReactNode[] }) {
  if (children.length === 0) return null;
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{children}</ul>
    </>
  );
}

/** Rules gated on this entity or on a faction it relates to; the same records as the Rules tab. */
function Rules({ entity: e, adventure, api }: { entity: Entity; adventure: Adventure; api: GameApi }) {
  const used = useSyncExternalStore(api.subscribe, () => api.getSnapshot().context?.result.usedRuleIds);
  const related = new Set([...e.relations.map((r) => r.to), ...e.facts.flatMap((f) => (f.kind === 'relationship' && f.key ? [f.key] : []))].map(norm));
  const factions = new Set(adventure.entities.filter((x) => x.kind === 'faction' && related.has(norm(x.name))).map((x) => x.id));
  const gated = adventure.rules.filter((r) => r.gates.some((g) => g === e.id || factions.has(g)));
  if (gated.length === 0) return null;
  const edits = ruleEdits(api);
  return (
    <>
      <SectionLabel>Rules</SectionLabel>
      {gated.map((r) => (
        <RuleRow key={r.id} rule={r} adventure={adventure} edits={edits} sent={used?.includes(r.id) ?? false} />
      ))}
    </>
  );
}

/** The card's Is / Now / Has / With / Rules / Happened, each line editable, then the add row. */
export function CardSections({ entity: e, adventure, api, edits, onClose, onOpen }: Props) {
  const onShow = (i: number) => {
    onClose();
    showAction(i);
  };
  const card: Card = { entity: e, adventure, edits, onShow, onOpen };
  const live = e.facts.filter((f) => !isHistory(f) && !isCurrentState(f));
  const of = (kind: EntityFact['kind']) => live.filter((f) => !f.conflict && (f.kind ?? 'trait') === kind);
  const states = Object.entries(currentStates(e)).filter(([k]) => !rivalKey(e.kind, k));
  const stateLines = (looks: boolean) => states.filter(([k]) => LOOKS.has(k) === looks).map(([k, v]) => <StateLine key={k} card={card} k={k} v={v} />);
  const add = (kind: AddKind, t: string) => {
    const [k = '', ...v] = t.split(':');
    if (kind === 'state') edits.update(e.id, v.length ? setState(e, k.trim(), v.join(':').trim()) : setState(e, 'condition', t));
    else if (kind === 'item') edits.addItem(e.name, t);
    else if (kind === 'rule') ruleEdits(api).add(t, [e.id]);
    else edits.addFact(e.id, kind === 'effect' ? { text: t, kind, value: t } : { text: t, kind });
  };
  return (
    <>
      <Section label="Is">{[...of('trait').map((f) => <FactLine key={f.id} card={card} fact={f} text={f.text} />), ...stateLines(true)]}</Section>
      <Section label="Now">
        {[
          ...stateLines(false),
          ...of('effect').map((f) => <EffectLine key={f.id} card={card} fact={f} />),
          ...live.filter((f) => f.conflict).map((f) => <ConflictLine key={f.id} card={card} fact={f} />),
        ]}
      </Section>
      {e.kind === 'character' && <Has entity={e} entities={adventure.entities} onOpen={onOpen} />}
      <Section label="With">
        {[
          ...of('relationship').map((f) => <FactLine key={f.id} card={card} fact={f} text={`${f.key ?? 'you'}: ${f.value ?? f.text}`} />),
          ...e.relations.map((r) => (
            <Line
              key={`${r.to}|${r.label}`}
              text={`${r.label} → ${r.to}`}
              adventure={adventure}
              onShow={onShow}
              onDelete={() => edits.update(e.id, { relations: e.relations.filter((x) => x !== r) })}
            />
          )),
        ]}
      </Section>
      <Rules entity={e} adventure={adventure} api={api} />
      <Section label="Happened">
        {e.facts
          .filter(isHistory)
          .toSorted((a, b) => a.fromAction - b.fromAction)
          .map((f) => (
            <FactLine key={f.id} card={card} fact={f} text={f.kind === 'state' ? `${f.key}: ${f.value}` : (f.value ?? f.text)}>
              <Button
                variant="ghost"
                className="h-7 shrink-0 font-mono text-caption"
                aria-label={`Show action ${f.fromAction} in the story`}
                onClick={() => onShow(f.fromAction)}
              >
                action {f.fromAction}
              </Button>
            </FactLine>
          ))}
      </Section>
      <AddRow entity={e} onAdd={add} />
    </>
  );
}
