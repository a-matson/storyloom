import { andList, knownByLabel, secretsOf } from '../memory/secrets';
import type { Assertion, Entity } from '../model/types';

/** Secret lines sent, the most recently marked first. [provisional] */
export const MAX_SECRETS = 2;

const clause = (s: string) => s.trim().replace(/[.;]+$/, '');

/**
 * `Secret, known only to you and Minos: <gist>. Vorthak and Okafor do not know it.`, one per secret a
 * character here or named does not know. The gist is already in history and memories; the line says who must not use it.
 * Probe at 62: 6/6 replies keep the confession private with the line over the scene's whole cast, 4/6 without
 * a line; "No one else … has heard of it" gave 4/6. [measured: 2026-10-15-probe-secrets-e, -f]
 */
export function secretLines(as: readonly Assertion[], cast: readonly Entity[], entities: readonly Entity[]): string[] {
  return secretsOf(as)
    .toSorted((a, b) => b.at - a.at)
    .flatMap((s) => {
      const outsiders = cast.filter((e) => e.kind === 'character' && !s.knownBy.includes(e.id)).map((e) => e.name);
      if (!outsiders.length) return [];
      const verb = outsiders.length > 1 ? 'do' : 'does';
      return [`Secret, ${knownByLabel(s, entities)}: ${clause(s.text)}. ${andList(outsiders)} ${verb} not know it.`];
    })
    .slice(0, MAX_SECRETS);
}
