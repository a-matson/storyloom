import type { Action, Adventure, StoryCard } from './types';
import { actionText } from './types';
import { ActionLog } from './actionLog';
import { buildContext, type ContextBuildResult, renderBody } from './contextBuilder';
import { formatPlayerInput, joinStory, trimUnfinishedSentence } from './formatting';
import { rankMemories, touchUsed, type RankedMemory } from './memoryBank';
import { renderPrefix, renderTemplate } from './templates';
import type { Tokenizer } from './tokenizer';
import type { CompletionStats, Provider } from '@providers/types';
import type { Embedder } from '@embeddings/index';
import { NoopScriptRunner, toScriptCards, type ScriptRunner, type ScriptState, type ScriptStoryCard } from '@scripting/types';

/**
 * Turn orchestration: input → scripts → context → template → stream → scripts → log.
 *
 * `runTurn` is an async generator so the UI can stream tokens and show the
 * context that was actually sent. It mutates `log` (the adventure's action
 * log) and `adventure.scriptState` / `adventure.storyCards` / `adventure.memories`
 * as the hooks and retrieval demand; persisting the adventure is the caller's
 * job (the UI saves after every turn).
 */

export type PlayerTurnType = 'do' | 'say' | 'story';

export interface TurnDeps {
  provider: Provider;
  tokenizer: Tokenizer;
  scripts?: ScriptRunner;
  embedder?: Embedder;
}

export type TurnEvent =
  | { type: 'player'; action: Action }
  | { type: 'context'; result: ContextBuildResult; prompt: string; stop: string[] }
  | { type: 'token'; text: string }
  | { type: 'done'; action: Action; text: string; stats?: CompletionStats }
  | { type: 'stopped'; reason: string }
  | { type: 'message'; text: string }
  | { type: 'error'; message: string };

interface PreparedContext {
  result: ContextBuildResult;
  prompt: string;
  stop: string[];
}

function scriptCardsToCore(cards: ScriptStoryCard[], existing: StoryCard[]): StoryCard[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  return cards.map((c) => {
    const prev = byId.get(c.id);
    return {
      id: c.id,
      type: c.type,
      name: prev?.name ?? c.type,
      entry: c.entry,
      triggers: c.keys.split(',').filter((t) => t.length > 0),
      notes: prev?.notes,
      selectable: prev?.selectable,
    };
  });
}

async function rankForQuery(adventure: Adventure, query: string, embedder?: Embedder): Promise<RankedMemory[]> {
  if (!adventure.settings.memory.memoryBank || adventure.memories.length === 0) return [];
  let queryVec: number[] | undefined;
  if (embedder && query) {
    try {
      queryVec = (await embedder.embed([query]))[0];
    } catch {
      queryVec = undefined;
    }
  }
  return rankMemories(adventure.memories, queryVec);
}

/** Build the context for `actions` (the log as it stands) and render the prompt. */
export async function prepareContext(adventure: Adventure, actions: Action[], deps: TurnDeps): Promise<PreparedContext | { stopped: string }> {
  const scripts = deps.scripts ?? new NoopScriptRunner();
  const lastText = actions.length ? actionText(actions[actions.length - 1]!) : '';
  const rankedMemories = await rankForQuery(adventure, lastText, deps.embedder);
  const scriptMemory = (adventure.scriptState.memory ?? {}) as { context?: string; authorsNote?: string; frontMemory?: string };

  const result = buildContext({
    actions,
    plot: adventure.plot,
    storyCards: adventure.storyCards,
    rankedMemories,
    frontMemory: scriptMemory.frontMemory,
    overrides: { plotEssentials: scriptMemory.context, authorsNote: scriptMemory.authorsNote },
    settings: {
      contextLength: adventure.settings.model.contextLength,
      memoryBankEnabled: adventure.settings.memory.memoryBank,
      cacheStableLayout: adventure.settings.context.cacheStableLayout,
      evictionChunk: adventure.settings.context.evictionChunk,
    },
    tokenizer: deps.tokenizer,
  });

  let body = result.body;
  const hook = await scripts.run({
    hook: 'onModelContext',
    text: `${result.system ? `${result.system}\n\n` : ''}${body}`,
    history: actions.slice(-40).map((a) => ({ text: actionText(a), rawText: actionText(a), type: a.type })),
    storyCards: toScriptCards(adventure.storyCards),
    state: adventure.scriptState as ScriptState,
    info: {
      characterNames: adventure.plot.thirdPerson?.enabled ? [adventure.plot.thirdPerson.name] : [],
      actionCount: actions.length,
      maxChars: Math.floor(adventure.settings.model.contextLength * 3.9),
      memoryLength: (adventure.plot.plotEssentials ?? '').length,
    },
    sections: result.sections,
  });
  if (hook.error) {
    // Scripts that fail must not break play; surface the error and continue.
    // eslint-disable-next-line no-console
    console.warn('onModelContext script error:', hook.error);
  } else {
    adventure.scriptState = hook.state;
    adventure.storyCards = scriptCardsToCore(hook.storyCards, adventure.storyCards);
    if (hook.stop) return { stopped: 'Sorry, the AI is stumped. Edit/retry your previous action, or write something to help it along.' };
    if (hook.sections && hook.sections !== result.sections) body = renderBody(hook.sections);
    else if (hook.text && hook.text !== `${result.system ? `${result.system}\n\n` : ''}${result.body}`) body = hook.text;
  }

  if (result.usedMemories.length) {
    adventure.memories = touchUsed(adventure.memories, new Set(result.usedMemories.map((m) => m.id)));
  }

  const rendered = renderTemplate(adventure.settings.template, result.system, body);
  return { result, prompt: rendered.prompt, stop: rendered.stop };
}

