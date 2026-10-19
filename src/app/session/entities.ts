// Only start-up members of the barrel: importing a lazy one splits it out of the start-up chunk.
import { loadImagePrompt } from '@core/image';
import { indexAssertions, loadMemoryJobs, repointSecrets, withLooks, YOU } from '@core/memory';
import { newId, type Adventure, type Entity } from '@core/model';
import { cropSquare, downscale } from '../image';
import { withoutReference } from './seeRender';
import { lineEdits, patch } from './lines';
import { clearPortrait, PORTRAIT_PX, renderPortrait, setPortrait } from './portraits';
import { repointGates } from './rules';
import type { GameSession } from './session';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const withoutLook = ({ look: _l, ...e }: Entity): Entity => e;

/** The scene's `from` reference as `to`: the kept entity's id on a merge, the name on a delete (the person is still there). */
function repointScene(adv: Adventure, from: string, to: string): void {
  const s = adv.plot.scene;
  if (!s || (s.location !== from && !s.present.includes(from))) return;
  const swap = (r: string) => (r === from ? to : r);
  adv.plot = { ...adv.plot, scene: { ...s, ...(s.location !== undefined && { location: swap(s.location) }), present: [...new Set(s.present.map(swap))] } };
}

/**
 * "This is me": the card was the player all along. Its lines move to `you` (the story's as proposals, states
 * stay), what pointed at it points at you, the card goes, and its name becomes the player's if none is set.
 */
function mergeIntoYou(host: GameSession, id: string): void {
  host.mutate((_, adv) => {
    const e = adv.entities.find((x) => x.id === id);
    if (!e) return;
    const names = new Set([e.id, e.name, ...e.aliases].map((n) => n.toLowerCase()));
    adv.assertions = adv.assertions.map((a) => {
      if (a.subject === id) return { ...a, subject: YOU, ...(a.producer !== 'player' && a.kind !== 'state' && { seen: false }) };
      if (a.kind === 'state' && a.key === 'holder' && names.has(a.value.toLowerCase())) return { ...a, value: YOU };
      if (a.kind === 'relationship' && names.has(a.to.toLowerCase())) return { ...a, to: YOU };
      return a;
    });
    repointSecrets(adv, id, YOU);
    repointGates(adv, id);
    // The player is never in `present`.
    const s = adv.plot.scene;
    if (s) adv.plot = { ...adv.plot, scene: { ...s, present: s.present.filter((p) => !names.has(p.toLowerCase())) } };
    if (!adv.plot.thirdPerson?.name.trim()) adv.plot = { ...adv.plot, thirdPerson: { enabled: adv.plot.thirdPerson?.enabled ?? false, name: e.name } };
    adv.entities = adv.entities.filter((x) => x !== e);
  });
}

function placeEdits(mutate: (fn: (adv: Adventure) => void) => void) {
  return {
    /** Only between places; `undefined` makes it stand alone. */
    setPartOf: (placeId: string, parentId: string | undefined) =>
      mutate((adv) => {
        if (placeId === parentId) return;
        const set = ({ partOf: _p, ...e }: Entity): Entity => (parentId === undefined ? e : { ...e, partOf: parentId });
        adv.entities = adv.entities.map((e) => (e.id === placeId && e.kind === 'place' ? set(e) : e));
      }),
    /** A way between two places, read both ways; `via` is what it goes through. */
    link: async (a: string, b: string, via?: string) => {
      const { link } = await loadMemoryJobs();
      mutate((adv) => (adv.entities = link(adv.entities, a, b, via)));
    },
    unlink: async (a: string, b: string) => {
      const { unlink } = await loadMemoryJobs();
      mutate((adv) => (adv.entities = unlink(adv.entities, a, b)));
    },
  };
}

/**
 * The player's edits to `adv.entities`, through the session's `mutate`. Not session methods, so
 * this stays out of the start-up bundle: only the lazy entity drawer imports it.
 */
export function entityEdits(host: GameSession) {
  const mutate = (fn: (adv: Adventure) => void) => host.mutate((_, adv) => fn(adv));
  return {
    update: (id: string, p: Partial<Entity>) => mutate((adv) => patch(adv, id, p)),
    delete: (id: string) => {
      mutate((adv) => {
        const gone = adv.entities.find((e) => e.id === id);
        if (gone) repointScene(adv, id, gone.name);
        adv.entities = adv.entities.filter((e) => e.id !== id);
        adv.assertions = adv.assertions.filter((a) => a.subject !== id);
        repointGates(adv, id);
      });
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
    ...placeEdits(mutate),
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
      const { mergeEntities, mergeOwn, repointLinks } = await loadMemoryJobs();
      mutate((adv) => {
        const into = adv.entities.find((e) => e.id === intoId);
        const from = adv.entities.find((e) => e.id === fromId);
        if (!into || !from || into === from) return;
        const merged = mergeEntities(into, from);
        adv.entities = repointLinks(
          adv.entities.flatMap((e) => (e === from ? [] : e === into ? [merged] : [e])),
          fromId,
          intoId,
        );
        const own = (id: string) => adv.assertions.filter((a) => a.subject === id);
        adv.assertions = [...adv.assertions.filter((a) => a.subject !== intoId && a.subject !== fromId), ...mergeOwn(into, own(intoId), own(fromId))];
        repointGates(adv, fromId, intoId);
        repointScene(adv, fromId, intoId);
        repointSecrets(adv, fromId, intoId);
      });
    },
    mergeIntoYou: (id: string) => mergeIntoYou(host, id),
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
    await updateEntities(host.adv, { fromAction: Math.max(e.firstSeen, toAction - MEMORY_SPAN), toAction }, await host.helperModel('batch'));
    host.changed();
  } catch (err) {
    host.onError(`Could not update ${e.name}: ${message(err)}`);
  }
}
