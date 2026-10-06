import { compileCards, lookbackWindow, matchCards } from '../cards/storyCards';
import { rankFacts } from '../memory/facts';
import { projectEntity } from '../memory/projection';
import type { Entity } from '../model/types';
import { actionStoryText } from '../text/formatting';
import { HEADERS, renderScene, renderSection } from './render';
import type { ContextBuildInput, RenderedSections, SectionKind } from './types';

export interface StructuredResult {
  structuredBudget: number;
  structuredUsed: number;
  usedFacts: { entityId: string; factId: string }[];
  /** Entities with a card or a fact in the prompt. */
  usedEntityIds: string[];
}

// "the Old Well" in the scene names the entity "Old Well".
const norm = (n: string) => n.trim().toLowerCase().replace(/^the /, '');
const named = (e: Entity, names: ReadonlySet<string>) => [e.name, ...e.aliases].some((n) => names.has(norm(n)));

/**
 * Scene line, then facts, then entity cards, inside one cap; whatever does not fit is skipped.
 * An entity whose name a hand-written card holds, or whose promoted card still exists, sends facts only.
 */
export function selectStructured(input: ContextBuildInput, lastActionIndex: number, budget: number, out: RenderedSections): StructuredResult {
  const { tokenizer, entities, plot } = input;
  let left = budget;
  const put = (kind: SectionKind, text: string) => {
    const tokens = tokenizer.count(text);
    out.set(kind, { text, tokens, trimmed: false });
    left -= tokens;
  };
  // Header plus as many lines as fit; per-line cost +1 for the separator is an upper bound.
  const fill = <T>(kind: 'facts' | 'entityCards', items: T[], line: (t: T) => string, sep: string): T[] => {
    let cost = tokenizer.count(HEADERS[kind]) + 1;
    const kept = items.filter((t) => {
      const c = tokenizer.count(line(t)) + sep.length;
      if (cost + c > left) return false;
      cost += c;
      return true;
    });
    if (kept.length) put(kind, renderSection(kind, kept.map(line).join(sep)));
    return kept;
  };

  const scene = renderScene(plot.scene);
  if (scene && tokenizer.count(renderSection('scene', scene)) <= left) put('scene', renderSection('scene', scene));

  // The location counts as present, so the place the scene is in sends its card too.
  const present = new Set([...(plot.scene?.present ?? []), plot.scene?.location ?? ''].map(norm));
  const window = lookbackWindow(budget);
  const recent = lastActionIndex >= 0 ? input.actions.slice(Math.max(0, lastActionIndex - window + 1), lastActionIndex + 1) : [];
  const here = entities.filter((e) => named(e, present));
  const byId = new Map(entities.map((e) => [e.id, e]));
  const mentioned = matchCards(compileCards(entities.map(projectEntity)), recent.map(actionStoryText)).flatMap((m) => byId.get(m.card.id) ?? []);
  const facts = fill(
    'facts',
    rankFacts(entities, new Set(here.map((e) => e.id)), new Set(mentioned.map((e) => e.id))),
    (r) => `${r.entity.name}: ${r.fact.text}`,
    '\n',
  );

  const cardNames = new Set(input.storyCards.flatMap((c) => [c.id, c.name.trim().toLowerCase()]));
  const carded = (e: Entity) => (e.cardId && cardNames.has(e.cardId)) || cardNames.has(e.name.trim().toLowerCase());
  const candidates = [...new Set([...here, ...mentioned])].filter((e) => !carded(e));
  const cards = fill('entityCards', candidates, (e) => projectEntity(e).entry, '\n\n');

  return {
    structuredBudget: budget,
    structuredUsed: budget - left,
    usedFacts: facts.map((r) => ({ entityId: r.entity.id, factId: r.fact.id })),
    usedEntityIds: [...new Set([...cards.map((e) => e.id), ...facts.map((r) => r.entity.id)])],
  };
}
