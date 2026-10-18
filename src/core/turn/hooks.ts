import type { Action, Adventure, StoryCard } from '../model/types';
import { identityText, indexAssertions, isCurrent, textOf } from '../memory/assertionIndex';
import { currentStates } from '../memory/looks';
import { sceneNames } from '../memory/names';
import { YOU } from '../memory/you';
import { actionText } from '../model/types';
import {
  NoopScriptRunner,
  toScriptCards,
  type HookInput,
  type HookName,
  type HookResult,
  type ScriptEntity,
  type ScriptEvent,
  type ScriptScene,
  type ScriptStoryCard,
} from '../ports/scripting';
import type { TurnDeps } from './types';

/** How many of the latest events `state.events` holds. [provisional] */
export const SCRIPT_EVENTS = 20;

function toScriptScene({ plot, entities }: Pick<Adventure, 'plot' | 'entities'>): ScriptScene | undefined {
  if (!plot.scene) return undefined;
  const { location, zone, present, groups, time } = sceneNames(plot.scene, entities);
  return { location, zone, present, groups: (groups ?? []).map((g) => ({ name: g.id, count: g.count })), time };
}

function toScriptEvents({ assertions, entities }: Pick<Adventure, 'assertions' | 'entities'>): ScriptEvent[] {
  const name = new Map(entities.flatMap((e) => (e.id === YOU ? [] : [[e.id, e.name] as const])));
  return assertions
    .flatMap((a) => (a.kind === 'event' ? [{ at: a.at, text: a.text, who: a.who.map((w) => name.get(w) ?? w) }] : []))
    .toSorted((a, b) => a.at - b.at)
    .slice(-SCRIPT_EVENTS);
}

/** What scripts see of the entities. `facts`: the current traits, effects, relationships and conflicts; `state`: the current values. */
function toScriptEntities({ entities, assertions }: Pick<Adventure, 'entities' | 'assertions'>): ScriptEntity[] {
  const ix = indexAssertions(assertions);
  return entities.map((e) => {
    const as = ix.of(e.id);
    return {
      id: e.id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      description: identityText(e, as),
      facts: as.flatMap((a) => (isCurrent(a) && a.kind !== 'identity' && a.kind !== 'state' && a.kind !== 'look' ? [textOf(a)] : [])),
      state: currentStates(as),
    };
  });
}

function scriptCardsToCore(cards: ScriptStoryCard[], existing: StoryCard[]): StoryCard[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  return cards.map((c) => {
    const prev = byId.get(c.id);
    return {
      id: c.id,
      type: c.type,
      name: c.title === '' ? (prev?.name ?? c.type) : c.title,
      entry: c.entry,
      triggers: c.keys.split(',').filter((t) => t.length > 0),
      notes: c.description === '' ? prev?.notes : c.description,
      selectable: prev?.selectable,
    };
  });
}

/**
 * Run one script hook over the adventure. On success the hook's state and story cards
 * are written back to `adventure`; on error nothing changes (scripts must never break play).
 * `collect` gathers the hook's `log()` lines and its error for the turn's trace.
 */
export async function runHook(
  adventure: Adventure,
  deps: TurnDeps,
  hook: HookName,
  text: string,
  history: Action[],
  extra: Pick<HookInput, 'info'> & Partial<Pick<HookInput, 'sections'>>,
  collect?: string[],
): Promise<HookResult> {
  const scripts = deps.scripts ?? new NoopScriptRunner();
  const input: HookInput = {
    hook,
    text,
    history: history.slice(-40).map((a) => ({ text: actionText(a), rawText: actionText(a), type: a.type })),
    storyCards: toScriptCards(adventure.storyCards),
    state: adventure.scriptState,
    // onInput has no context to read them against.
    ...(hook !== 'onInput' && { entities: toScriptEntities(adventure), scene: toScriptScene(adventure), events: toScriptEvents(adventure) }),
    ...extra,
  };
  // A runner that rejects (a crashed or restarted worker) must not fail the turn either; the trace keeps the reason.
  const result = await scripts.run(input).catch((e: unknown): HookResult => ({
    text: input.text,
    state: input.state,
    storyCards: input.storyCards,
    sections: input.sections,
    logs: [],
    error: e instanceof Error ? e.message : String(e),
    elapsedMs: 0,
  }));
  collect?.push(...result.logs.map((l) => `${hook}: ${l}`), ...(result.error ? [`error: ${hook}: ${result.error}`] : []));
  if (!result.error) {
    adventure.scriptState = result.state;
    adventure.storyCards = scriptCardsToCore(result.storyCards, adventure.storyCards);
  }
  return result;
}
