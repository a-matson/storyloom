import { loadImagePrompt } from '@core/image';
import type { ActionLog } from '@core/log';
import { newId, type Action, type Adventure, type AppSettings, type TemplateId } from '@core/model';
import type { Provider } from '@core/ports';
import { trackJob } from '@core/trace';
import { imageQueue } from './imageQueue';
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

/**
 * See mode. The `see` action is appended at once so the caption is on screen while the
 * image server works; the blob lands in storage and `imageId` is patched in afterwards.
 * Image generation never blocks a turn: `busy` stays false and the story stays playable.
 */
export function seeImage(prompt: string, host: SeeHost): void {
  const text = prompt.trim();
  if (text === '') return void auto(host);
  start(host, text);
}

/** A blank prompt: the helper model writes one from the story so far, then that image is generated. */
async function auto(host: SeeHost): Promise<void> {
  try {
    const { autoImagePrompt } = await loadImagePrompt();
    const req = { actions: host.log.actions, plotEssentials: host.adv.plot.plotEssentials };
    start(host, await autoImagePrompt(req, await host.helperModel()));
  } catch (e) {
    host.onError(`Could not write an image prompt: ${message(e)}`);
  }
}

/**
 * Retry (no `prompt`) or edit the prompt of a `see` action: the old blob is dropped and a new
 * image generated into the same action. No seed is sent, so the same prompt still yields a new
 * picture. No new version either — the caption is the action's text and the image is a patch.
 */
export function regenerateImage(host: SeeHost, actionId: string, prompt?: string): void {
  const old = host.log.actions.find((a) => a.id === actionId)?.image;
  if (!old) return;
  const { imageId, missing: _wasImported, ...rest } = old;
  const image: Image = { ...rest, ...(prompt !== undefined && { prompt: prompt.trim() }) };
  if (image.prompt === '') return;
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

function start(host: SeeHost, prompt: string): void {
  const model = host.adv.settings.image.model;
  const image: Image = { prompt, ...(model !== undefined && { model }) };
  const action = host.log.append('see', '', { image });
  host.changed();
  void generate(host, action.id, image);
}

async function generate(host: SeeHost, actionId: string, image: Image): Promise<void> {
  const pending = host.svc.imageProviderFor(host.app);
  if (!pending) return host.onError('No image server is configured; add one in Settings.');
  const s = host.adv.settings.image;
  const ms = host.svc.imageTimeoutMs;
  host.imagePending(actionId, true);
  try {
    const provider = await pending;
    const req = {
      prompt: image.prompt,
      width: s.width,
      height: s.height,
      steps: s.steps,
      cfgScale: s.cfgScale,
      negativePrompt: s.negativePrompt,
      model: s.model,
    };
    const blob = await imageQueue.enqueue('see', () => trackJob('image', () => provider.txt2img(req, AbortSignal.timeout(ms))));
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
