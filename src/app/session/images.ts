import { chosen, familyOf, loadImagePrompt, ownedBlobIds, rendersOf } from '@core/image';
import { heldBy, indexAssertions, sceneNames, withLooks } from '@core/memory';
import type { Entity } from '@core/model';
import { storyModel } from './helperModel';
import { styleOf } from './portraitPrompt';
import { drop, generate, message, type Image, type SeeHost } from './seeRender';

/** `/raw <prompt>` sends the text as it is, skipping composition. */
const RAW = /^\/raw\s+/i;
/** `/plain <brief>` composes the brief without reading the last passage. */
const PLAIN = /^\/plain\s+/i;

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

async function composed(host: SeeHost, input: string): Promise<Composed | undefined> {
  const brief = input.replace(PLAIN, '');
  try {
    const { seePrompt } = await loadImagePrompt();
    const { adv } = host;
    const ix = indexAssertions(adv.assertions);
    // The last state read covered the last story action and the player line before it.
    const from = host.log.actions.findLastIndex((a) => a.type !== 'see') - 1;
    const holds = (e: Entity) => (e.kind === 'character' ? heldBy(adv.entities, ix, e.name).map((i) => i.id) : []);
    const req = {
      brief,
      actions: host.log.actions,
      plotEssentials: adv.plot.plotEssentials,
      scene: adv.plot.scene && sceneNames(adv.plot.scene, adv.entities),
      entities: adv.entities.map((e) => ({ ...withLooks(e, ix.of(e.id), from), holds: holds(e) })),
      style: styleOf(adv.settings.image, adv.tags),
      family: familyOf(adv.settings.image.model, adv.settings.image.width, adv.settings.image.height),
      readsStory: !PLAIN.test(input),
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
 * Blobs the edit left without an owner: an erased See, a deleted, merged or unborn entity's portrait and sheet.
 * An erase frees them at once; a See's prompt stays, so Retry can regenerate.
 * Runs after the edit was published (this module loads lazily), so a cleared reference publishes again.
 */
export function dropOrphanImages(host: SeeHost, beforeOwned: Set<string>): void {
  const owned = ownedBlobIds({ ...host.adv, actions: host.log.actions });
  const orphans = [...beforeOwned].filter((id) => !owned.has(id));
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
