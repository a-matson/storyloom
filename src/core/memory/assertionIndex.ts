import type { Assertion } from '../model/types';

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

/** The line a fact used to be: what pins, the contradiction check and the BM25 corpus read. */
export function textOf(a: Assertion): string {
  switch (a.kind) {
    case 'identity':
    case 'trait':
      return a.text;
    case 'look':
      return a.key === 'legacy' ? a.value : `${a.key}: ${a.value}`;
    case 'state':
      return `${a.key}: ${a.value}`;
    case 'effect':
      return a.condition;
    case 'relationship':
      return a.stance;
    case 'conflict':
      return `the story says ${a.key} is ${a.claimed}, but canon says ${a.canon}`;
  }
}
