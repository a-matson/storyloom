import type { MaintenanceDeps } from '@core/memory';
import type { Adventure } from '@core/model';
import type { CompletionRequest, Embedder, Provider } from '@core/ports';
import { makeAdventure } from './adventure';

/** A substring of the entity extraction prompt, to tell its calls from memory and summary calls. */
export const ENTITY_PROMPT = 'List every named character';

export function fakeProvider(complete: Provider['complete'], grammar = false, jsonSchema = false): Provider {
  return { id: 'fake', complete, capabilities: () => Promise.resolve({ grammar, jsonSchema }) } as unknown as Provider;
}

/** Answers every memory prompt with "sum:<first word of the passage>" and counts calls. */
export function fakeDeps(adv: Adventure, opts: { abortAfter?: number; cancelAfter?: number } = {}) {
  const calls: string[] = [];
  const ac = new AbortController();
  const cc = new AbortController();
  const provider = {
    id: 'fake',
    capabilities: () => Promise.resolve({ grammar: false }),
    async *complete(req: CompletionRequest, signal?: AbortSignal) {
      calls.push(req.prompt);
      if (calls.length === opts.abortAfter) ac.abort();
      if (calls.length === opts.cancelAfter) cc.abort();
      // The SSE reader ends quietly mid-reply when its signal fires.
      if (signal?.aborted) {
        yield { text: 'The ferryman' };
        return;
      }
      const passage = req.prompt.match(/EDITED|\w+/g)?.find((w) => w === 'EDITED') ?? 'text';
      yield { text: `sum:${passage}`, done: true };
    },
  } as unknown as Provider;
  const embedder: Embedder = { id: 'e', dimensions: 2, embed: (texts) => Promise.resolve(texts.map(() => [1, 0])) };
  const deps: MaintenanceDeps = { provider, embedder, template: adv.settings.template, signal: AbortSignal.any([ac.signal, cc.signal]), cancel: cc.signal };
  return { deps, calls };
}

/** A fixture adventure with the memory bank on, and auto-summary and introductions off. */
export function memoryAdventure(actions: number, bankSize = 200): Adventure {
  const adv = makeAdventure({ actions, cards: 0 });
  adv.settings.memory = { ...adv.settings.memory, memoryBank: true, autoSummary: false, introductions: false, bankSize };
  return adv;
}
