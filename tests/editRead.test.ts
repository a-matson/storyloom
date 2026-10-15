import { describe, expect, it, vi } from 'vitest';
import { MemoryScheduler } from '@app/session/memoryScheduler';
import { introduce } from '@core/memory/introduce';
import { actionText, type Adventure } from '@core/model';
import type { CompletionRequest } from '@core/ports';
import { hashPrompt } from '@core/trace';
import { fakeProvider, memoryAdventure } from './fixtures/memoryJobs';

const reply = { scene: { location: 'the mill', present: ['Oriel'] }, entities: [{ name: 'Oriel', kind: 'character', description: 'A miller.', facts: [] }] };

/** Action 5 now names Oriel; the last turn was read already, so only an edit read can card her. */
function setup() {
  const adv: Adventure = memoryAdventure(19);
  adv.settings.memory = { ...adv.settings.memory, introductions: true, sceneEachTurn: true };
  const last = adv.actions.at(-1);
  const old = adv.actions[5];
  if (!last || !old) throw new Error('no actions');
  adv.actions[5] = { ...old, versions: ['You meet Oriel by the well.'], active: 0 };
  adv.scriptState = { ...adv.scriptState, __introducedAt: adv.actions.length, __introducedHash: hashPrompt(actionText(last)) };
  const reqs: CompletionRequest[] = [];
  const provider = fakeProvider(
    async function* (req) {
      reqs.push(req);
      yield { text: req.prompt.includes('New here') ? JSON.stringify(reply) : 'Mira found the map.', done: true };
    },
    false,
    true,
  );
  return { adv, reqs, provider };
}

describe('edit read', () => {
  it('an edit read cards a new name in the edited action and leaves the scene alone', async () => {
    const { adv, reqs, provider } = setup();
    const { plot, scriptState } = adv;
    await introduce(adv, { provider, template: adv.settings.template }, 5);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.prompt).toContain('[5] ');
    expect(reqs[0]?.prompt).not.toContain('[6] ');
    expect(adv.entities.map((e) => e.name)).toEqual(['Oriel']);
    expect(adv.plot).toBe(plot);
    expect(adv.scriptState).toEqual(scriptState);
  });

  it('edit schedules a read of that action', async () => {
    const { adv, provider } = setup();
    const scheduler = new MemoryScheduler({
      adventure: () => adv,
      helperModel: () => Promise.resolve({ provider, template: adv.settings.template }),
      embedder: () => Promise.resolve({ id: 'e', dimensions: 2, embed: (t) => Promise.resolve(t.map(() => [1, 0])) }),
      changed: () => {},
      annotate: () => {},
      portraits: () => Promise.resolve(),
      flag: () => {},
    });
    scheduler.edited(5);
    scheduler.start(new AbortController().signal);
    await vi.waitFor(() => expect(adv.entities.map((e) => e.name)).toContain('Oriel'));
  });
});
