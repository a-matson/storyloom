import type { ModelSettings, TemplateId } from '../model/types';

/**
 * Sampler presets for the open-weight storytelling fine-tunes AI Dungeon
 * publishes (Hugging Face: LatitudeGames/*) plus a few community models.
 * Values are the community example settings from the AI Dungeon guidebook;
 * treat them as starting points.
 */
export interface ModelPreset {
  id: string;
  name: string;
  params: string;
  hf: string;
  base: string;
  template: TemplateId;
  /** Substring to recognise the model from a GGUF file name. */
  match: RegExp;
  /** Samplers only: context and response length are budgets, not model traits. */
  settings: Omit<ModelSettings, 'contextLength' | 'responseLength'>;
  notes: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'muse-12b',
    name: 'Muse 12B',
    params: '12B',
    hf: 'LatitudeGames/Muse-12B',
    base: 'Mistral-Nemo-Base-2407',
    template: 'chatml',
    match: /muse/i,
    settings: { temperature: 1, topK: 250, topP: 1, presencePenalty: 0.25, frequencyPenalty: 0 },
    notes: 'Character- and relationship-focused; good coherence over long contexts.',
  },
  {
    id: 'wayfarer-2-12b',
    name: 'Wayfarer Small 2 (12B)',
    params: '12B',
    hf: 'LatitudeGames/Wayfarer-2-12B',
    base: 'Mistral-Nemo-Base-2407',
    template: 'chatml',
    match: /wayfarer-?2|wayfarer-12b/i,
    settings: { temperature: 1.1, topK: 300, topP: 0.85, presencePenalty: 0.5, frequencyPenalty: 0.2 },
    notes: 'Consequences, combat, death. Second person. Use Do/Say often to fight repetition.',
  },
  {
    id: 'harbinger-24b',
    name: 'Harbinger 24B',
    params: '24B',
    hf: 'LatitudeGames/Harbinger-24B',
    base: 'Mistral-Small-3.1-24B-Instruct-2503',
    template: 'chatml',
    match: /harbinger/i,
    settings: { temperature: 1.3, topK: 500, topP: 0.95, presencePenalty: 0.25, frequencyPenalty: 0 },
    notes: "Wayfarer lineage with DPO polish; strong Author's Note handling and mid-sentence continuation.",
  },
  {
    id: 'hearthfire-24b',
    name: 'Hearthfire 24B',
    params: '24B',
    hf: 'LatitudeGames/Hearthfire-24B',
    base: 'Mistral-Small-3.2-24B-Instruct-2506',
    template: 'chatml',
    match: /hearthfire/i,
    settings: { temperature: 0.9, topK: 75, topP: 0.92, presencePenalty: 1.1, frequencyPenalty: 0 },
    notes: 'Slice-of-life, atmospheric, happy to linger.',
  },
  {
    id: 'equinox-31b',
    name: 'Equinox 31B',
    params: '31B',
    hf: 'LatitudeGames/Equinox-31B',
    base: 'gemma-4-31B-it',
    template: 'gemma',
    match: /equinox/i,
    settings: { temperature: 1, topK: 400, topP: 0.9, presencePenalty: 0.25, frequencyPenalty: 0.1 },
    notes: 'Gemma-based; second-person continuation, character continuity, fewer refusals.',
  },
  {
    id: 'nova-70b',
    name: 'Nova 70B',
    params: '70B',
    hf: 'LatitudeGames/Nova-70B-Llama-3.3',
    base: 'Llama-3.3-70B-Instruct',
    template: 'llama3',
    match: /nova/i,
    settings: { temperature: 1, topK: 400, topP: 0.7, presencePenalty: 0.8, frequencyPenalty: 0 },
    notes: 'Muse training on a 70B base. Needs ~42 GB at Q4.',
  },
  {
    id: 'wayfarer-large-70b',
    name: 'Wayfarer Large 70B',
    params: '70B',
    hf: 'LatitudeGames/Wayfarer-Large-70B-Llama-3.3',
    base: 'Llama-3.3-70B-Instruct',
    template: 'llama3',
    match: /wayfarer-large/i,
    settings: { temperature: 1, topK: 500, topP: 0.95, presencePenalty: 0.5, frequencyPenalty: 0 },
    notes: 'Unforgiving combat and consequence at 70B scale.',
  },
  {
    id: 'lunaris-8b',
    name: 'Fable (Lunaris 8B)',
    params: '8B',
    hf: 'Sao10K/L3-8B-Lunaris-v1',
    base: 'Llama-3-8B',
    template: 'llama3',
    match: /lunaris/i,
    settings: { temperature: 1.1, topK: 100, topP: 0.95, presencePenalty: 0.25, frequencyPenalty: 0 },
    notes: 'Lightweight roleplay model; fits 8 GB cards with room for context.',
  },
];

export function findPreset(modelId: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) => p.match.test(modelId));
}
