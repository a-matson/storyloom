import type { Action, Adventure, StoryCard } from './types';
import { actionText } from './types';
import { ActionLog } from './actionLog';
import { buildContext, type ContextBuildResult, renderBody } from './contextBuilder';
import { formatPlayerInput, joinStory, trimUnfinishedSentence } from './formatting';
import { rankMemories, touchUsed, type RankedMemory } from './memoryBank';
import { renderTemplate } from './templates';
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
  | { type: 'context'; result: ContextBuildResult; prompt: string }
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
  prepared: PreparedContext,
  deps: TurnDeps,
  signal?: AbortSignal,
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
      seed: s.seed,
      stop: [...prepared.stop, '\n> '],
      cachePrompt: true,
      slotId: 0,
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
    yield { type: 'context', result: prepared.result, prompt: prepared.prompt };

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
    yield { type: 'context', result: prepared.result, prompt: prepared.prompt };
    const seeded: Adventure = { ...adventure, settings: { ...adventure.settings, model: { ...adventure.settings.model, seed: Math.floor(Math.random() * 2 ** 31) } } };
    const gen = generate(seeded, prepared, deps, signal);
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

/** Full story text of the active path (for export and summarisation). */
export function storyText(adventure: Adventure): string {
  return joinStory(adventure.actions);
}
