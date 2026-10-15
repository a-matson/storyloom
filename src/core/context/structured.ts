import { compileCards, lookbackWindow, matchCards } from '../cards/storyCards';
import { type AssertionIndex, indexAssertions } from '../memory/assertionIndex';
import { isConfirmed } from '../memory/facts';
import { sceneNames } from '../memory/names';
import { projectEntity } from '../memory/projection';
import type { Adventure, Entity, PlotComponents, Scene, StoryCard } from '../model/types';
import { actionStoryText } from '../text/formatting';
import { heldBy, itemsIn, MAX_ITEMS, YOU } from '../memory/items';
import { type CastLine, identityLine, pinnedLine, presentLine } from './cast';
import { renderScene, renderSection } from './render';
import { relevantRules, renderRules } from './rules';
import type { ContextBuildInput, RenderedSections, SectionKind } from './types';
import { gapsOf, MAX_GAPS, witnessClause } from './witness';

/** Hard ceiling on rules, scene and cast together, under the `structuredShare` cap. [provisional] */
export const STRUCTURED_CAP = 200;

export interface StructuredResult {
  structuredBudget: number;
  structuredUsed: number;
  usedFacts: { entityId: string; factId: string }[];
  /** Entities with a cast line in the prompt. */
  usedEntityIds: string[];
  usedRuleIds: string[];
}

// "the Old Well" in the scene names the entity "Old Well".
const norm = (n: string) => n.trim().toLowerCase().replace(/^the /, '');
const named = (e: Entity, n: string) => [e.name, ...e.aliases].some((k) => norm(k) === norm(n));
const ids = (es: Entity[]) => new Set(es.map((e) => e.id));

/**
 * Who and what the scene holds: present entities (the location counts as present, so its place gets
 * a line too), then items here or held that are not present. `shown` is the scene in names.
 */
function sceneCast(scene: Scene | undefined, entities: Entity[], all: readonly Entity[], ix: AssertionIndex) {
  const refs = [...(scene?.present ?? []), scene?.location ?? ''].filter((n) => n.trim());
  const byId = new Map(entities.map((e) => [e.id, e]));
  const here = [...ids(refs.flatMap((n) => byId.get(n) ?? entities.find((e) => named(e, n)) ?? []))].flatMap((i) => byId.get(i) ?? []);
  // Named through every entity: an unconfirmed one present still reads as its name, not its id.
  const shown = scene && sceneNames(scene, all);
  const present = ids(here);
  // An item here or held sends its own lore, or the model makes up new lore for it.
  const things = [...(shown ? itemsIn(shown, entities, ix) : []), ...heldBy(entities, ix, YOU).slice(0, MAX_ITEMS)].flatMap((x) =>
    typeof x === 'string' || present.has(x.id) ? [] : [x],
  );
  return { shown, here, items: [...ids(things)].flatMap((i) => byId.get(i) ?? []) };
}

/** A hand-written card already says who they are, so a carded entity keeps its now-line but no identity. */
function cardedBy(cards: readonly StoryCard[]) {
  const names = new Set(cards.flatMap((c) => [c.id, c.name.trim().toLowerCase()]));
  return (e: Entity) => (e.cardId !== undefined && names.has(e.cardId)) || names.has(e.name.trim().toLowerCase());
}

/** What witnessed-by clauses read: who was present when, and the window history covers (`to`: the last action). */
interface Witnessed {
  presence: NonNullable<PlotComponents['presence']>;
  window: { from: number; to: number };
}

/** A present character's now-line with what they missed in the window, the most recent `MAX_GAPS`. */
function castLine(e: Entity, here: Entity[], ix: AssertionIndex, carded: boolean, w: Witnessed): CastLine {
  const gaps = e.kind === 'character' ? gapsOf(e.id, w.presence, ix.of(e.id), w.window).slice(-MAX_GAPS) : [];
  // The clause names no range, so two gaps of a kind read the same: send it once.
  const line = presentLine(e, ix.of(e.id), here, carded, [...new Set(gaps.map(witnessClause))]);
  return gaps.length > 0 ? { ...line, gaps } : line;
}

const hereLines = (here: Entity[], items: Entity[], ix: AssertionIndex, carded: (e: Entity) => boolean, w: Witnessed): CastLine[] => [
  ...here.map((e) => castLine(e, here, ix, carded(e), w)),
  ...items.flatMap((e) => identityLine(e, ix.of(e.id), carded(e))),
];

