import { jsonrepair } from 'jsonrepair';
import { z } from 'zod/mini';
import { actionText, newId, type Adventure, type Rule } from '../model/types';
import { withContent } from '../text/content';
import { parseJsonReply } from '../text/jsonReply';
import { renderTemplate } from '../text/templates';
import { helperCall } from './helperCall';
import type { MaintenanceDeps } from './memoryJobs';
import { entityNamedIn, norm } from './names';

/** Rules one passage may propose, and the characters each may run to. [provisional] */
const MAX_RULES = 3;
const MAX_CHARS = 120;
/** Three short rules and their names. [provisional] */
export const FIND_RULES_TOKENS = 200;

const FoundRule = z.object({ text: z.string(), about: z.optional(z.array(z.string())) });
/** Read leniently: a fourth rule or a long one is cut here, not a reason to drop the reply. */
const FoundRules = z.object({ rules: z.array(FoundRule) });
const Grammar = z.object({
  rules: z.array(z.object({ text: z.string().check(z.maxLength(MAX_CHARS)), about: z.array(z.string()) })).check(z.maxLength(MAX_RULES)),
});
const { $schema: _dialect, ...FIND_RULES_JSON_SCHEMA } = z.toJSONSchema(Grammar);
export { FIND_RULES_JSON_SCHEMA };

export const FIND_RULES_SYSTEM = "You find the standing rules of an interactive story's world. Reply with JSON only.";

// No worked example: under a grammar the 12B copies it (M11-1).
export function findRulesPrompt(passage: string, names: readonly string[]): string {
  return (
    (names.length ? `Known names: ${names.join(', ')}\n\n` : '') +
    `Passage:\n---\n${passage}\n---\n\n` +
    'List the rules of this world that the passage states: standing truths that hold beyond this scene ' +
    '(how a kind of creature, a custom, a law, a substance or magic always works). ' +
    'What someone does, says or feels now, and how one person or room looks, are not rules. ' +
    `Write each rule as one short sentence of at most ${MAX_CHARS} characters; "about" lists the known names it concerns. ` +
    `At most ${MAX_RULES}. Reply with an empty list when there is none. ` +
    'Return {"rules": [{"text": string, "about": string[]}]}.'
  );
}

/**
 * "Find rules in this passage": one slot-1 read of action `at` for standing world rules. Returns new story
 * proposals gated on the entities each names; a rule already held (same normalised text) is dropped. A damaged
 * reply finds nothing. Nothing is stored here.
 */
export async function findRules(
  adventure: Pick<Adventure, 'actions' | 'entities' | 'rules'>,
  deps: Pick<MaintenanceDeps, 'provider' | 'template' | 'signal' | 'content' | 'cuts'>,
  at: number,
): Promise<Rule[]> {
  const action = adventure.actions[at];
  const passage = action ? actionText(action).trim() : '';
  if (!passage) return [];
  const caps = await deps.provider.capabilities();
  const rendered = renderTemplate(
    deps.template,
    withContent(FIND_RULES_SYSTEM, deps.content),
    findRulesPrompt(
      passage,
      adventure.entities.map((e) => e.name),
    ),
    caps.jsonSchema ? '' : '{',
  );
  const req = {
    prompt: rendered.prompt,
    maxTokens: FIND_RULES_TOKENS,
    temperature: 0.2,
    stop: rendered.stop,
    cachePrompt: false,
    slotId: 1,
    jsonSchema: caps.jsonSchema ? FIND_RULES_JSON_SCHEMA : undefined,
  };
  const { text } = await helperCall('check', FIND_RULES_TOKENS, rendered.prompt, (signal) => deps.provider.complete(req, signal), {
    cancel: deps.signal,
    cuts: deps.cuts,
  });
  const reply = parseJsonReply(caps.jsonSchema ? text : `{${text}`, (d) => FoundRules.safeParse(d).data ?? null, jsonrepair);
  const held = new Set(adventure.rules.map((r) => norm(r.text)));
  const found: Rule[] = [];
  for (const r of reply?.rules.slice(0, MAX_RULES) ?? []) {
    const t = r.text.trim().slice(0, MAX_CHARS);
    if (!t || held.has(norm(t))) continue;
    held.add(norm(t));
    const named = [t, ...(r.about ?? [])].join('\n');
    const gates = adventure.entities.filter((e) => entityNamedIn([e], named)).map((e) => e.id);
    found.push({ id: newId('rule_'), text: t, gates, source: 'story', status: 'proposed', createdAt: Date.now(), fromAction: at });
  }
  return found;
}
