import { budgetFor, familyOf, loadImagePrompt, SHEET_NEGATIVE, SHEET_SIZE, SHEET_WEIGHT, sheetPrompt } from '@core/image';
import { indexAssertions, nextQuestions, withLooks, type SheetKey } from '@core/memory';
import { newId, type Adventure } from '@core/model';
import type { ImageProvider, ImageRequest } from '@core/ports';
import { seedOf, trackJob } from '@core/trace';
import { imageQueue } from './imageQueue';
import { withProgress } from './imageProgress';
import { patch } from './lines';
import { dropPortrait, renderPortrait } from './portraits';
import { imageFailure } from './seeRender';
import type { GameSession } from './session';

/** A builder session for one character: answers are assertions already, so only the round and skips live here. */
export interface Draft {
  round: number;
  asked: SheetKey[];
  skipped: SheetKey[];
}

// Session memory, not persisted: a skip saved as "marks: none" would reach the image prompt.
const drafts = new Map<string, Draft>();

/** The character's draft, a first round if there is none. */
export function draftOf(host: GameSession, id: string): Draft {
  return drafts.get(id) ?? { round: 1, asked: nextQuestions(indexAssertions(host.adv.assertions).of(id), []), skipped: [] };
}

export const saveDraft = (id: string, d: Draft) => drafts.set(id, d);

/** The round after `d`, asked from the answers so far. */
export const nextRound = (host: GameSession, id: string, d: Draft): Draft => ({
  ...d,
  round: d.round + 1,
  asked: nextQuestions(indexAssertions(host.adv.assertions).of(id), d.skipped),
});

/** The latest round sheet: a blob only the open builder shows, and the prompt it was drawn from. */
export interface Sheet {
  imageId: string;
  prompt: string;
}
const sheets = new Map<string, Sheet>();
// Bumped on close, so a render that lands after it drops its blob instead of keeping it.
const opened = new Map<string, number>();

/** The round sheet's request: the stated keys only, at the layout's size for the checkpoint family, on the portrait seed. */
export function sheetRequest(adv: Adventure, id: string, skipped: readonly string[]): ImageRequest {
  const s = adv.settings.image;
  const family = familyOf(s.model, s.width, s.height);
  return {
    prompt: sheetPrompt(indexAssertions(adv.assertions).of(id), skipped, SHEET_WEIGHT[family], budgetFor(family)),
    negativePrompt: [SHEET_NEGATIVE, s.negativePrompt].filter(Boolean).join(', '),
    ...SHEET_SIZE[family],
    steps: s.sheetSteps,
    cfgScale: s.cfgScale,
    seed: seedOf(id),
    model: s.model,
    sampler: s.sampler,
    clipSkip: s.clipSkip,
    // No hires pass: a round sheet is a quick look, the final one (M16-4) takes the time.
  };
}

/**
 * Draw a round sheet for `id`; it replaces the last round's. `undefined` without an image server or
 * when the builder closed meanwhile. Throws the failure as the player reads it.
 */
export async function roundSheet(host: GameSession, id: string, skipped: readonly string[]): Promise<Sheet | undefined> {
  const pending = host.svc.imageProviderFor(host.app);
  if (!pending) return undefined;
  const req = sheetRequest(host.adv, id, skipped);
  const gen = opened.get(id) ?? 0;
  const blob = await render(await pending, req, host.svc.imageTimeoutMs);
  if ((opened.get(id) ?? 0) !== gen) return undefined;
  const sheet = { imageId: newId('img_'), prompt: req.prompt };
  await host.svc.storage.putImage(host.adv.id, sheet.imageId, blob);
  if ((opened.get(id) ?? 0) !== gen) {
    drop(host, sheet.imageId);
    return undefined;
  }
  const old = sheets.get(id);
  sheets.set(id, sheet);
  if (old) drop(host, old.imageId);
  return sheet;
}

/** The builder closed: its sheets go (answers are kept as assertions), and a render still running is dropped when it lands. */
export function closeSheets(host: GameSession, id: string): void {
  opened.set(id, (opened.get(id) ?? 0) + 1);
  const old = sheets.get(id);
  sheets.delete(id);
  if (old) drop(host, old.imageId);
}

/**
 * Done: one sheet at the adventure's steps with the hires pass, kept as `sheetImageId` (the old one
 * dropped); the look is frozen from it, so later Sees and the portrait repeat its words on its seed.
 * A drawn or missing portrait is drawn again; an uploaded one is kept. Throws as the player reads it;
 * a no-op without an image server.
 */
export async function finish(host: GameSession, id: string, skipped: readonly string[]): Promise<void> {
  const pending = host.svc.imageProviderFor(host.app);
  // The answers are saved already; without a server there is nothing to draw.
  if (!pending) return;
  const s = host.adv.settings.image;
  const req = { ...sheetRequest(host.adv, id, skipped), steps: s.steps, hires: { scale: s.hiresScale, denoise: s.hiresDenoise, steps: s.hiresSteps } };
  // The hires pass is a second render inside the same call, as in See.
  const blob = await render(await pending, req, host.svc.imageTimeoutMs * 2);
  const { looksOf } = await loadImagePrompt();
  const before = host.adv.entities.find((e) => e.id === id);
  if (!before) return;
  const sheetImageId = newId('img_');
  await host.svc.storage.putImage(host.adv.id, sheetImageId, blob);
  host.mutate((_, adv) => {
    const e = adv.entities.find((x) => x.id === id);
    if (e) patch(adv, id, { sheetImageId, look: looksOf(withLooks(e, indexAssertions(adv.assertions).of(id))) });
  });
  if (before.sheetImageId !== undefined) dropPortrait(host, before.sheetImageId);
  if (before.portraitId === undefined || before.portraitBasis !== undefined) await renderPortrait(host, id);
}

const render = (provider: ImageProvider, req: ImageRequest, ms: number): Promise<Blob> =>
  imageQueue
    .enqueue('sheet', () => withProgress('sheet', provider, () => trackJob('image', () => provider.txt2img(req, AbortSignal.timeout(ms)))))
    .catch((err: unknown) => {
      throw new Error(imageFailure(err, ms), { cause: err });
    });

const drop = (host: GameSession, imageId: string): void =>
  void host.svc.storage.deleteImage(host.adv.id, imageId).catch((e: unknown) => console.warn('could not delete a round sheet', e));
