import { imageRequest, loadImagePrompt } from '@core/image';
import type { ActionLog } from '@core/log';
import { newId, type Action, type Adventure, type AppSettings, type TemplateId } from '@core/model';
import type { Provider } from '@core/ports';
import { trackJob } from '@core/trace';
import { imageQueue } from './imageQueue';
import { withProgress } from './imageProgress';
import { portraitStyle } from './portraitPrompt';
import type { SessionServices } from './types';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Image = NonNullable<Action['image']>;

/** A bare "signal timed out" would not say what timed out, so the timeout names itself. */
export const imageFailure = (e: unknown, timeoutMs: number): string =>
  e instanceof Error && e.name === 'TimeoutError' ? `the image server did not answer in ${Math.round(timeoutMs / 1000)} s` : message(e);

export interface SeeHost {
  adv: Adventure;
  log: ActionLog;
  app: AppSettings;
  svc: SessionServices;
  /** Utility model when one is configured and healthy, else the story model. */
  helperModel: () => Promise<{ provider: Provider; template: TemplateId }>;
  /** The log changed: publish a snapshot and save. */
  changed: () => void;
  /** A txt2img for this action started or ended; the snapshot's `pendingImages` follows. */
  imagePending: (actionId: string, running: boolean) => void;
  onError: (message: string) => void;
}

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

type Composed = Pick<Image, 'brief' | 'prompt' | 'entityIds'>;

async function composed(host: SeeHost, brief: string): Promise<Composed | undefined> {
  try {
    const { seePrompt } = await loadImagePrompt();
    const { adv } = host;
    const req = {
      brief,
      actions: host.log.actions,
      plotEssentials: adv.plot.plotEssentials,
      scene: adv.plot.scene,
      entities: adv.entities,
      style: adv.settings.image.portraitStyle ?? portraitStyle(adv.tags),
    };
    const { prompt, entityIds } = await seePrompt(req, host.helperModel);
    return { ...(brief !== '' && { brief }), prompt, ...(entityIds.length > 0 && { entityIds }) };
  } catch (e) {
    host.onError(`Could not write an image prompt: ${message(e)}`);
    return undefined;
  }
}

/**
 * Retry (no `brief`) or rewrite the brief of a `see` action, which composes a new prompt: the old blob
 * is dropped and a new image generated into the same action. No seed is sent, so the same prompt still
 * yields a new picture. No new version either — the caption is the action's text and the image is a patch.
 */
export function regenerateImage(host: SeeHost, actionId: string, brief?: string): void {
  if (brief === undefined) return redo(host, actionId, (i) => i);
  const text = brief.trim();
  if (RAW.test(text)) return editSeePrompt(host, actionId, text.replace(RAW, ''));
  if (text === '') return;
  void composed(host, text).then((c) => c && redo(host, actionId, ({ brief: _b, entityIds: _e, ...i }) => ({ ...i, ...c })));
}

/** The prompt itself, edited raw: sent as written, and the caption shows it, since no brief describes it any more. */
function editSeePrompt(host: SeeHost, actionId: string, prompt: string): void {
  const text = prompt.trim();
  if (text !== '') redo(host, actionId, ({ brief: _b, ...i }) => ({ ...i, prompt: text }));
}

function redo(host: SeeHost, actionId: string, next: (old: Image) => Image): void {
  const old = host.log.actions.find((a) => a.id === actionId)?.image;
  if (!old) return;
  const { imageId, missing: _wasImported, ...rest } = old;
  const image = next(rest);
  if (imageId !== undefined) drop(host, imageId);
  host.log.patch(actionId, { image });
  host.changed();
  void generate(host, actionId, image);
}

/** Blobs of `see` actions the log no longer holds. An erase frees them at once; the prompt stays, so Retry can regenerate. */
export function dropOrphanImages(host: SeeHost, before: Action[]): void {
  const kept = new Set(host.log.actions.map((a) => a.id));
  for (const a of before) if (a.image?.imageId !== undefined && !kept.has(a.id)) drop(host, a.image.imageId);
}

const drop = (host: SeeHost, imageId: string): void =>
  void host.svc.storage.deleteImage(host.adv.id, imageId).catch((e: unknown) => console.warn('could not delete the stored image', e));

function start(host: SeeHost, c: Composed): void {
  const model = host.adv.settings.image.model;
  const image: Image = { ...c, ...(model !== undefined && { model }) };
  const action = host.log.append('see', '', { image });
  host.changed();
  void generate(host, action.id, image);
}

async function generate(host: SeeHost, actionId: string, image: Image): Promise<void> {
  const pending = host.svc.imageProviderFor(host.app);
  if (!pending) return host.onError('No image server is configured; add one in Settings.');
  const s = host.adv.settings.image;
  // The hires pass is a second render inside the same call. [provisional]
  // ponytail: a flat 2x, not scale² × denoise; measure at M11-4b's live pair and size it then.
  const ms = host.svc.imageTimeoutMs * (s.hires ? 2 : 1);
  host.imagePending(actionId, true);
  try {
    const provider = await pending;
    const req = imageRequest(s, image.prompt);
    const blob = await imageQueue.enqueue('see', () =>
      withProgress('see', provider, () => trackJob('image', () => provider.txt2img(req, AbortSignal.timeout(ms)))),
    );
    // An erase during those seconds already ran dropOrphanImages; storing now would leak a blob no action owns.
    if (!host.log.actions.some((a) => a.id === actionId)) return;
    const imageId = newId('img_');
    await host.svc.storage.putImage(host.adv.id, imageId, blob);
    host.log.patch(actionId, { image: { ...image, imageId } });
    host.changed();
  } catch (e) {
    // The caption and the prompt stay; the block shows its failed state with Retry.
    host.onError(`Could not generate the image: ${imageFailure(e, ms)}`);
  } finally {
    host.imagePending(actionId, false);
  }
}
