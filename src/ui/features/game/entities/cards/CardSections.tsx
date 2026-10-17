import { useSyncExternalStore, type ReactNode } from 'react';
import type { entityEdits } from '@app/session/entities';
import { ruleEdits } from '@app/session/rules';
import { current, currentStates, eventsOf, indexAssertions, LOOK_KEYS, rivalKey, textOf, YOU } from '@core/memory';
import type { Adventure, Assertion, Entity } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { SectionLabel } from '@ui/components/ui/section-label';
import { showAction } from '../EntityDetails';
import { Has } from '../ItemRows';
import { RuleRow } from '../RuleList';
import { AddRow, type AddKind } from './AddRow';
import { Line } from './FactRows';
import { ClaimLine, EffectLine, FactLine, GoalLine, StateLine, type Card } from './Lines';

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
// `looked:` traits are the old, replaced looks.
const isHistory = (a: Assertion) => a.until !== undefined || (a.kind === 'trait' && a.text.startsWith('looked: '));
const isClaim = (a: Assertion) => a.kind === 'conflict' || ((a.kind === 'look' || a.kind === 'state') && a.seen === false);

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
function Rules({ entity: e, own, adventure, api }: { entity: Entity; own: readonly Assertion[]; adventure: Adventure; api: GameApi }) {
  const used = useSyncExternalStore(api.subscribe, () => api.getSnapshot().context?.result.usedRuleIds);
  const related = new Set([...e.relations.map((r) => r.to), ...own.flatMap((a) => (a.kind === 'relationship' ? [a.to] : []))].map(norm));
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
  const own = indexAssertions(adventure.assertions).of(e.id);
  const card: Card = { entity: e, own, adventure, edits, onShow, onOpen };
  const live = own.filter((a) => !isHistory(a) && !isClaim(a));
  const states = Object.entries(currentStates(own)).filter(([k]) => !rivalKey(e.kind, k));
  const stateLines = (looks: boolean) => states.filter(([k]) => LOOKS.has(k) === looks).map(([k, v]) => <StateLine key={k} card={card} k={k} v={v} />);
  const add = (kind: AddKind, t: string) => {
    const [k = '', ...v] = t.split(':');
    if (kind === 'state') edits.setValue(e.id, v.length ? k.trim() : 'condition', v.length ? v.join(':').trim() : t);
    else if (kind === 'item') edits.addItem(e.name, t);
    else if (kind === 'rule') ruleEdits(api).add(t, [e.id]);
    else if (kind === 'goal') edits.setGoal(e.id, t);
    else if (kind === 'event') edits.addLine(e.id, { kind, text: t, who: /\byou\b/i.test(t) ? [e.id, YOU] : [e.id] });
    else edits.addLine(e.id, kind === 'effect' ? { kind, condition: t } : { kind, text: t });
  };
  return (
    <>
      <Section label="Is">
        {[
          ...current(live, 'trait').map((a) => <FactLine key={a.id} card={card} fact={a} text={a.text} />),
          ...current(live, 'voice').map((a) => <FactLine key={a.id} card={card} fact={a} text={`speaks: ${a.text}`} />),
          ...current(live, 'goal').map((a) => <GoalLine key={a.id} card={card} fact={a} />),
          ...stateLines(true),
        ]}
      </Section>
      <Section label="Now">
        {[
          ...stateLines(false),
          ...current(live, 'effect').map((a) => <EffectLine key={a.id} card={card} fact={a} />),
          ...own.filter((a) => isClaim(a) && !isHistory(a)).map((a) => <ClaimLine key={a.id} card={card} fact={a} />),
        ]}
      </Section>
      {e.kind === 'character' && <Has entity={e} adventure={adventure} onOpen={onOpen} />}
      <Section label="With">
        {[
          ...current(live, 'relationship').map((a) => <FactLine key={a.id} card={card} fact={a} text={`${a.to}: ${a.stance}`} />),
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
      <Rules entity={e} own={own} adventure={adventure} api={api} />
      <Section label="Happened">
        {[...own.filter((a) => isHistory(a) && a.kind !== 'identity' && a.kind !== 'event'), ...eventsOf(adventure.assertions, e.id)]
          .toSorted((a, b) => a.since - b.since)
          .map((a) => (
            <FactLine key={a.id} card={card} fact={a} text={textOf(a)}>
              <Button
                variant="ghost"
                className="h-7 shrink-0 font-mono text-caption"
                aria-label={`Show action ${a.since} in the story`}
                onClick={() => onShow(a.since)}
              >
                action {a.since}
              </Button>
            </FactLine>
          ))}
      </Section>
      <AddRow entity={e} onAdd={add} />
    </>
  );
}
