// Only `loadMemoryJobs`: importing more from the barrel splits it out of the start-up chunk.
import { loadMemoryJobs } from '@core/memory';
import { newId, type Adventure, type Entity } from '@core/model';
import type { GameSession } from './session';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const patch = (adv: Adventure, id: string, p: Partial<Entity>) => (adv.entities = adv.entities.map((e) => (e.id === id ? { ...e, ...p } : e)));

/**
 * The player's edits to `adv.entities`, through the session's `mutate`. Not session methods, so
 * this stays out of the start-up bundle: only the lazy entity drawer imports it.
 */
export function entityEdits(host: GameSession) {
  const mutate = (fn: (adv: Adventure) => void) => host.mutate((_, adv) => fn(adv));
  return {
    update: (id: string, p: Partial<Entity>) => mutate((adv) => patch(adv, id, p)),
    delete: (id: string) => mutate((adv) => (adv.entities = adv.entities.filter((e) => e.id !== id))),
    /** `fromId` is folded into `intoId` and deleted; no undo. */
    merge: async (intoId: string, fromId: string) => {
      const { mergeEntities } = await loadMemoryJobs();
      mutate((adv) => {
        const into = adv.entities.find((e) => e.id === intoId);
        const from = adv.entities.find((e) => e.id === fromId);
        if (!into || !from || into === from) return;
        adv.entities = adv.entities.flatMap((e) => (e === from ? [] : e === into ? [mergeEntities(into, from)] : [e]));
      });
    },
    /** A real story card from the projection; `cardId` stops the projection so the text is not in the prompt twice. */
    promote: async (id: string) => {
      const { projectEntity } = await loadMemoryJobs();
      mutate((adv) => {
        const e = adv.entities.find((x) => x.id === id);
        if (!e) return;
        const card = { ...projectEntity(e), id: newId('card_') };
        adv.storyCards = [...adv.storyCards, card];
        patch(adv, id, { cardId: card.id });
      });
    },
    refresh: (id: string): Promise<void> => (host.getSnapshot().busy ? Promise.resolve() : refreshEntity(host, id)),
  };
}

/**
 * One combined helper call (slot 1) over the last memory span the entity was seen in; new facts
 * fold in through the merge rules, so nothing the player wrote is replaced. Player-triggered, so it
 * sits outside the per-cycle budget.
 */
async function refreshEntity(host: GameSession, id: string): Promise<void> {
  const e = host.adv.entities.find((x) => x.id === id);
  if (!e) return;
  const toAction = e.lastSeen + 1;
  try {
    const { updateEntities, MEMORY_SPAN } = await loadMemoryJobs();
    await updateEntities(host.adv, { fromAction: Math.max(e.firstSeen, toAction - MEMORY_SPAN), toAction }, await host.helperModel());
    host.changed();
  } catch (err) {
    host.onError(`Could not update ${e.name}: ${message(err)}`);
  }
}
