import { imageRequest, withCandidate } from '@core/image';
import type { ActionLog } from '@core/log';
import { newId, type Action, type Adventure, type AppSettings, type Entity } from '@core/model';
import { trackJob } from '@core/trace';
import { imageQueue } from './imageQueue';
import { withProgress } from './imageProgress';
import type { SessionServices } from './types';

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export type Image = NonNullable<Action['image']>;

/** A bare "signal timed out" would not say what timed out, so the timeout names itself. */
export const imageFailure = (e: unknown, timeoutMs: number): string =>
  e instanceof Error && e.name === 'TimeoutError' ? `the image server did not answer in ${Math.round(timeoutMs / 1000)} s` : message(e);

export interface SeeHost {
  adv: Adventure;
  log: ActionLog;
  app: AppSettings;
  svc: SessionServices;
  /** The log changed: publish a snapshot and save. */
  changed: () => void;
  /** A txt2img for this action started or ended; the snapshot's `pendingImages` follows. */
  imagePending: (actionId: string, running: boolean) => void;
  onError: (message: string) => void;
}

export const withoutReference = ({ referenceImageId: _r, ...e }: Entity): Entity => e;

/** A reference pointing at the dropped blob goes with it; the frozen look stays. */
export function drop(host: SeeHost, imageId: string): void {
  host.adv.entities = host.adv.entities.map((e) => (e.referenceImageId === imageId ? withoutReference(e) : e));
  void host.svc.storage.deleteImage(host.adv.id, imageId).catch((e: unknown) => console.warn('could not delete the stored image', e));
}

export async function generate(host: SeeHost, actionId: string, image: Image): Promise<void> {
  const pending = host.svc.imageProviderFor(host.app);
  if (!pending) return host.onError('No image server is configured; add one in Settings.');
  const s = host.adv.settings.image;
  // The hires pass is a second render inside the same call. [provisional]
  // ponytail: a flat 2x, not scale² × denoise; measure at M11-4b's live pair and size it then.
  const ms = host.svc.imageTimeoutMs * (s.hires ? 2 : 1);
  host.imagePending(actionId, true);
  try {
    const provider = await pending;
    const req = { ...imageRequest(s, image.prompt), ...(image.seed !== undefined && { seed: image.seed }) };
    const blob = await imageQueue.enqueue('see', () =>
      withProgress('see', provider, () => trackJob('image', () => provider.txt2img(req, AbortSignal.timeout(ms)))),
    );
    // An erase during those seconds already ran dropOrphanImages; storing now would leak a blob no action owns.
    const imageOf = () => host.log.actions.find((a) => a.id === actionId)?.image;
    if (!imageOf()) return;
    const imageId = newId('img_');
    await host.svc.storage.putImage(host.adv.id, imageId, blob);
    // Read the action again, not the captured copy: another render or a pick may have landed meanwhile.
    const current = imageOf();
    if (!current) return drop(host, imageId);
    const landed = withCandidate(current, image, imageId);
    host.log.patch(actionId, { image: landed.image });
    for (const id of landed.dropped) drop(host, id);
    host.changed();
  } catch (e) {
    // The caption and the prompt stay; the block shows its failed state with Retry.
    host.onError(`Could not generate the image: ${imageFailure(e, ms)}`);
  } finally {
    host.imagePending(actionId, false);
  }
}
