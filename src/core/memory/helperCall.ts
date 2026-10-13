import { hashPrompt, trackJob } from '../trace';
import type { JobKind } from '../model/types';
import type { CompletionChunk, CompletionStats, Provider } from '../ports/provider';
import { sentenceGrammar } from '../text/prompts';

/** Grammar for at most `max` sentences when the backend supports one; the trim and validator cover the rest. */
export async function sentencesOnly(provider: Provider, max: number): Promise<string | undefined> {
  return (await provider.capabilities()).grammar ? sentenceGrammar(max) : undefined;
}

/** Share of `maxTokens` after which typing no longer cuts a helper call: its work is worth more than the GPU it shares. [provisional] */
const CUT_BEFORE = 0.5;

/** One helper call as a live run reads it. */
export interface HelperCallLog {
  job: JobKind;
  cut: boolean;
  generatedTokens: number;
  /** The raw reply, so a live run can read what the helper wrote before any guard. */
  reply: string;
  ms: number;
  stopReason?: string | undefined;
  /** Hash of the rendered prompt: the same input read twice, or two inputs. */
  promptHash: string;
  /** Entity calls: trait facts the reply carried. */
  factsProposed?: number;
  /** Set by the caller after its guards: items kept, and values dropped with why. */
  accepted?: number;
  rejected?: { value: string; reason: string }[];
}

export interface CutCounts {
  /** Helper calls the player's typing cut; their partial reply is dropped. */
  cutCalls: number;
  /** Helper calls typed over past the half mark that ran to their end and were kept. */
  finishedPastCut: number;
  /** Every call, in order. */
  calls?: HelperCallLog[];
}

export interface CallDeps {
  /** The player started typing. */
  cancel?: AbortSignal | undefined;
  cuts?: CutCounts | undefined;
}

/**
 * Collects one helper call on slot 1. `cancel` aborts it only until it has streamed half its
 * `maxTokens`; past that it runs to its end so the memory lands. A cut call throws the abort.
 */
export function helperCall(
  job: JobKind,
  maxTokens: number,
  prompt: string,
  start: (signal: AbortSignal) => AsyncIterable<CompletionChunk>,
  { cancel, cuts }: CallDeps,
): Promise<{ text: string; stats?: CompletionStats | undefined }> {
  return trackJob(job, async () => {
    const call = new AbortController();
    const t0 = Date.now();
    const follow = () => call.abort(cancel?.reason);
    if (cancel?.aborted) follow();
    else cancel?.addEventListener('abort', follow, { once: true });
    let text = '';
    let stats: CompletionStats | undefined;
    let tokens = 0;
    try {
      for await (const c of start(call.signal)) {
        text += c.text;
        if (c.done) stats = c.stats;
        tokens = c.stats?.generatedTokens ?? tokens + 1;
        if (tokens >= maxTokens * CUT_BEFORE) cancel?.removeEventListener('abort', follow);
      }
    } catch (e) {
      // The provider's own abort error; a cut is reported below either way.
      if (!call.signal.aborted) throw e;
    } finally {
      cancel?.removeEventListener('abort', follow);
    }
    cuts?.calls?.push({
      job,
      cut: call.signal.aborted,
      generatedTokens: stats?.generatedTokens ?? tokens,
      reply: text,
      ms: Date.now() - t0,
      stopReason: stats?.stopReason,
      promptHash: hashPrompt(prompt),
    });
    if (call.signal.aborted) {
      if (cuts) cuts.cutCalls += 1;
      call.signal.throwIfAborted();
    }
    if (cancel?.aborted && cuts) cuts.finishedPastCut += 1;
    return { text, stats };
  });
}
