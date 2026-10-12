import type { Entity } from '../model/types';

/**
 * Whether the prompt may use the entity: canon, carded, touched by the player (a player or pinned
 * fact), or seen in two extracted ranges (each range stamps its last action, so `lastSeen` moves).
 * One sighting is too often a misread for the structured cap.
 */
export const isConfirmed = (e: Entity): boolean =>
  !!e.canon || !!e.cardId || e.lastSeen > e.firstSeen || e.facts.some((f) => f.source !== 'memory' || f.pinned);