async function* generate(
  adventure: Adventure,
  prepared: Pick<PreparedContext, 'prompt' | 'stop'>,
  deps: TurnDeps,
  signal?: AbortSignal,
  opts: { slotId?: number; seed?: number } = {},
): AsyncGenerator<TurnEvent, { text: string; stats?: CompletionStats }> {
  const s = adventure.settings.model;
  let text = '';
  let stats: CompletionStats | undefined;
  const stream = deps.provider.complete(
    {
      prompt: prepared.prompt,
      maxTokens: s.responseLength,
      temperature: s.temperature,
      topK: s.topK,
      topP: s.topP,
      minP: s.minP,
      presencePenalty: s.presencePenalty,
      frequencyPenalty: s.frequencyPenalty,
      repetitionPenalty: s.repetitionPenalty,
      seed: opts.seed ?? s.seed,
      stop: [...prepared.stop, '\n> '],
      cachePrompt: true,
      slotId: opts.slotId ?? 0,
    },
    signal,
  );
  for await (const chunk of stream) {
    if (chunk.text) {
      text += chunk.text;
      yield { type: 'token', text: chunk.text };
    }
    if (chunk.done) stats = chunk.stats;
  }
  const scripts = deps.scripts ?? new NoopScriptRunner();
  let out = adventure.settings.context.rawOutput ? text : trimUnfinishedSentence(text);
  const hook = await scripts.run({
    hook: 'onOutput',
    text: out,
    history: adventure.actions.slice(-40).map((a) => ({ text: actionText(a), rawText: actionText(a), type: a.type })),
    storyCards: toScriptCards(adventure.storyCards),
    state: adventure.scriptState as ScriptState,
    info: { characterNames: [], actionCount: adventure.actions.length },
  });
  if (!hook.error) {
    adventure.scriptState = hook.state;
    adventure.storyCards = scriptCardsToCore(hook.storyCards, adventure.storyCards);
    if (hook.text !== undefined) out = hook.text;
    if (hook.state.message) yield { type: 'message', text: String(hook.state.message) };
  }
  return { text: out, stats };
}

/**
 * Play one turn: optionally add a player action, then generate the AI's reply.
 * `input.type === 'continue'` skips the player action.
 */
