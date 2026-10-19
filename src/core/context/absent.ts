import { compileCards, matchCards } from '../cards/storyCards';
import { entityNamedIn } from '../memory/names';
import { playerName } from '../memory/you';
import { actionText, type Entity, type StoryCard } from '../model/types';
import { named } from './spotlight';
import type { ContextBuildInput } from './types';

export interface Absence {
  /** A character not in the scene that the player's last action does not name. */
  entity: (e: Entity) => boolean;
  /** A character's card (by type, `cardId` or name) whose character is absent and that the player's last action does not trigger. */
  card: (c: StoryCard) => boolean;
}

const nobody: Absence = { entity: () => false, card: () => false };
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Who sends nothing: the story naming an absent character in passing ("Tamsin's father…") brought them on stage.
 * Only the player's `do`/`say` names one back in. Before the first scene read absence is unknown, so nobody is absent.
 */
export function absence(input: Pick<ContextBuildInput, 'plot' | 'entities' | 'actions'>, lastActionIndex: number): Absence {
  const scene = input.plot.scene;
  if (!scene) return nobody;
  const last = input.actions[lastActionIndex];
  const text = last?.type === 'do' || last?.type === 'say' ? actionText(last) : '';
  const here = (e: Entity) => scene.present.some((n) => n === e.id || named(e, n));
  const entity = (e: Entity) => e.kind === 'character' && !here(e) && !entityNamedIn([e], text);
  const you = playerName(input);
  const card = (c: StoryCard) => {
    const owner = input.entities.find((e) => e.kind === 'character' && (e.cardId === c.id || norm(e.name) === norm(c.name)));
    if (!owner && norm(c.type) !== 'character') return false;
    // The player is always here, whatever the scene read lists.
    if (you !== undefined && norm(c.name) === norm(you)) return false;
    if (matchCards(compileCards([c]), [text]).length > 0) return false;
    return owner ? entity(owner) : !scene.present.some((n) => norm(n) === norm(c.name));
  };
  return { entity, card };
}
