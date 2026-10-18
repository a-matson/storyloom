import { blobIdsOf, chosen, familyOf, loadImagePrompt, rendersOf } from '@core/image';
import { indexAssertions, sceneNames, withLooks } from '@core/memory';
import type { Action } from '@core/model';
import { storyModel } from './helperModel';
import { portraitStyle } from './portraitPrompt';
import { drop, generate, message, type Image, type SeeHost } from './seeRender';

/** `/raw <prompt>` sends the text as it is, skipping composition. */
const RAW = /^\/raw\s+/i;

/**
 * See mode. The input is a brief; `seePrompt` composes the prompt from it, the scene and the cast's
 * looks (a blank or implicit brief asks the helper model first). The `see` action is appended as soon
 * as the prompt exists, so the caption is on screen while the image server works; the blob lands in
 * storage and `imageId` is patched in afterwards. Image generation never blocks a turn.
 */
export function seeImage(input: string, host: SeeHost): void {
  const text = input.trim();
  if (RAW.test(text)) return void (text.replace(RAW, '') && start(host, { prompt: text.replace(RAW, '') }));
  void composed(host, text).then((c) => c && start(host, c));
}

type Composed = Pick<Image, 'brief' | 'prompt' | 'entityIds' | 'seed'>;

async function composed(host: SeeHost, brief: string): Promise<Composed | undefined> {
  try {
    const { seePrompt } = await loadImagePrompt();
    const { adv } = host;
    const ix = indexAssertions(adv.assertions);
    const req = {
      brief,
      actions: host.log.actions,
      plotEssentials: adv.plot.plotEssentials,
      scene: adv.plot.scene && sceneNames(adv.plot.scene, adv.entities),
      entities: adv.entities.map((e) => withLooks(e, ix.of(e.id))),
      style: adv.settings.image.portraitStyle ?? portraitStyle(adv.tags),
      family: familyOf(adv.settings.image.model, adv.settings.image.width, adv.settings.image.height),
    };
    const { prompt, entityIds, seed } = await seePrompt(req, async () => storyModel(host));
    return { ...(brief !== '' && { brief }), prompt, ...(entityIds.length > 0 && { entityIds }), ...(seed !== undefined && { seed }) };
  } catch (e) {
    host.onError(`Could not write an image prompt: ${message(e)}`);
    return undefined;
  }
}

/**
 * Retry (no `brief`) or rewrite the brief of a `see` action, which composes a new prompt: the old render
 * stays as a candidate until the player keeps one, and a new image is generated into the same action.
 * No seed is sent, so the same prompt still yields a new picture. No new version either — the caption
 * is the action's text and the image is a patch.
 */
export function regenerateImage(host: SeeHost, actionId: string, brief?: string): void {
  if (brief === undefined) return redo(host, actionId, ({ seed: _s, ...i }) => i);
  const text = brief.trim();
  if (RAW.test(text)) return editSeePrompt(host, actionId, text.replace(RAW, ''));
  if (text === '') return;
  void composed(host, text).then((c) => c && redo(host, actionId, ({ brief: _b, entityIds: _e, seed: _s, ...i }) => ({ ...i, ...c })));
}

/** The prompt itself, edited raw: sent as written, and the caption shows it, since no brief describes it any more. */
function editSeePrompt(host: SeeHost, actionId: string, prompt: string): void {
  const text = prompt.trim();
  if (text !== '') redo(host, actionId, ({ brief: _b, ...i }) => ({ ...i, prompt: text }));
}

function redo(host: SeeHost, actionId: string, next: (old: Image) => Image): void {
  const old = host.log.actions.find((a) => a.id === actionId)?.image;
  if (!old) return;
  const { imageId: _i, missing: _wasImported, candidates: _c, ...rest } = old;
  const kept = rendersOf(old);
  const image = { ...next(rest), ...(kept.length > 0 && { candidates: kept }) };
  host.log.patch(actionId, { image });
  host.changed();
  void generate(host, actionId, image);
}

/** The player kept one render of a See: it becomes the action's image and the other blobs are deleted. */
export function chooseSeeCandidate(host: SeeHost, actionId: string, imageId: string): void {
  const image = host.log.actions.find((a) => a.id === actionId)?.image;
  const pick = image && chosen(image, imageId);
  if (!pick) return;
  host.log.patch(actionId, { image: pick.image });
  for (const id of pick.dropped) drop(host, id);
  host.changed();
}

/**
 * Blobs of `see` actions the log no longer holds. An erase frees them at once; the prompt stays, so Retry can regenerate.
 * Runs after the edit was published (this module loads lazily), so a cleared reference publishes again.
 */
export function dropOrphanImages(host: SeeHost, before: Action[]): void {
  const kept = new Set(host.log.actions.map((a) => a.id));
  const orphans = before.flatMap((a) => (a.image && !kept.has(a.id) ? blobIdsOf(a.image) : []));
  for (const id of orphans) drop(host, id);
  if (orphans.length > 0) host.changed();
}

function start(host: SeeHost, c: Composed): void {
  const model = host.adv.settings.image.model;
  const image: Image = { ...c, ...(model !== undefined && { model }) };
  const action = host.log.append('see', '', { image });
  host.changed();
  void generate(host, action.id, image);
}
