import type { ContextBuildResult } from '../context';
import type { Action } from '../model/types';
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

export type TurnEvent =
  | { type: 'player'; action: Action }
  | { type: 'context'; result: ContextBuildResult; prompt: string; stop: string[] }
  | { type: 'token'; text: string }
  | { type: 'done'; action: Action; text: string; stats?: CompletionStats | undefined }
  | { type: 'stopped'; reason: string }
  | { type: 'message'; text: string }
  | { type: 'error'; message: string };

export interface PreparedContext {
  result: ContextBuildResult;
  prompt: string;
  stop: string[];
}

export interface Generated {
  text: string;
  stats?: CompletionStats | undefined;
}
