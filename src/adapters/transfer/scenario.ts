import { z } from 'zod/mini';
import type { Scenario } from '@core/model';
import { newId } from '@core/model';
import * as S from '@core/schema';
import { firstIssue, isRecord, repointAssertion, repointEntity } from './own';

export const SCENARIO_FORMAT = 'storyloom-scenario';

const ScenarioExport = z.object({ format: z.literal(SCENARIO_FORMAT), version: z.literal(1), exportedAt: z.optional(z.string()), scenario: S.Scenario });

export function exportScenarioJson(s: Scenario): string {
  return JSON.stringify({ format: SCENARIO_FORMAT, version: 1, exportedAt: new Date().toISOString(), scenario: s }, null, 2);
}

/** Our export or a bare scenario, always with fresh ids. Throws with the field path when it is ours but damaged. */
export function importScenarioJson(json: string): Scenario {
  const data: unknown = JSON.parse(json);
  const wrapped = ScenarioExport.safeParse(data);
  if (wrapped.success) return renumberScenario(wrapped.data.scenario);
  if (isRecord(data) && data['format'] === SCENARIO_FORMAT) throw new Error(`Damaged Storyloom scenario: ${firstIssue(wrapped.error)}`);
  const bare = S.Scenario.safeParse(data);
  if (!bare.success) throw new Error('Unrecognised scenario JSON.');
  return renumberScenario(bare.data);
}

/**
 * Fresh ids for the scenario, its options (all depths), cards and world, so an import never overwrites;
 * the world's links follow them. The cover blob does not travel with the JSON, so its id goes.
 */
export function renumberScenario(s: Scenario, parentId?: string): Scenario {
  const scn = newId('scn_');
  const { parentId: _old, coverId: _cover, options, world, ...rest } = s;
  const ids = new Map([...s.storyCards.map((c) => [c.id, newId('card_')] as const), ...(world?.entities ?? []).map((e) => [e.id, newId('ent_')] as const)]);
  const id = (old: string) => ids.get(old) ?? old;
  return {
    ...rest,
    id: scn,
    ...(parentId === undefined ? {} : { parentId }),
    ...(options === undefined ? {} : { options: options.map((o) => renumberScenario(o, scn)) }),
    storyCards: s.storyCards.map((c) => ({ ...c, id: id(c.id) })),
    ...(world && {
      world: {
        entities: world.entities.map((e) => repointEntity(e, id, ids)),
        assertions: world.assertions.map((x) => Object.assign(repointAssertion(x, id), { id: newId('as_') })),
        rules: world.rules.map((r) => Object.assign({}, r, { id: newId('rule_'), gates: r.gates.map(id) })),
      },
    }),
    updatedAt: Date.now(),
  };
}
