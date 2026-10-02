import type { ContextBuildResult } from '../context';
import type { Action, TurnTrace } from '../model/types';
import type { Embedder } from '../ports/embedder';
import type { CompletionStats, Provider } from '../ports/provider';
import type { ScriptRunner } from '../ports/scripting';
import type { Tokenizer } from '../text/tokenizer';

export type PlayerTurnType = 'do' | 'say' | 'story';

export interface TurnDeps {
  provider: Provider;
  tokenizer: Tokenizer;
  scripts?: ScriptRunner;
  embedder?: Embedder;
}

/** Events that belong to one turn carry its `turnId`; tokens and messages are tied to it by order. */
export type TurnEvent =
  | { type: 'player'; turnId: string; action: Action }
  | { type: 'context'; turnId: string; result: ContextBuildResult; prompt: string; stop: string[] }
  | { type: 'token'; text: string }
  | { type: 'done'; turnId: string; action: Action; text: string; stats?: CompletionStats | undefined }
  | { type: 'stopped'; turnId: string; reason: string }
  | { type: 'message'; text: string }
  | { type: 'error'; turnId: string; message: string }
  /** Last event of a turn that got as far as a prompt. */
  | { type: 'trace'; trace: TurnTrace };

export interface PreparedContext {
  result: ContextBuildResult;
  prompt: string;
  stop: string[];
}

export interface Generated {
  text: string;
  stats?: CompletionStats | undefined;
  /** Milliseconds to the first streamed token. */
  ttftMs?: number | undefined;
}
