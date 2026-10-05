import type { AppSettings, ProviderConfig } from '@core/model';
import type { ProviderHealth } from '@core/ports';
import { findPreset, guessTemplate } from '@core/text';
import { BACKENDS } from './backends';

interface Choice {
  current: ProviderConfig;
  kind: ProviderConfig['kind'];
  url: string;
  theme: AppSettings['theme'];
  speech: AppSettings['speech'];
  health: ProviderHealth | null;
  utility: ProviderConfig | undefined;
  image: ProviderConfig | undefined;
}

const normalizeUrl = (url: string) => url.trim().replace(/\/$/, '');

/** App settings with the chosen backend as default; a tested model also sets template, sampler preset and context size. */
export function draftSettings(app: AppSettings, { current, kind, url, theme, speech, health, utility, image }: Choice): AppSettings {
  const cfg: ProviderConfig = {
    ...current,
    kind,
    baseUrl: normalizeUrl(url),
    name: `${BACKENDS.find((k) => k.kind === kind)?.name ?? kind} (${url})`,
  };
  const modelId = health?.modelId === '' ? undefined : health?.modelId;
  const contextSize = health?.contextSize ?? 0;
  return {
    ...app,
    theme,
    speech,
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
      template: modelId === undefined ? app.defaults.template : guessTemplate(modelId),
      model: {
        ...app.defaults.model,
        ...(modelId === undefined ? {} : findPreset(modelId)?.settings),
        contextLength: contextSize > 0 ? Math.min(contextSize, 131072) : app.defaults.model.contextLength,
      },
    },
  };
}
