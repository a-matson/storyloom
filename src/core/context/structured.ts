import { compileCards, lookbackWindow, matchCards } from '../cards/storyCards';
import { indexAssertions } from '../memory/assertionIndex';
import { isConfirmed } from '../memory/facts';
import { sceneNames } from '../memory/names';
import { projectEntity } from '../memory/projection';
import type { Entity } from '../model/types';
import { actionStoryText } from '../text/formatting';
import { type CastLine, mentionedLine, pinnedLines, presentLine } from './cast';
import { renderScene, renderSection } from './render';
import { relevantRules, renderRules } from './rules';
import type { ContextBuildInput, RenderedSections, SectionKind } from './types';

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
 * Rules, the scene line, then the cast: a now-line per present character (and the scene's place),
 * an identity line per entity the recent text names, the player's pins for everyone else. In that
 * order inside one cap; a line that does not fit is skipped whole. Absent entities send nothing.
 */
export function selectStructured(input: ContextBuildInput, lastActionIndex: number, cap: number, out: RenderedSections): StructuredResult {
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

  // The location counts as present, so the place the scene is in gets its identity line too.
  const refs = [...(plot.scene?.present ?? []), plot.scene?.location ?? ''].filter((n) => n.trim());
  const byId = new Map(entities.map((e) => [e.id, e]));
  const here = [...ids(refs.flatMap((n) => byId.get(n) ?? entities.find((e) => named(e, n)) ?? []))].flatMap((i) => byId.get(i) ?? []);
  // Named through every entity: an unconfirmed one present still reads as its name, not its id.
  const shown = plot.scene && sceneNames(plot.scene, input.entities);
  const window = lookbackWindow(cap);
  const recent = lastActionIndex >= 0 ? input.actions.slice(Math.max(0, lastActionIndex - window + 1), lastActionIndex + 1) : [];
  const inText = matchCards(compileCards(entities.map((e) => projectEntity(e, ix.of(e.id)))), recent.map(actionStoryText)).flatMap(
    (m) => byId.get(m.card.id) ?? [],
  );
  const present = ids(here);
  const mentioned = [...ids(inText)].filter((i) => !present.has(i)).flatMap((i) => byId.get(i) ?? []);

  // Rules first: the world's laws outrank what the scene holds. As many as fit, in order.
  const ctx = { entities, ix, scene: shown, present, mentioned: ids(mentioned) };
  const rules = relevantRules(input.rules ?? [], ctx);
  while (rules.length && tokenizer.count(renderSection('rules', renderRules(rules))) > left) rules.pop();
  if (rules.length) put('rules', renderSection('rules', renderRules(rules)));

  const scene = renderScene(shown, entities, ix);
  if (scene && tokenizer.count(renderSection('scene', scene)) <= left) put('scene', renderSection('scene', scene));

  // A hand-written card already says who they are, so a carded entity keeps its now-line but no identity.
  const cardNames = new Set(input.storyCards.flatMap((c) => [c.id, c.name.trim().toLowerCase()]));
  const carded = (e: Entity) => (e.cardId !== undefined && cardNames.has(e.cardId)) || cardNames.has(e.name.trim().toLowerCase());
  // The player's own facts (Correct, pins) and canon conflicts go in even with entity facts off.
  const lines: CastLine[] = input.settings.pinnedFactsOnly
    ? pinnedLines(entities, ix)
    : [
        ...here.map((e) => presentLine(e, ix.of(e.id), here, carded(e))),
        ...mentioned.flatMap((e) => mentionedLine(e, ix.of(e.id), carded(e))),
        ...pinnedLines(
          entities.filter((e) => !present.has(e.id)),
          ix,
        ),
      ];
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
