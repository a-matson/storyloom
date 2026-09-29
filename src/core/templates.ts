import type { TemplateId } from './types';

/**
 * Chat templates rendered by hand so the app controls every byte of the
 * prompt (required for prefix caching and for `>`-style action formatting).
 * Always call the raw completion endpoint with the rendered string; never let
 * the backend apply its own template.
 *
 * `assistantPrefix` lets the story continue mid-sentence: the text is placed
 * after the assistant header so the model completes it.
 */
export interface RenderedPrompt {
  prompt: string;
  /** Stop strings the provider should honour for this template. */
  stop: string[];
}

export function renderTemplate(id: TemplateId, system: string, user: string, assistantPrefix = ''): RenderedPrompt {
  switch (id) {
    case 'chatml':
      return {
        prompt:
          (system ? `<|im_start|>system\n${system}<|im_end|>\n` : '') +
          `<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n${assistantPrefix}`,
        stop: ['<|im_end|>', '<|im_start|>'],
      };
    case 'llama3':
      return {
        prompt:
          '<|begin_of_text|>' +
          (system ? `<|start_header_id|>system<|end_header_id|>\n\n${system}<|eot_id|>` : '') +
          `<|start_header_id|>user<|end_header_id|>\n\n${user}<|eot_id|>` +
          `<|start_header_id|>assistant<|end_header_id|>\n\n${assistantPrefix}`,
        stop: ['<|eot_id|>', '<|end_of_text|>'],
      };
    case 'mistral':
      // Mistral Small 3.x / v7 tokenizer style (SYSTEM_PROMPT + INST).
      return {
        prompt:
          (system ? `[SYSTEM_PROMPT]${system}[/SYSTEM_PROMPT]` : '') + `[INST]${user}[/INST]${assistantPrefix}`,
        stop: ['[INST]', '</s>'],
      };
    case 'gemma':
      return {
        prompt:
          `<start_of_turn>user\n${system ? `${system}\n\n` : ''}${user}<end_of_turn>\n<start_of_turn>model\n${assistantPrefix}`,
        stop: ['<end_of_turn>', '<start_of_turn>'],
      };
    case 'raw':
    default:
      return {
        prompt: `${system ? `${system}\n\n` : ''}${user}\n\n${assistantPrefix}`,
        stop: ['\n> '],
      };
  }
}

/**
 * Render only the OPENING of a prompt: template header, system turn, user-turn
 * opening and `userPrefix`, with no closing tokens. Used to warm the backend's
 * KV cache with the byte-stable prefix of the next turn (see engine.ts
 * `buildWarmupPrompt`). Must be a byte-for-byte prefix of what `renderTemplate`
 * produces for the same system text and a user text starting with `userPrefix`.
 */
export function renderPrefix(id: TemplateId, system: string, userPrefix: string): string {
  const full = renderTemplate(id, system, userPrefix + '\u0000').prompt;
  const cut = full.indexOf('\u0000');
  return cut >= 0 ? full.slice(0, cut) : full;
}

/**
 * Guess a template from a model id / GGUF name. Latitude's fine-tunes are
 * generally trained with ChatML regardless of base model; the Llama 3.3
 * based ones (Nova, Wayfarer Large) use the Llama 3 format and Equinox uses
 * Gemma's. Always confirm against the model card — docs/MODELS.md tracks
 * what has been verified.
 */
export function guessTemplate(modelId: string): TemplateId {
  const m = modelId.toLowerCase();
  if (/nova|wayfarer-large|hermes-3|llama-?3/.test(m)) return 'llama3';
  if (/gemma|equinox/.test(m)) return 'gemma';
  if (/muse|wayfarer|harbinger|hearthfire|madness|qwen|glm|deepseek/.test(m)) return 'chatml';
  if (/mistral/.test(m)) return 'mistral';
  return 'chatml';
}
