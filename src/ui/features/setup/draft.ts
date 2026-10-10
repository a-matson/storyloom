import type { AppSettings, ProviderConfig } from '@core/model';
import type { ProviderHealth } from '@core/ports';
import { findPreset, guessTemplate } from '@core/text';
import { BACKENDS } from './backends';

export interface Choice {
  current: ProviderConfig;
  kind: ProviderConfig['kind'];
  url: string;
  theme: AppSettings['theme'];
  speech: AppSettings['speech'];
  speakerAvatars: boolean;
  health: ProviderHealth | null;
  utility: ProviderConfig | undefined;
  image: ProviderConfig | undefined;
}

const normalizeUrl = (url: string) => url.trim().replace(/\/$/, '');

/** App settings with the chosen backend as default; a tested model also sets template, sampler preset and context size. */
export function draftSettings(app: AppSettings, { current, kind, url, theme, speech, speakerAvatars, health, utility, image }: Choice): AppSettings {
  const cfg: ProviderConfig = {
    ...current,
    kind,
    baseUrl: normalizeUrl(url),
    name: `${BACKENDS.find((k) => k.kind === kind)?.name ?? kind} (${url})`,
  };
  const tested = health?.ok && health.modelId ? health.modelId : undefined;
  // Settings save on every change, so an untested edit elsewhere must not wipe the model.
  const unchanged = current.kind === kind && normalizeUrl(current.baseUrl) === cfg.baseUrl;
  const modelId = tested ?? (unchanged ? app.defaults.modelId : undefined);
  const contextSize = health?.contextSize ?? 0;
  return {
    ...app,
    theme,
    speech,
    speakerAvatars,
    providers: [
      cfg,
      ...app.providers.filter((p) => p.id !== cfg.id && p.role !== 'utility' && p.role !== 'image'),
      ...(utility ? [{ ...utility, baseUrl: normalizeUrl(utility.baseUrl) }] : []),
      ...(image ? [{ ...image, baseUrl: normalizeUrl(image.baseUrl) }] : []),
    ],
    defaultProviderId: cfg.id,
    defaults: {
      ...app.defaults,
      providerId: cfg.id,
      modelId,
      template: tested === undefined ? app.defaults.template : guessTemplate(tested),
      model: {
        ...app.defaults.model,
        ...(tested === undefined ? {} : findPreset(tested)?.settings),
        contextLength: contextSize > 0 ? Math.min(contextSize, 131072) : app.defaults.model.contextLength,
      },
    },
  };
}