/**
 * The World tab's Now card: the prompt's scene line and its cast lines for who and what is here, by the same functions.
 * Witnessed-by reads the whole log; the prompt cuts it to its history window, so the card may show an older clause.
 */
export function nowLines(adv: Pick<Adventure, 'plot' | 'entities' | 'assertions' | 'storyCards' | 'actions'>): {
  scene: string;
  lines: CastLine[];
} {
  const ix = indexAssertions(adv.assertions);
  const entities = adv.entities.filter((e) => isConfirmed(e, ix.of(e.id)));
  const { shown, here, items } = sceneCast(adv.plot.scene, entities, adv.entities, ix);
  const w: Witnessed = { presence: adv.plot.presence ?? [], window: { from: 0, to: adv.actions.length - 1 } };
  return { scene: renderScene(shown, entities, ix), lines: hereLines(here, items, ix, cardedBy(adv.storyCards), w) };
}

/**
 * Rules, the scene line, then the cast: a now-line per present character (and the scene's place),
 * an identity line per item here or held, then per entity the recent text names, most recent first.
 * In that order inside one cap; a line that does not fit is skipped whole. Absent entities send nothing, pins included.
 * `historyFrom`: the earliest action history can reach, the witnessed-by window's start.
 */
export function selectStructured(input: ContextBuildInput, lastActionIndex: number, historyFrom: number, cap: number, out: RenderedSections): StructuredResult {
  const { tokenizer, plot } = input;
  const budget = Math.min(cap, STRUCTURED_CAP);
  const ix = indexAssertions(input.assertions ?? []);
  const entities = input.entities.filter((e) => isConfirmed(e, ix.of(e.id)));
  let left = budget;
  const put = (kind: SectionKind, text: string) => {
    const tokens = tokenizer.count(text);
    out.set(kind, { text, tokens, trimmed: false });
    left -= tokens;
  };

  const { shown, here, items } = sceneCast(plot.scene, entities, input.entities, ix);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const window = lookbackWindow(cap);
  const recent = lastActionIndex >= 0 ? input.actions.slice(Math.max(0, lastActionIndex - window + 1), lastActionIndex + 1) : [];
  const inText = matchCards(compileCards(entities.map((e) => projectEntity(e, ix.of(e.id)))), recent.map(actionStoryText)).flatMap(
    (m) => byId.get(m.card.id) ?? [],
  );
  const present = ids(here);
  const seen = new Set([...present, ...ids(items)]);
  const mentioned = [...ids(inText)].filter((i) => !seen.has(i)).flatMap((i) => byId.get(i) ?? []);

  // Rules first: the world's laws outrank what the scene holds. As many as fit, in order.
  const ctx = { entities, ix, scene: shown, present, mentioned: ids(mentioned) };
  const rules = relevantRules(input.rules ?? [], ctx);
  while (rules.length && tokenizer.count(renderSection('rules', renderRules(rules))) > left) rules.pop();
  if (rules.length) put('rules', renderSection('rules', renderRules(rules)));

  const scene = renderScene(shown, entities, ix);
  if (scene && tokenizer.count(renderSection('scene', scene)) <= left) put('scene', renderSection('scene', scene));

  const carded = cardedBy(input.storyCards);
  // A gap that left the window is in a memory, which the model reads as a memory anyway.
  const witnessed: Witnessed = { presence: plot.presence ?? [], window: { from: historyFrom, to: lastActionIndex } };
  // With entity facts off, the player's own facts (Correct, pins) still go in for who is here or named.
  const lines: CastLine[] = input.settings.pinnedFactsOnly
    ? [...here, ...items, ...mentioned].flatMap((e) => pinnedLine(e, ix.of(e.id), carded(e)))
    : [...hereLines(here, items, ix, carded, witnessed), ...mentioned.flatMap((e) => identityLine(e, ix.of(e.id), carded(e)))];
  // Per-line cost +1 for the newline is an upper bound.
  let cost = 0;
  const kept = lines.filter((l) => {
    const c = tokenizer.count(l.text) + 1;
    if (cost + c > left) return false;
    cost += c;
    return true;
  });
  if (kept.length) put('cast', kept.map((l) => l.text).join('\n'));

  return {
    structuredBudget: budget,
    structuredUsed: budget - left,
    usedFacts: kept.flatMap((l) => l.factIds.map((factId) => ({ entityId: l.entity.id, factId }))),
    usedEntityIds: [...new Set(kept.map((l) => l.entity.id))],
    usedRuleIds: rules.map((r) => r.id),
  };
}
