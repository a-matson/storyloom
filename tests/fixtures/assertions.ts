import { indexAssertions } from '@core/memory/assertionIndex';
import { deriveAssertions } from '@core/memory/assertions';
import type { Action, Assertion, Entity } from '@core/model';

/** An entity's assertions, derived from its facts and fields. */
export const own = (e: Entity, actions: readonly Action[] = []): Assertion[] => deriveAssertions({ entities: [e], actions: [...actions] });

/** A context input (or adventure) with the assertions its entities' facts give. */
export const derived = <T extends { entities: Entity[]; actions: Action[] }>(i: T): T & { assertions: Assertion[] } => ({
  ...i,
  assertions: deriveAssertions(i),
});

/** The entities' assertions by subject. */
export const ixOf = (entities: readonly Entity[], actions: readonly Action[] = []) =>
  indexAssertions(deriveAssertions({ entities: [...entities], actions: [...actions] }));
