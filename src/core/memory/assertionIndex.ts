import type { Assertion, Entity } from '../model/types';

/** The adventure's assertions by subject. Small and on the start-up path; deriving them is not. */
export interface AssertionIndex {
  /** The subject's assertions, ended ones included, in store order. */
  of(subject: string): readonly Assertion[];
  all: readonly Assertion[];
}

const NONE: readonly Assertion[] = [];

export function indexAssertions(all: readonly Assertion[]): AssertionIndex {
  const by = new Map<string, Assertion[]>();
  for (const a of all) {
    const list = by.get(a.subject);
    if (list) list.push(a);
    else by.set(a.subject, [a]);
  }
  return { of: (subject) => by.get(subject) ?? NONE, all };
}

export const isCurrent = (a: Assertion): boolean => a.until === undefined;

export type AssertionOf<K extends Assertion['kind']> = Extract<Assertion, { kind: K }>;

/** The current assertions of one kind, in store order. */
export const current = <K extends Assertion['kind']>(as: readonly Assertion[], kind: K): AssertionOf<K>[] =>
  as.filter((a): a is AssertionOf<K> => a.kind === kind && isCurrent(a));

/** Who it is: a canon or carded entity's card text, else its current identity assertion. */
export const identityText = (e: Pick<Entity, 'canon' | 'cardId' | 'description'>, as: readonly Assertion[]): string =>
  e.canon || e.cardId ? e.description : (current(as, 'identity').at(-1)?.text ?? '');

/** The line a fact used to be: what pins, the contradiction check and the BM25 corpus read. */
export function textOf(a: Assertion): string {
  if (a.kind === 'identity' || a.kind === 'trait') return a.text;
  if (a.kind === 'look' || a.kind === 'state') return a.key === 'legacy' ? a.value : `${a.key}: ${a.value}`;
  if (a.kind === 'effect') return a.condition;
  if (a.kind === 'relationship') return a.stance;
  return `the story says ${a.key} is ${a.claimed}, but canon says ${a.canon}`;
}
