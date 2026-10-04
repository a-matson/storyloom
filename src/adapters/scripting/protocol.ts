import { z } from 'zod/mini';
import { ActionType, ScenarioScripts, ScriptState } from '@core/schema';

export const ScriptCard = z.object({ id: z.string(), keys: z.string(), entry: z.string(), type: z.string() });

const HookName = z.enum(['onInput', 'onModelContext', 'onOutput']);

/**
 * A hook run, without `sections`: cache-safe mode is a later milestone item,
 * and keeping ContextSection out of the worker keeps this protocol flat.
 */
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
  }),
});
export type SandboxInput = z.infer<typeof SandboxInput>;

export const SandboxOutput = z.object({
  text: z.optional(z.string()),
  stop: z.optional(z.boolean()),
  state: ScriptState,
  storyCards: z.array(ScriptCard),
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
