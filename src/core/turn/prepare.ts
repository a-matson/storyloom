import { applyScriptSections, buildContext, renderBody, type ContextBuildInput, type ContextBuildResult, type ScriptCache } from '../context';
import { bm25, buildIndex, tokenise } from '../memory/lexical';
import { isActive, rankMemories, touchUsed, type RankedMemory } from '../memory/memoryBank';
import type { Action, Adventure } from '../model/types';
import { actionText } from '../model/types';
import type { Embedder } from '../ports/embedder';
import type { HookResult } from '../ports/scripting';
import { renderPrefix, renderTemplate } from '../text/templates';
import type { Tokenizer } from '../text/tokenizer';
import { runHook } from './hooks';
import type { PreparedContext, TurnDeps } from './types';

const STUMPED = 'Sorry, the AI is stumped. Edit/retry your previous action, or write something to help it along.';

/** The prompt budget: the setting, clamped so prompt + response fit the provider's slot when it reports one. */
function promptBudget(adventure: Adventure, { contextSize }: TurnDeps): number {
  const { contextLength, responseLength } = adventure.settings.model;
  return contextSize === undefined ? contextLength : Math.max(0, Math.min(contextLength, contextSize - responseLength));
}

function contextInput(adventure: Adventure, actions: Action[], rankedMemories: RankedMemory[], deps: TurnDeps, cacheStableLayout: boolean): ContextBuildInput {
  const memory = adventure.scriptState.memory ?? {};
  return {
    actions,
    plot: adventure.plot,
    storyCards: adventure.storyCards,
    entities: adventure.entities,
    rankedMemories,
    frontMemory: memory.frontMemory,
    overrides: { plotEssentials: memory.context, authorsNote: memory.authorsNote },
    settings: {
      contextLength: promptBudget(adventure, deps),
      memoryBankEnabled: adventure.settings.memory.memoryBank,
      cacheStableLayout,
      evictionChunk: adventure.settings.context.evictionChunk,
      pinnedFactsOnly: !adventure.settings.memory.entityFacts,
    },
    tokenizer: deps.tokenizer,
  };
}

/** Rebuilds after exact counts arrive; capped because trims and a grown window add new texts. [provisional] */
const EXACT_ROUNDS = 3;

/** Build, then rebuild while the tokenizer swaps estimates for exact counts. */
async function buildExact(input: ContextBuildInput): Promise<ContextBuildResult> {
  let result = buildContext(input);
  for (let i = 0; i < EXACT_ROUNDS && (await input.tokenizer.resolve?.()); i++) result = buildContext(input);
  return result;
}

interface Retrieval {
  rankedMemories: RankedMemory[];
  factHits: string[];
}

/** One BM25 index over the active bank and every entity fact, so both rank against one corpus and one query. */
async function rankForQuery(adventure: Adventure, query: string, embedder?: Embedder): Promise<Retrieval> {
  const bank = adventure.settings.memory.memoryBank ? adventure.memories.filter(isActive) : [];
  const facts = adventure.entities.flatMap((e) => e.facts.map((f) => ({ id: f.id, text: `${e.name}: ${f.text}` })));
  const hits = bm25(buildIndex([...bank, ...facts]), tokenise(query));
  if (!bank.length) return { rankedMemories: [], factHits: hits };
  let queryVec: number[] | undefined;
  if (embedder && query) {
    try {
      queryVec = (await embedder.embed([query]))[0];
    } catch {
      queryVec = undefined; // embedding failure falls back to recency-only ranking
    }
  }
  return { rankedMemories: rankMemories(adventure.memories, queryVec, Infinity, hits), factHits: hits };
}

const withoutSystem = (text: string, system: string): string => (system && text.startsWith(`${system}\n\n`) ? text.slice(system.length + 2) : text);

/**
 * What onModelContext did to the prompt. A returned `text` replaces the whole body (and so the
 * cached prefix); edits to `sections` are merged back, and only a change inside the prefix breaks
 * the cache. Edited sections are not re-budgeted — the trace warns instead. [provisional]
 */
function applyHook(result: ContextBuildResult, hook: HookResult, fullText: string, tokenizer: Tokenizer): { body: string; cache: ScriptCache } {
  // The hook is given system + body as one text, so a script that returns it whole (edited at
  // either end) would otherwise repeat the instructions inside the user turn.
  if (hook.text && hook.text !== fullText) return { body: withoutSystem(hook.text, result.system), cache: 'rewritten' };
  if (!hook.sections) return { body: result.body, cache: 'kept' };
  const applied = applyScriptSections(hook.sections, result.sections, tokenizer);
  if ('error' in applied) {
    console.warn('onModelContext script error:', applied.error);
    return { body: result.body, cache: 'kept' };
  }
  result.sections = applied.sections;
  const used = applied.sections.reduce((n, s) => n + s.tokens, 0);
  result.budget.used = used;
  result.budget.free = Math.max(0, result.budget.total - used);
  if (used > result.budget.total) result.warnings.push(`a script put the prompt over budget by ${used - result.budget.total} tokens`);
  return { body: renderBody(applied.sections), cache: applied.cache };
}

/** Build the context for `actions` (the log as it stands) and render the prompt. */
export async function prepareContext(
  adventure: Adventure,
  actions: Action[],
  deps: TurnDeps,
  scriptLogs?: string[],
  retryNote?: string,
): Promise<PreparedContext | { stopped: string }> {
  const last = actions.at(-1);
  const { rankedMemories, factHits } = await rankForQuery(adventure, last ? actionText(last) : '', deps.embedder);
  const result = await buildExact({
    ...contextInput(adventure, actions, rankedMemories, deps, adventure.settings.context.cacheStableLayout),
    factHits,
    retryNote,
  });

  const fullText = `${result.system ? `${result.system}\n\n` : ''}${result.body}`;
  const hook = await runHook(
    adventure,
    deps,
    'onModelContext',
    fullText,
    actions,
    {
      info: {
        characterNames: adventure.plot.thirdPerson?.enabled ? [adventure.plot.thirdPerson.name] : [],
        actionCount: actions.length,
        maxChars: Math.floor(result.budget.total * 3.9),
        memoryLength: (adventure.plot.plotEssentials ?? '').length,
      },
      sections: result.sections,
    },
    scriptLogs,
  );
  if (hook.error) {
    // Scripts that fail must not break play; surface the error and continue.
    console.warn('onModelContext script error:', hook.error);
  } else if (hook.stop) return { stopped: STUMPED };
  const { body, cache } = hook.error ? { body: result.body, cache: 'kept' as const } : applyHook(result, hook, fullText, deps.tokenizer);

  if (result.usedMemories.length) adventure.memories = touchUsed(adventure.memories, new Set(result.usedMemories.map((m) => m.id)));
  const rendered = renderTemplate(adventure.settings.template, result.system, body);
  return { result, prompt: rendered.prompt, stop: rendered.stop, scriptCache: cache };
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
  // Same counts as the real build, so the history window (and so the prefix bytes) match.
  const result = await buildExact(contextInput(adventure, [...actions, placeholder], [], deps, true));
  const prefix = result.sections
    .filter((sec) => sec.cacheable && sec.kind !== 'instructions')
    .map((sec) => sec.text)
    .join('\n\n');
  return prefix ? renderPrefix(adventure.settings.template, result.system, prefix) : null;
}
