import { compileCards, lookbackWindow, matchCards } from '../cards/storyCards';
import { type AssertionIndex, eventsOf, indexAssertions } from '../memory/assertionIndex';
import { isConfirmed } from '../memory/facts';
import { sceneNames } from '../memory/names';
import { projectEntity } from '../memory/projection';
import type { Adventure, Entity, PlotComponents, Scene, StoryCard } from '../model/types';
import { actionStoryText } from '../text/formatting';
import { heldBy, itemsIn, MAX_ITEMS, YOU } from '../memory/items';
import { askedFacts } from './asked';
import { type CastLine, identityLine, pinnedLine, presentLine } from './cast';
import { renderScene, renderSection } from './render';
import { relevantRules, renderRules } from './rules';
import type { ContextBuildInput, RenderedSections, SectionKind } from './types';
import { named, nudgedIn, QUIET_TURNS, quietTurns, SEND_GOALS, spotlight } from './spotlight';
import { gapsOf, MAX_GAPS, witnessClause } from './witness';

/** Hard ceiling on rules, scene and cast together, under the `structuredShare` cap. [provisional] */
export const STRUCTURED_CAP = 300;

export interface StructuredResult {
  structuredBudget: number;
  structuredUsed: number;
  usedFacts: { entityId: string; factId: string }[];
  /** Entities with a cast line in the prompt. */
  usedEntityIds: string[];
  usedRuleIds: string[];
  /** Everyone the scene line names (unconfirmed too), here, or named by the text: whom a secret is kept from. */
  inCast: Entity[];
}

const ids = (es: Entity[]) => new Set(es.map((e) => e.id));

/**
 * Who and what the scene holds: present entities (the location and your room count as present, so their
 * places get a line too), then items here or held that are not present. `shown` is the scene in names.
 */
function sceneCast(scene: Scene | undefined, entities: Entity[], all: readonly Entity[], ix: AssertionIndex) {
  const refs = [...(scene?.present ?? []), scene?.location ?? '', scene?.zone ?? ''].filter((n) => n.trim());
  const byId = new Map(entities.map((e) => [e.id, e]));
  const here = [...ids(refs.flatMap((n) => byId.get(n) ?? entities.find((e) => named(e, n)) ?? []))].flatMap((i) => byId.get(i) ?? []);
  // Named through every entity: an unconfirmed one present still reads as its name, not its id.
  const shown = scene && sceneNames(scene, all);
  const present = ids(here);
  // An item here or held sends its own lore, or the model makes up new lore for it; a group's faction too, never a now-line.
  const groups = (scene?.groups ?? []).flatMap((g) => byId.get(g.id) ?? entities.find((e) => named(e, g.id)) ?? []);
  const things = [...(shown ? itemsIn(shown, entities, ix) : []), ...heldBy(entities, ix, YOU).slice(0, MAX_ITEMS), ...groups].flatMap((x) =>
    typeof x === 'string' || present.has(x.id) ? [] : [x],
  );
  return { shown, here, items: [...ids(things)].flatMap((i) => byId.get(i) ?? []) };
}

/** A hand-written card already says who they are, so a carded entity keeps its now-line but no identity. */
function cardedBy(cards: readonly StoryCard[]) {
  const names = new Set(cards.flatMap((c) => [c.id, c.name.trim().toLowerCase()]));
  return (e: Entity) => (e.cardId !== undefined && names.has(e.cardId)) || names.has(e.name.trim().toLowerCase());
}

/**
 * What witnessed-by clauses read: who was present when, and the window history covers (`to`: the last action); who is
 * `speakingIn` it; and who is in another room (the scene's `zones`, by name).
 */
interface Witnessed {
  presence: NonNullable<PlotComponents['presence']>;
  window: { from: number; to: number };
  speaking: ReadonlySet<string>;
  rooms: Scene['zones'];
  /** Who gets their confirmed goal on the line (`wantingIn`). */
  wanting: ReadonlySet<string>;
}

/** Quiet for `QUIET_TURNS` actions or more, or nudged: the model is given what they want so they act on it; nobody while `SEND_GOALS` is off. [provisional] */
const wantingIn = (actions: Adventure['actions'], here: Entity[], ix: AssertionIndex, nudged: readonly string[] = []) =>
  ids(here.filter((e) => SEND_GOALS && e.kind === 'character' && (nudged.includes(e.id) || quietTurns(e, actions, ix) >= QUIET_TURNS)));

/**
 * Who is likely to talk next, so their voice goes in: everyone here after the player's `say`, else whom the
 * last AI output quoted (its speaker labels). [provisional]
 */
function speakingIn(actions: Adventure['actions'], last: number, here: Entity[]): Set<string> {
  if (actions[last]?.type === 'say') return ids(here);
  const output = actions.slice(0, last + 1).findLast((a) => a.type === 'continue' || a.type === 'start');
  const quoted = output?.speakers ?? [];
  return ids(here.filter((e) => quoted.some((s) => named(e, s.name))));
}

