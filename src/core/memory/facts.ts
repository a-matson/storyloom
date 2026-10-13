import type { Assertion, Entity } from '../model/types';

/**
 * Whether the prompt may use the entity: canon, carded, touched by the player (a line of their own
 * or a pin; a state value does not count, old saves hold the model's there), or seen in two
 * extracted ranges (each range stamps its last action, so `lastSeen` moves). One sighting is too
 * often a misread for the structured cap.
 */
export const isConfirmed = (e: Entity, as: readonly Assertion[]): boolean =>
  !!e.canon || !!e.cardId || e.lastSeen > e.firstSeen || as.some((a) => a.pinned === true || (a.basis === 'player' && a.kind !== 'state' && a.kind !== 'look'));
