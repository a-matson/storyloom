// Here, not in core/model: only the lazy transfer chunk needs it (start-up bundle budget).
import type { Adventure, Assertion, Scenario, ScenarioWorld } from '@core/model';
import { actionText, hasScripts, newScenario } from '@core/model';

const WORLD_KINDS = new Set<Assertion['kind']>(['identity', 'trait', 'look', 'relationship', 'secret']);

/**
 * What an adventure's world is outside its play: every entity, the current identities, traits,
 * looks, relationships and secrets (known by no one yet) that are not proposals, and the confirmed
 * rules, all placed at action 0. States, effects and events belong to one story, so they stay behind.
 */
export function worldOf(a: Adventure): ScenarioWorld {
  return {
    entities: a.entities.map(({ portraitId: _p, portraitBasis: _b, referenceImageId: _r, sheetImageId: _s, ...e }) =>
      Object.assign(e, { firstSeen: 0, lastSeen: 0 }),
    ),
    assertions: a.assertions.flatMap(({ span: _span, paragraph: _paragraph, ...x }) =>
      WORLD_KINDS.has(x.kind) && x.until === undefined && x.seen !== false
        ? [Object.assign(x, { at: 0, since: 0 }, x.kind === 'secret' && { knownBy: [] })]
        : [],
    ),
    rules: a.rules.filter((r) => r.status === 'confirmed').map((r) => Object.assign({}, r, { fromAction: 0 })),
  };
}

/** A scenario that opens as this adventure opened, in its world; the summary and scene logs are this story's play. */
export function scenarioFromAdventure(a: Adventure): Scenario {
  const start = a.actions.find((x) => x.type === 'start');
  const { aiInstructions, plotEssentials, authorsNote, thirdPerson } = structuredClone(a.plot);
  return {
    ...newScenario(a.title, start ? actionText(start) : ''),
    description: a.description,
    tags: [...a.tags],
    plot: { aiInstructions, plotEssentials, authorsNote, thirdPerson },
    storyCards: structuredClone(a.storyCards),
    ...(hasScripts(a.scripts) && { scripts: { ...a.scripts } }),
    world: worldOf(a),
  };
}
