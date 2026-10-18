import { z } from 'zod/mini';
import { ActionType, ScenarioScripts, ScriptState } from '@core/schema';

export const ScriptCard = z.object({ id: z.string(), keys: z.string(), entry: z.string(), type: z.string(), title: z.string(), description: z.string() });

const HookName = z.enum(['onInput', 'onModelContext', 'onOutput']);

/**
 * Cache-safe mode: `kind`/`text` only (plus read-only `cacheable`), so `ContextSection`'s
 * host-side counts never cross into the VM. `kind` is validated by `applyScriptSections`.
 */
const ScriptSection = z.object({ kind: z.string(), text: z.string(), cacheable: z.optional(z.boolean()) });

const ScriptEntity = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  description: z.string(),
  facts: z.array(z.string()),
  state: z.record(z.string(), z.string()),
});

const ScriptScene = z.object({
  location: z.optional(z.string()),
  zone: z.optional(z.string()),
  present: z.array(z.string()),
  groups: z.array(z.object({ name: z.string(), count: z.optional(z.number()) })),
  time: z.optional(z.object({ day: z.number(), part: z.string() })),
});

const ScriptEvent = z.object({ at: z.number(), text: z.string(), who: z.array(z.string()) });

export const SandboxInput = z.object({
  hook: HookName,
  text: z.string(),
  history: z.array(z.object({ text: z.string(), rawText: z.string(), type: ActionType })),
  storyCards: z.array(ScriptCard),
  state: ScriptState,
  info: z.object({
    characterNames: z.array(z.string()),
    actionCount: z.number(),
    maxChars: z.optional(z.number()),
    memoryLength: z.optional(z.number()),
    /** onInput only. */
    actionType: z.optional(z.enum([...ActionType.options, 'continue'])),
    retry: z.optional(z.number()),
    consequences: z.optional(z.enum(['harsh', 'fair', 'none'])),
  }),
  /** onModelContext only. */
  sections: z.optional(z.array(ScriptSection)),
  /** onModelContext and onOutput only; the prelude exposes them as a frozen, non-enumerable `state.entities`. */
  entities: z.optional(z.array(ScriptEntity)),
  /** Same as `entities`: frozen, non-enumerable `state.scene` and `state.events`. */
  scene: z.optional(ScriptScene),
  events: z.optional(z.array(ScriptEvent)),
});
export type SandboxInput = z.infer<typeof SandboxInput>;

export const SandboxOutput = z.object({
  text: z.optional(z.string()),
  stop: z.optional(z.boolean()),
  state: ScriptState,
  storyCards: z.array(ScriptCard),
  sections: z.optional(z.array(ScriptSection)),
  logs: z.array(z.string()),
  error: z.optional(z.string()),
  elapsedMs: z.number(),
});
export type SandboxOutput = z.infer<typeof SandboxOutput>;

/** What a hook may return: `{ text }` / `{ stop: true }`. Anything else means "no change". */
export const HookReturn = z.object({ text: z.optional(z.string()), stop: z.optional(z.boolean()) });

/** What `__out` stringifies inside the VM. */
export const HookOutput = z.object({
  result: z.unknown(),
  state: ScriptState,
  storyCards: z.array(ScriptCard),
  sections: z.nullable(z.array(ScriptSection)),
  logs: z.array(z.string()),
});

export const ScriptRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('load'), scripts: ScenarioScripts }),
  z.object({ type: z.literal('run'), id: z.int(), input: SandboxInput }),
]);
export type ScriptRequest = z.infer<typeof ScriptRequest>;

export const ScriptReply = z.discriminatedUnion('type', [
  z.object({ type: z.literal('loaded'), ok: z.boolean(), error: z.optional(z.string()) }),
  z.object({ type: z.literal('result'), id: z.int(), result: SandboxOutput }),
  /** No id: the request could not be matched to a run. */
  z.object({ type: z.literal('error'), id: z.optional(z.int()), message: z.string() }),
]);
export type ScriptReply = z.infer<typeof ScriptReply>;