/** A present character's now-line with what they missed in the window, the most recent `MAX_GAPS`. */
function castLine(e: Entity, here: Entity[], ix: AssertionIndex, carded: boolean, w: Witnessed): CastLine {
  const gaps = e.kind === 'character' ? gapsOf(e.id, w.presence, ix.of(e.id), w.window).slice(-MAX_GAPS) : [];
  // The clause names no range, so two gaps of a kind read the same: send it once.
  const room = Object.entries(w.rooms ?? {}).find(([n]) => n === e.id || named(e, n))?.[1];
  // The events others led on them move their stances (`standing`); those are stored under the actor.
  const as = [...ix.of(e.id), ...eventsOf(ix.all, e.id).filter((a) => a.subject !== e.id)];
  const line = presentLine(e, as, here, carded, [...new Set(gaps.map(witnessClause))], w.speaking.has(e.id), room, w.wanting.has(e.id));
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
export function nowLines(adv: Pick<Adventure, 'plot' | 'entities' | 'assertions' | 'storyCards' | 'actions'> & Partial<Pick<Adventure, 'scriptState'>>): {
  scene: string;
  lines: CastLine[];
} {
  const ix = indexAssertions(adv.assertions);
  const entities = adv.entities.filter((e) => isConfirmed(e, ix.of(e.id)));
  const { shown, here, items } = sceneCast(adv.plot.scene, entities, adv.entities, ix);
  const to = adv.actions.length - 1;
  const w: Witnessed = {
    presence: adv.plot.presence ?? [],
    window: { from: 0, to },
    speaking: speakingIn(adv.actions, to, here),
    rooms: shown?.zones,
    wanting: wantingIn(adv.actions, here, ix, nudgedIn(adv.scriptState?.__nudge, adv.actions.length)),
  };
  const lines = hereLines(spotlight(here, adv.actions, ix), items, ix, cardedBy(adv.storyCards), w);
  return { scene: renderScene(shown, entities, ix), lines };
}

/**
 * Rules, the scene line, then the cast: a now-line per present character (and the scene's place),
 * an identity line per item here or held, then per entity the recent text names, most recent first.
 * In that order inside one cap; a line that does not fit is skipped whole. Absent entities send no facts, pins included,
 * but what the player's last action asks about one it names (`askedFacts`). Absent characters send nothing unless the
 * player's action names them (`absent`).
 * `historyFrom`: the earliest action history can reach, the witnessed-by window's start.
 */
export function selectStructured(
  input: ContextBuildInput,
  lastActionIndex: number,
  historyFrom: number,
  cap: number,
  out: RenderedSections,
  absent: (e: Entity) => boolean = () => false,
): StructuredResult {
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
  const inTextOnly = [...ids(inText)].filter((i) => !seen.has(i)).flatMap((i) => byId.get(i) ?? []);
  const mentioned = inTextOnly.filter((e) => !absent(e));

  // Rules first: the world's laws outrank what the scene holds. As many as fit, in order.
  const ctx = { entities, ix, scene: shown, present, mentioned: ids(mentioned) };
  const rules = relevantRules(input.rules ?? [], ctx);
  while (rules.length && tokenizer.count(renderSection('rules', renderRules(rules))) > left) rules.pop();
  if (rules.length) put('rules', renderSection('rules', renderRules(rules)));

  const scene = renderScene(shown, entities, ix);
  if (scene && tokenizer.count(renderSection('scene', scene)) <= left) put('scene', renderSection('scene', scene));

  const carded = cardedBy(input.storyCards);
  const upTo = input.actions.slice(0, lastActionIndex + 1);
  // A gap that left the window is in a memory, which the model reads as a memory anyway.
  const witnessed: Witnessed = {
    presence: plot.presence ?? [],
    window: { from: historyFrom, to: lastActionIndex },
    speaking: speakingIn(input.actions, lastActionIndex, here),
    rooms: shown?.zones,
    wanting: wantingIn(upTo, here, ix, input.nudged),
  };
  // With entity facts off, the player's own facts (Correct, pins) still go in for who is here or named.
  // Each entry is one entity's line and its fallbacks: an asked-about line that does not fit sends the identity alone.
  const asked = askedFacts(input.actions[lastActionIndex], mentioned, entities, ix);
  const lines: CastLine[][] = input.settings.pinnedFactsOnly
    ? [...here, ...items, ...mentioned].map((e) => pinnedLine(e, ix.of(e.id), carded(e)))
    : [
        ...hereLines(spotlight(here, upTo, ix), items, ix, carded, witnessed).map((l) => [l]),
        ...mentioned.map((e) => {
          const facts = asked.get(e.id) ?? [];
          const bare = identityLine(e, ix.of(e.id), carded(e));
          return facts.length ? identityLine(e, ix.of(e.id), carded(e), facts).concat(bare) : bare;
        }),
      ];
  // Per-line cost +1 for the newline is an upper bound.
  let cost = 0;
  const kept = lines.flatMap((alts) => {
    const fit = alts.find((l) => cost + tokenizer.count(l.text) + 1 <= left);
    if (fit) cost += tokenizer.count(fit.text) + 1;
    return fit ?? [];
  });
  if (kept.length) put('cast', kept.map((l) => l.text).join('\n'));
  // Everyone the scene line names counts, unconfirmed too: Sefa, present but unconfirmed, retold a secret as a rumour.
  const inScene = (plot.scene?.present ?? []).flatMap((n) => input.entities.find((e) => e.id === n || named(e, n)) ?? []);

  return {
    structuredBudget: budget,
    structuredUsed: budget - left,
    usedFacts: kept.flatMap((l) => l.factIds.map((factId) => ({ entityId: l.entity.id, factId }))),
    usedEntityIds: [...new Set(kept.map((l) => l.entity.id))],
    usedRuleIds: rules.map((r) => r.id),
    // An absent character the text names still keeps a secret from the prompt: history still names them.
    inCast: [...new Set([...inScene, ...here, ...inTextOnly])],
  };
}
