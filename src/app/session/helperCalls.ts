import type { HelperCallLog } from '@core/memory';
import type { Adventure } from '@core/model';
import { HELPER_REPLY_CAP } from '@core/schema';
import type { Storage } from '@core/ports';

/** Stores each call for the trace drawer; diagnostics never block play, so a failed write only warns. */
export function recordHelperCalls(storage: Storage, adv: Adventure, calls: readonly HelperCallLog[], model: string | undefined): void {
  for (const c of calls) {
    void storage
      .putHelperCall({
        id: crypto.randomUUID(),
        adventureId: adv.id,
        createdAt: Date.now(),
        actionCount: adv.actions.length,
        job: c.job,
        ...(model !== undefined && { model }),
        ms: c.ms,
        promptHash: c.promptHash,
        generatedTokens: c.generatedTokens,
        ...(c.promptMs !== undefined && { promptMs: c.promptMs }),
        ...(c.cachedTokens !== undefined && { cachedTokens: c.cachedTokens }),
        ...(c.stopReason !== undefined && { stopReason: c.stopReason }),
        cut: c.cut,
        reply: c.reply.slice(0, HELPER_REPLY_CAP),
        accepted: c.accepted ?? 0,
        rejected: c.rejected ?? [],
      })
      .catch((e: unknown) => console.warn('could not store helper call', e));
  }
}
