import { describe, expect, it, vi } from 'vitest';
import { MemoryScheduler } from '@app/session/memoryScheduler';
import { mergeEntity } from '@core/memory/entities';
import type { Adventure } from '@core/model';
import type { Embedder } from '@core/ports';
import { ENTITY_PROMPT, fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const mira = mergeEntity(undefined, { name: 'Mira', kind: 'character', description: '' }, 0);

/** Mira is there and the last output moves her; the helper logs each call's kind, and holds a state call while `hold` is set. */
function setup(stateRead: Adventure['settings']['memory']['stateRead'], hold = false) {
  // Short when held: an overdue memory run is never cut by typing.
  const adv = memoryAdventure(hold ? 5 : 19);
  adv.settings.memory = { ...adv.settings.memory, sceneEachTurn: true, stateRead };
  adv.entities = [mira];
  adv.plot.scene = { present: [mira.id] };
  const last = adv.actions.at(-1);
  if (last) last.versions = ['Mira sits down.'];
  const calls: string[] = [];
  let held = hold;
  const provider = fakeProvider(
    async function* (req, signal) {
      const kind = req.prompt.includes('Who is in the scene')
        ? 'state'
        : req.prompt.includes('Where does the passage end')
          ? 'scene'
          : req.prompt.includes(ENTITY_PROMPT)
            ? 'entity'
            : 'memory';
      calls.push(kind);
      if (kind === 'state' && held) {
        held = false;
        await new Promise((r) => signal?.addEventListener('abort', r));
        return;
      }
      const text = {
        state: `{"changes": [{"who": "Mira", "key": "posture", "now": "sitting", "at": ${adv.actions.length - 1}}]}`,
        scene: '{"scene": {"moved": false, "location": "", "present": ["Mira"], "left": [], "weather": "unchanged"}}',
        entity: '{"entities": [], "speakers": []}',
        memory: 'Mira found the map.',
      }[kind];
      yield { text, done: true };
    },
    false,
    true,
  );
  const embedder: Embedder = { id: 'e', dimensions: 2, embed: (t) => Promise.resolve(t.map(() => [1, 0])) };
  const scheduler = new MemoryScheduler({
    adventure: () => adv,
    helperModel: () => Promise.resolve({ provider, template: adv.settings.template }),
    embedder: () => Promise.resolve(embedder),
    changed: () => {},
    annotate: () => {},
    portraits: () => Promise.resolve(),
    flag: () => {},
  });
  const posture = () => adv.assertions.find((a) => a.subject === mira.id && a.kind === 'state' && a.key === 'posture' && a.until === undefined);
  return { calls, scheduler, posture };
}

describe('the state read in the scheduler', () => {
  it('runs after the turn read and before the memory run', async () => {
    const { calls, scheduler, posture } = setup('every');
    scheduler.start(new AbortController().signal);
    await vi.waitFor(() => expect(calls).toContain('memory'));
    expect(calls.slice(0, 2)).toEqual(['scene', 'state']);
    expect(posture()).toMatchObject({ value: 'sitting', producer: 'turn' });
  });

  it('makes no state call when off', async () => {
    const { calls, scheduler } = setup('off');
    scheduler.start(new AbortController().signal);
    await vi.waitFor(() => expect(calls).toContain('memory'));
    expect(calls).not.toContain('state');
  });

  it('idle only: typing cuts it, and it runs again once the input clears', async () => {
    const { calls, scheduler, posture } = setup('idle', true);
    scheduler.start(new AbortController().signal);
    await vi.waitFor(() => expect(calls).toEqual(['scene', 'state']));
    scheduler.setTyping(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(posture()).toBeUndefined();
    scheduler.setTyping(false);
    await vi.waitFor(() => expect(posture()).toMatchObject({ value: 'sitting' }));
    expect(calls.filter((c) => c === 'state')).toHaveLength(2);
  });
});
