// Only start-up members of the barrel: importing a lazy one splits it out of the start-up chunk.
import { loadImagePrompt } from '@core/image';
import { indexAssertions, loadMemoryJobs, withLooks } from '@core/memory';
import { newId, type Adventure, type Entity } from '@core/model';
import { cropSquare, downscale } from '../image';
import { withoutReference } from './images';
import { lineEdits, patch } from './lines';
import { clearPortrait, dropPortrait, PORTRAIT_PX, renderPortrait, setPortrait } from './portraits';
import { repointGates } from './rules';
import type { GameSession } from './session';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const withoutLook = ({ look: _l, ...e }: Entity): Entity => e;

/**
 * The player's edits to `adv.entities`, through the session's `mutate`. Not session methods, so
 * this stays out of the start-up bundle: only the lazy entity drawer imports it.
 */
export function entityEdits(host: GameSession) {
  const mutate = (fn: (adv: Adventure) => void) => host.mutate((_, adv) => fn(adv));
  return {
    update: (id: string, p: Partial<Entity>) => mutate((adv) => patch(adv, id, p)),
    delete: (id: string) => {
      const old = host.adv.entities.find((e) => e.id === id)?.portraitId;
      mutate((adv) => {
        adv.entities = adv.entities.filter((e) => e.id !== id);
        adv.assertions = adv.assertions.filter((a) => a.subject !== id);
        repointGates(adv, id);
      });
      if (old !== undefined) dropPortrait(host, old);
    },
    /** Player-asked, so unlike the idle queue a failure is shown. */
    regeneratePortrait: (id: string) => renderPortrait(host, id).catch((err: unknown) => host.onError(`Could not draw the portrait: ${message(err)}`)),
    uploadPortrait: async (id: string, file: Blob) => {
      try {
        await setPortrait(host, id, await downscale(file, PORTRAIT_PX));
      } catch (err) {
        host.onError(`Could not use that image: ${message(err)}`);
      }
    },
    clearPortrait: (id: string) => clearPortrait(host, id),
    ...lineEdits(host),
    /** Freeze the character's current look and point at that See image; later Sees repeat the words and the seed. */
    setReference: async (id: string, imageId: string) => {
      const { looksOf } = await loadImagePrompt();
      mutate((adv) => {
        const e = adv.entities.find((x) => x.id === id);
        if (e) patch(adv, id, { referenceImageId: imageId, look: looksOf(withLooks(e, indexAssertions(adv.assertions).of(id))) });
      });
    },
    clearReference: (id: string) => mutate((adv) => (adv.entities = adv.entities.map((e) => (e.id === id ? withoutReference(e) : e)))),
    /** Back to the story's own words and a random seed; the reference image stays. */
    unfreeze: (id: string) => mutate((adv) => (adv.entities = adv.entities.map((e) => (e.id === id ? withoutLook(e) : e)))),
    /** The reference's centre square becomes the portrait. */
    portraitFromReference: async (id: string, imageId: string) => {
      try {
        const blob = await host.svc.storage.getImage(host.adv.id, imageId);
        if (!blob) throw new Error('the image is not stored');
        await setPortrait(host, id, await cropSquare(blob, PORTRAIT_PX));
      } catch (err) {
        host.onError(`Could not use that image: ${message(err)}`);
      }
    },
    /** `fromId` is folded into `intoId` and deleted; no undo. */
    merge: async (intoId: string, fromId: string) => {
      const { mergeEntities, mergeOwn } = await loadMemoryJobs();
      mutate((adv) => {
        const into = adv.entities.find((e) => e.id === intoId);
        const from = adv.entities.find((e) => e.id === fromId);
        if (!into || !from || into === from) return;
        const merged = mergeEntities(into, from);
        adv.entities = adv.entities.flatMap((e) => (e === from ? [] : e === into ? [merged] : [e]));
        const own = (id: string) => adv.assertions.filter((a) => a.subject === id);
        adv.assertions = [...adv.assertions.filter((a) => a.subject !== intoId && a.subject !== fromId), ...mergeOwn(into, own(intoId), own(fromId))];
        repointGates(adv, fromId, intoId);
        if (from.portraitId !== undefined && from.portraitId !== merged.portraitId) dropPortrait(host, from.portraitId);
      });
    },
    /** A real story card from the projection; `cardId` stops the projection so the text is not in the prompt twice. */
    promote: async (id: string) => {
      const { projectEntity } = await loadMemoryJobs();
      mutate((adv) => {
        const e = adv.entities.find((x) => x.id === id);
        if (!e) return;
        const card = { ...projectEntity(e, indexAssertions(adv.assertions).of(id)), id: newId('card_') };
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
    const r = await updateEntities(host.adv, { fromAction: Math.max(e.firstSeen, toAction - MEMORY_SPAN), toAction }, await host.helperModel());
    host.log.annotate(r.speakers);
    host.changed();
  } catch (err) {
    host.onError(`Could not update ${e.name}: ${message(err)}`);
  }
}
