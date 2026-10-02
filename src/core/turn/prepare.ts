import { buildContext, renderBody, type ContextBuildInput } from '../context';
import { rankMemories, touchUsed, type RankedMemory } from '../memory/memoryBank';
import type { Action, Adventure } from '../model/types';
import { actionText } from '../model/types';
import type { Embedder } from '../ports/embedder';
import { renderPrefix, renderTemplate } from '../text/templates';
import { runHook } from './hooks';
import type { PreparedContext, TurnDeps } from './types';

const STUMPED = 'Sorry, the AI is stumped. Edit/retry your previous action, or write something to help it along.';

function contextInput(adventure: Adventure, actions: Action[], rankedMemories: RankedMemory[], deps: TurnDeps, cacheStableLayout: boolean): ContextBuildInput {
  const memory = adventure.scriptState.memory ?? {};
  return {
    actions,
    plot: adventure.plot,
    storyCards: adventure.storyCards,
    rankedMemories,
    frontMemory: memory.frontMemory,
    overrides: { plotEssentials: memory.context, authorsNote: memory.authorsNote },
    settings: {
      contextLength: adventure.settings.model.contextLength,
      memoryBankEnabled: adventure.settings.memory.memoryBank,
      cacheStableLayout,
      evictionChunk: adventure.settings.context.evictionChunk,
    },
    tokenizer: deps.tokenizer,
  };
}

async function rankForQuery(adventure: Adventure, query: string, embedder?: Embedder): Promise<RankedMemory[]> {
  if (!adventure.settings.memory.memoryBank || adventure.memories.length === 0) return [];
  let queryVec: number[] | undefined;
  if (embedder && query) {
    try {
      queryVec = (await embedder.embed([query]))[0];
    } catch {
      queryVec = undefined; // embedding failure falls back to recency-only ranking
    }
  }
  return rankMemories(adventure.memories, queryVec);
}

/** Build the context for `actions` (the log as it stands) and render the prompt. */
export async function prepareContext(adventure: Adventure, actions: Action[], deps: TurnDeps): Promise<PreparedContext | { stopped: string }> {
  const last = actions.at(-1);
  const rankedMemories = await rankForQuery(adventure, last ? actionText(last) : '', deps.embedder);
  const result = buildContext(contextInput(adventure, actions, rankedMemories, deps, adventure.settings.context.cacheStableLayout));

  const fullText = `${result.system ? `${result.system}\n\n` : ''}${result.body}`;
  const hook = await runHook(adventure, deps, 'onModelContext', fullText, actions, {
    info: {
      characterNames: adventure.plot.thirdPerson?.enabled ? [adventure.plot.thirdPerson.name] : [],
      actionCount: actions.length,
      maxChars: Math.floor(adventure.settings.model.contextLength * 3.9),
      memoryLength: (adventure.plot.plotEssentials ?? '').length,
    },
    sections: result.sections,
  });
  let body = result.body;
  if (hook.error) {
    // Scripts that fail must not break play; surface the error and continue.
    console.warn('onModelContext script error:', hook.error);
  } else {
    if (hook.stop) return { stopped: STUMPED };
    if (hook.sections && hook.sections !== result.sections) body = renderBody(hook.sections);
    else if (hook.text && hook.text !== fullText) body = hook.text;
  }

  if (result.usedMemories.length) adventure.memories = touchUsed(adventure.memories, new Set(result.usedMemories.map((m) => m.id)));
  const rendered = renderTemplate(adventure.settings.template, result.system, body);
  return { result, prompt: rendered.prompt, stop: rendered.stop };
}

/**
 * The byte-stable prefix of the NEXT turn's prompt, for KV-cache warming: the context as if the
 * player had just taken a short action, keeping only the cacheable sections. Null when the layout
 * is not cache-stable (nothing worth warming beyond the system prompt).
 */
export async function buildWarmupPrompt(adventure: Adventure, actions: Action[], deps: TurnDeps): Promise<string | null> {
  if (!adventure.settings.context.cacheStableLayout) return null;
  const placeholder: Action = { id: 'warmup', type: 'do', versions: ['> You wait.'], active: 0, createdAt: Date.now() };
  // Memories are not part of the cached prefix.
  const result = buildContext(contextInput(adventure, [...actions, placeholder], [], deps, true));
  const prefix = result.sections
    .filter((sec) => sec.cacheable && sec.kind !== 'instructions')
    .map((sec) => sec.text)
    .join('\n\n');
  return prefix ? renderPrefix(adventure.settings.template, result.system, prefix) : null;
}
