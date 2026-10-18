import type { Action, Adventure } from '../model/types';

type Image = NonNullable<Action['image']>;
type Candidate = NonNullable<Image['candidates']>[number];

/** Renders kept per See action while the player has not picked one; the oldest blob goes first. [provisional] */
const CAP = 8;

const candidate = ({ prompt, brief, entityIds, seed }: Image, imageId: string): Candidate => ({
  imageId,
  prompt,
  ...(brief !== undefined && { brief }),
  ...(entityIds && { entityIds }),
  ...(seed !== undefined && { seed }),
});

/** Every render the image holds, oldest first, the shown one included once. */
export function rendersOf(image: Image): Candidate[] {
  const list = image.candidates ?? [];
  const id = image.imageId;
  return id === undefined || list.some((c) => c.imageId === id) ? list : [...list, candidate(image, id)];
}

/** Every stored blob the image points at. */
export const blobIdsOf = (image: Image): string[] => rendersOf(image).map((c) => c.imageId);

/**
 * Every stored blob the adventure owns: See renders, portraits, builder sheets and the cover.
 * A `referenceImageId` owns nothing: it points at a See render and goes with it.
 */
export function ownedBlobIds(adv: Pick<Adventure, 'actions' | 'entities' | 'coverId'>): Set<string> {
  const ids = adv.actions.flatMap((a) => (a.image ? blobIdsOf(a.image) : []));
  for (const e of adv.entities) ids.push(...[e.portraitId, e.sheetImageId].filter((b) => b !== undefined));
  if (adv.coverId !== undefined) ids.push(adv.coverId);
  return new Set(ids);
}

/**
 * A render of `rendered` landed as `imageId` on an action now holding `current`: it becomes the shown one.
 * A first render stays a plain image; otherwise it joins the candidates and the oldest past the cap are dropped.
 */
export function withCandidate(current: Image, rendered: Image, imageId: string): { image: Image; dropped: string[] } {
  const { candidates: _c, missing: _m, ...shown } = rendered;
  const list = [...rendersOf(current), candidate(rendered, imageId)];
  return { image: { ...shown, imageId, ...(list.length > 1 && { candidates: list.slice(-CAP) }) }, dropped: list.slice(0, -CAP).map((c) => c.imageId) };
}

/** The player kept `imageId`: it becomes the plain image and every other candidate's blob is dropped. */
export function chosen(image: Image, imageId: string): { image: Image; dropped: string[] } | undefined {
  const pick = image.candidates?.find((c) => c.imageId === imageId);
  if (!pick) return undefined;
  const { candidates: _c, brief: _b, entityIds: _e, seed: _s, ...rest } = image;
  return { image: { ...rest, ...pick }, dropped: blobIdsOf(image).filter((id) => id !== imageId) };
}
