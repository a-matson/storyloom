import { indexAssertions } from '@core/memory/assertionIndex';
import { deriveAssertions } from '@core/memory/assertions';
import { mergeAssertions } from '@core/memory/assertionWrites';
import type { Action, Assertion, Entity } from '@core/model';

/** An entity's assertions, derived from its facts and fields. */
export const own = (e: Entity, actions: readonly Action[] = []): Assertion[] => deriveAssertions({ entities: [e], actions: [...actions] });

/** What the story said about `e` at `at`, as a model reply folds it. */
export const told = (e: Entity, said: { description?: string; facts?: string[]; state?: Record<string, string> }, at = 0): Assertion[] =>
  mergeAssertions(e, [], { description: '', facts: [], ...said }, at, { producer: 'turn' });

/** A context input (or adventure) with the assertions its entities' facts give. */
export const derived = <T extends { entities: Entity[]; actions: Action[] }>(i: T): T & { assertions: Assertion[] } => ({
  ...i,
  assertions: deriveAssertions(i),
});

/** The entities' assertions by subject. */
export const ixOf = (entities: readonly Entity[], actions: readonly Action[] = []) =>
  indexAssertions(deriveAssertions({ entities: [...entities], actions: [...actions] }));