export async function* runTurn(
  adventure: Adventure,
  log: ActionLog,
  input: { type: PlayerTurnType | 'continue'; text: string },
  deps: TurnDeps,
  signal?: AbortSignal,
): AsyncGenerator<TurnEvent> {
  const scripts = deps.scripts ?? new NoopScriptRunner();
  try {
    if (input.type !== 'continue') {
      const hook = await scripts.run({
        hook: 'onInput',
        text: input.text,
        history: log.actions.slice(-40).map((a) => ({ text: actionText(a), rawText: actionText(a), type: a.type })),
        storyCards: toScriptCards(adventure.storyCards),
        state: adventure.scriptState as ScriptState,
        info: { characterNames: [], actionCount: log.length },
      });
      let text = input.text;
      if (!hook.error) {
        adventure.scriptState = hook.state;
        adventure.storyCards = scriptCardsToCore(hook.storyCards, adventure.storyCards);
        if (hook.text !== undefined) text = hook.text;
        if (hook.stop) {
          yield { type: 'stopped', reason: 'Unable to run scenario scripts' };
          return;
        }
      }
      const formatted = formatPlayerInput(input.type, text, adventure.plot);
      const action = log.append(input.type, formatted);
      adventure.actions = log.actions;
      yield { type: 'player', action };
    }

    const prepared = await prepareContext(adventure, log.actions, deps);
    if ('stopped' in prepared) {
      yield { type: 'stopped', reason: prepared.stopped };
      return;
    }
    yield { type: 'context', result: prepared.result, prompt: prepared.prompt, stop: prepared.stop };

    const gen = generate(adventure, prepared, deps, signal);
    let next = await gen.next();
    while (!next.done) {
      yield next.value;
      next = await gen.next();
    }
    const { text, stats } = next.value;
    const action = log.append('continue', text, stats ? { stats } : {});
    adventure.actions = log.actions;
    yield { type: 'done', action, text, stats };
  } catch (e) {
    if (signal?.aborted) {
      yield { type: 'stopped', reason: 'cancelled' };
      return;
    }
    yield { type: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Retry: regenerate the last AI output as a new retry alternative, using the
 * log as it was before that output. Vary the seed so alternatives differ.
 */
export async function* retryLast(adventure: Adventure, log: ActionLog, deps: TurnDeps, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
  const last = log.last;
  if (!last || last.type !== 'continue') {
    yield { type: 'error', message: 'Nothing to retry: the last action is not an AI output.' };
    return;
  }
  try {
    const before = log.actions.slice(0, -1);
    const prepared = await prepareContext(adventure, before, deps);
    if ('stopped' in prepared) {
      yield { type: 'stopped', reason: prepared.stopped };
      return;
    }
    yield { type: 'context', result: prepared.result, prompt: prepared.prompt, stop: prepared.stop };
    const gen = generate(adventure, prepared, deps, signal, { seed: randomSeed() });
    let next = await gen.next();
    while (!next.done) {
      yield next.value;
      next = await gen.next();
    }
    const updated = log.addVersion(last.id, next.value.text)!;
    adventure.actions = log.actions;
    yield { type: 'done', action: updated, text: next.value.text, stats: next.value.stats };
  } catch (e) {
    if (signal?.aborted) {
      yield { type: 'stopped', reason: 'cancelled' };
      return;
    }
    yield { type: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Generate one more alternative for the prompt of the last turn without
 * touching the log (retry prefetch). Runs on `slotId` (default 1) so the
 * story slot's KV cache is left alone. The caller adds the result as a
 * version when the player actually presses Retry.
 */
export async function generateAlternative(
  adventure: Adventure,
  prepared: Pick<PreparedContext, 'prompt' | 'stop'>,
  deps: TurnDeps,
  signal?: AbortSignal,
  slotId = 1,
): Promise<{ text: string; stats?: CompletionStats }> {
  const gen = generate(adventure, prepared, deps, signal, { slotId, seed: randomSeed() });
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  return next.value;
}

/**
 * The byte-stable prefix of the NEXT turn's prompt, for KV-cache warming.
 * Builds the context as if the player had just taken a short action, then
 * keeps only the `cacheable` sections (system, plot essentials, history) and
 * renders them as an unterminated prompt. Returns null when the layout is not
 * cache-stable (nothing worth warming beyond the system prompt).
 */
export async function buildWarmupPrompt(adventure: Adventure, actions: Action[], deps: TurnDeps): Promise<string | null> {
  if (!adventure.settings.context.cacheStableLayout) return null;
  const placeholder: Action = { id: 'warmup', type: 'do', versions: ['> You wait.'], active: 0, createdAt: Date.now() };
  const rankedMemories: RankedMemory[] = []; // memories are not part of the cached prefix
  const scriptMemory = (adventure.scriptState.memory ?? {}) as { context?: string; authorsNote?: string; frontMemory?: string };
  const result = buildContext({
    actions: [...actions, placeholder],
    plot: adventure.plot,
    storyCards: adventure.storyCards,
    rankedMemories,
    frontMemory: scriptMemory.frontMemory,
    overrides: { plotEssentials: scriptMemory.context, authorsNote: scriptMemory.authorsNote },
    settings: {
      contextLength: adventure.settings.model.contextLength,
      memoryBankEnabled: adventure.settings.memory.memoryBank,
      cacheStableLayout: true,
      evictionChunk: adventure.settings.context.evictionChunk,
    },
    tokenizer: deps.tokenizer,
  });
  const prefix = result.sections
    .filter((sec) => sec.cacheable && sec.kind !== 'instructions')
    .map((sec) => sec.text)
    .join('\n\n');
  if (!prefix) return null;
  return renderPrefix(adventure.settings.template, result.system, prefix);
}

/** Full story text of the active path (for export and summarisation). */
export function storyText(adventure: Adventure): string {
  return joinStory(adventure.actions);
}
