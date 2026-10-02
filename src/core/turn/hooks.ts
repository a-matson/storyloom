import type { Action, Adventure, StoryCard } from '../model/types';
import { actionText } from '../model/types';
import { NoopScriptRunner, toScriptCards, type HookInput, type HookName, type HookResult, type ScriptStoryCard } from '../ports/scripting';
import type { TurnDeps } from './types';

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

/**
 * Run one script hook over the adventure. On success the hook's state and story cards
 * are written back to `adventure`; on error nothing changes (scripts must never break play).
 */
export async function runHook(
  adventure: Adventure,
  deps: TurnDeps,
  hook: HookName,
  text: string,
  history: Action[],
  extra: Pick<HookInput, 'info'> & Partial<Pick<HookInput, 'sections'>>,
): Promise<HookResult> {
  const scripts = deps.scripts ?? new NoopScriptRunner();
  const result = await scripts.run({
    hook,
    text,
    history: history.slice(-40).map((a) => ({ text: actionText(a), rawText: actionText(a), type: a.type })),
    storyCards: toScriptCards(adventure.storyCards),
    state: adventure.scriptState,
    ...extra,
  });
  if (!result.error) {
    adventure.scriptState = result.state;
    adventure.storyCards = scriptCardsToCore(result.storyCards, adventure.storyCards);
  }
  return result;
}
