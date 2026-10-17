import { useState } from 'react';
import { entityEdits } from '@app/session/entities';
import { isPortraitStale } from '@app/session/portraitPrompt';
import { tokenizer } from '@app/services';
import { KEY_ORDER, nowLines, SEND_GOALS } from '@core/context';
import { roomsOf } from '@core/memory';
import type { Adventure, Assertion, Entity, Scene } from '@core/model';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';
import { Pill } from '@ui/components/ui/pill';
import { showAction } from './EntityDetails';
import { SceneFields } from './SceneFields';
import { Section } from '../sidebar/Section';

type Edits = ReturnType<typeof entityEdits>;

const label = (a: Assertion) => (a.kind === 'state' || a.kind === 'look' ? `${a.key}: ${a.value}` : a.kind === 'effect' ? a.condition : '');

/** One value the line sends: its action jumps to the passage, ✕ ends it now. */
function Chip({ fact: a, onEnd }: { fact: Assertion; onEnd: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 text-caption">
      {label(a)}
      <button type="button" className="font-mono text-muted-foreground" aria-label={`Show action ${a.at} in the story`} onClick={() => showAction(a.at)}>
        {a.at}
      </button>
      <button type="button" aria-label={`End ${label(a)}`} onClick={onEnd}>
        ✕
      </button>
    </span>
  );
}

/** The player's value for one of the keys the cast sends. */
function SetState({ entity: e, edits }: { entity: Entity; edits: Edits }) {
  const [key, setKey] = useState<string>(KEY_ORDER[0]);
  const [value, setValue] = useState('');
  const set = () => {
    if (!value.trim()) return;
    edits.setValue(e.id, key, value.trim());
    setValue('');
  };
  return (
    <div className="flex gap-1.5">
      <Select aria-label={`State of ${e.name}`} className="text-caption w-28" value={key} onChange={(ev) => setKey(ev.target.value)}>
        {KEY_ORDER.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </Select>
      <Input
        aria-label={`New ${key} of ${e.name}`}
        className="text-caption grow"
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        onKeyDown={(ev) => ev.key === 'Enter' && set()}
      />
      <Button variant="ghost" className="h-7" aria-label={`Set ${key} of ${e.name}`} onClick={set}>
        Set
      </Button>
    </div>
  );
}

const AWAY = '\u0000away';

/**
 * Where a present character is: with you, a room of this place (`zones`), or away (out of `present`).
 * The read misses a move to another room; through `updatePlot` the gap is logged, so witnessed-by sees it.
 */
function SendTo({ entity: e, scene, entities, api }: { entity: Entity; scene: Scene; entities: readonly Entity[]; api: GameApi }) {
  const places = entities.filter((x) => x.kind === 'place');
  const at = scene.zones?.[e.id] ?? '';
  const here = places.find((p) => p.id === scene.location);
  const rooms = [...new Set([...roomsOf(places, here), ...(at ? [at] : [])])];
  const send = (to: string) => {
    const { zones: _, ...rest } = scene;
    const others = Object.fromEntries(Object.entries(scene.zones ?? {}).filter(([k]) => k !== e.id));
    const zones = to && to !== AWAY ? { ...others, [e.id]: to } : others;
    const present = to === AWAY ? scene.present.filter((p) => p !== e.id) : scene.present;
    api.updatePlot({ scene: { ...rest, present, ...(Object.keys(zones).length > 0 && { zones }) } });
  };
  return (
    <Select aria-label={`Send ${e.name} to`} className="text-caption w-40 self-start" value={at} onChange={(ev) => send(ev.target.value)}>
      <option value="">with you</option>
      {rooms.map((r) => (
        <option key={r} value={r}>
          in {r}
        </option>
      ))}
      <option value={AWAY}>away</option>
    </Select>
  );
}

/**
 * Top of the World tab: the scene and cast exactly as the next prompt sends them (`nowLines`), each
 * sent value a chip. An ended value can be undone until the tab closes; it is not a log entry.
 */
export function NowCard({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const [ended, setEnded] = useState<Assertion[]>([]);
  const { scene: stored, sceneLog = [] } = adventure.plot;
  if (!stored) return null;
  const edits = entityEdits(api);
  const { scene, lines } = nowLines(adventure);
  const byId = new Map(adventure.assertions.map((a) => [a.id, a]));
  const end = (a: Assertion) => {
    edits.endLine(a.id);
    setEnded([...ended, a]);
  };
  const undo = (a: Assertion) => {
    edits.restoreLine(a.id);
    setEnded(ended.filter((x) => x.id !== a.id));
  };
  const text = [scene, ...lines.map((l) => l.text)].join('\n');
  // A confirmed goal to act on; a nudge sends it with the next turn.
  const wants = (e: Entity) =>
    SEND_GOALS &&
    stored.present.includes(e.id) &&
    adventure.assertions.some((a) => a.subject === e.id && a.kind === 'goal' && a.until === undefined && a.seen !== false);
  const nudged = (e: Entity) => !!adventure.scriptState.__nudge?.some((n) => n.id === e.id && n.at === adventure.actions.length);
  return (
    <Section title="Now" tokens={tokenizer.count(text)} badge={<Pill tone="auto">auto</Pill>} defaultOpen>
      {scene && <p className="text-caption">{scene}</p>}
      <ul aria-label="Cast" className="m-0 flex list-none flex-col gap-2 p-0">
        {lines.map(({ entity: e, text: t, factIds, gaps = [] }) => (
          <li key={e.id} className="flex flex-col gap-1">
            <span className="text-caption">{t}</span>
            {isPortraitStale(e, adventure.assertions) && <span className="text-caption text-muted-foreground">Portrait is older than the look</span>}
            <span className="flex flex-wrap gap-1">
              {factIds.flatMap((id) => {
                const a = byId.get(id);
                return a && label(a) ? [<Chip key={id} fact={a} onEnd={() => end(a)} />] : [];
              })}
              {gaps.map((g) => (
                <span key={g.from} className="inline-flex items-center gap-1 rounded-full border border-border px-2 text-caption">
                  {g.kind === 'asleep' ? 'slept through' : 'away'}
                  <button
                    type="button"
                    className="font-mono text-muted-foreground"
                    aria-label={`Show action ${g.from} in the story`}
                    onClick={() => showAction(g.from)}
                  >
                    {g.from}
                  </button>
                </span>
              ))}
              {ended
                .filter((a) => a.subject === e.id)
                .map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                    <s>{label(a)}</s>
                    <Button variant="ghost" className="h-6" onClick={() => undo(a)}>
                      Undo
                    </Button>
                  </span>
                ))}
            </span>
            {e.kind === 'character' && <SetState entity={e} edits={edits} />}
            {wants(e) && (
              <Button variant="ghost" className="h-7 self-start" aria-pressed={nudged(e)} onClick={() => edits.nudge(e.id)}>
                {nudged(e) ? 'Nudged' : 'Nudge'} {e.name}
              </Button>
            )}
            {stored.present.includes(e.id) && <SendTo entity={e} scene={stored} entities={adventure.entities} api={api} />}
          </li>
        ))}
      </ul>
      <SceneFields scene={stored} entities={adventure.entities} log={sceneLog} api={api} />
    </Section>
  );
}
