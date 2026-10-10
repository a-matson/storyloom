import { describe, expect, it } from 'vitest';
import type { AppSettings } from '@core/model';
import { DEFAULT_APP_SETTINGS } from '@app/services';
import { draftSettings } from '@ui/features/setup/draft';

const current = DEFAULT_APP_SETTINGS.providers[0]!;
const app: AppSettings = { ...DEFAULT_APP_SETTINGS, defaults: { ...DEFAULT_APP_SETTINGS.defaults, modelId: 'stored.gguf', template: 'llama3' } };
const choice = {
  current,
  kind: current.kind,
  url: current.baseUrl,
  theme: app.theme,
  speech: app.speech,
  speakerAvatars: false,
  health: null,
  utility: undefined,
  image: undefined,
};

describe('draftSettings', () => {
  it('keeps the tested model when the backend is unchanged and untested', () => {
    const d = draftSettings(app, { ...choice, theme: 'sepia' });
    expect(d.defaults.modelId).toBe('stored.gguf');
    expect(d.defaults.template).toBe('llama3');
  });

  it('a failed test counts as untested', () => {
    expect(draftSettings(app, { ...choice, health: { ok: false } }).defaults.modelId).toBe('stored.gguf');
  });

  it('drops the model when the URL changes untested', () => {
    const d = draftSettings(app, { ...choice, url: 'http://localhost:9000' });
    expect(d.defaults.modelId).toBeUndefined();
    expect(d.defaults.template).toBe('llama3');
  });

  it('a passing test sets the model and its template', () => {
    const d = draftSettings(app, { ...choice, health: { ok: true, modelId: 'gemma-3.gguf' } });
    expect(d.defaults.modelId).toBe('gemma-3.gguf');
    expect(d.defaults.template).toBe('gemma');
  });
});
