import { ownedBlobIds } from '@core/image';
import { forkAt } from '@core/log';
import { newId, type Adventure } from '@core/model';
import type { Storage } from '@core/ports';

/**
 * "Branch from here": the story up to and including `actionId` as a new adventure; resolves to its id.
 * Blobs are copied, not shared: images are keyed by owner, so a shared one would die with the original.
 */
export async function forkAdventure(storage: Storage, adv: Adventure, actionId: string): Promise<string> {
  const at = adv.actions.findIndex((a) => a.id === actionId);
  if (at < 0) throw new Error('That action is no longer in the story.');
  const fork = forkAt(adv, at + 1, newId('adv_'), Date.now());
  await storage.putAdventure(fork);
  for (const id of ownedBlobIds(fork)) {
    const blob = await storage.getImage(adv.id, id);
    if (blob) await storage.putImage(fork.id, id, blob);
  }
  return fork.id;
}
