import type { Scenario, StoryCard } from './types';
import { newScenario } from './scenario';

// Editor and pre-play only; kept apart from scenario.ts so the start-up chunk does not carry them.

/** Character Creator: selectable cards grouped by Type, in first-seen order; the player picks one per Type. */
export function creatorChoices(s: Scenario): { type: string; options: StoryCard[] }[] {
  if (s.type !== 'characterCreator') return [];
  const groups = new Map<string, StoryCard[]>();
  for (const c of s.storyCards) if (c.selectable) groups.set(c.type, [...(groups.get(c.type) ?? []), c]);
  return [...groups].map(([type, options]) => ({ type, options }));
}

/** Multiple Choice: the node at `path` (child ids from the root), or undefined if the path is stale. */
export function childAt(root: Scenario, path: string[]): Scenario | undefined {
  let node: Scenario | undefined = root;
  for (const id of path) node = node?.options?.find((o) => o.id === id);
  return node;
}

/** A new root with the node at `path` replaced; children live inside the root record [provisional]. */
export function withChild(root: Scenario, path: string[], child: Scenario): Scenario {
  const [id, ...rest] = path;
  if (id === undefined) return child;
  return { ...root, options: root.options?.map((o) => (o.id === id ? withChild(o, rest, child) : o)) };
}

/** Every stored cover in the tree as `[ownerId, coverId]` — the owner a blob is keyed under. */
export function coverIds(root: Scenario): [ownerId: string, coverId: string][] {
  const own: [string, string][] = root.coverId === undefined ? [] : [[root.id, root.coverId]];
  return [...own, ...(root.options ?? []).flatMap(coverIds)];
}

/** A blank story option under `parent`. */
export function newOption(parent: Scenario): Scenario {
  return { ...newScenario(), parentId: parent.id };
}
