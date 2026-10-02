import type { Adventure, AdventureSettings } from '@core/model';
import { MODEL_PRESETS } from '@core/text';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Select } from '@ui/components/ui/field';
import { TEMPLATES } from '@ui/features/setup/backends';
import { ModelSettings, NUMBER_INPUT } from './ModelSettings';
import { Section, Setting } from './Section';
import { SettingSwitch } from './SettingSwitch';

type Settings = AdventureSettings;
type Update = (patch: Partial<Settings>) => void;

const TEXT_STYLES: { value: Settings['textStyle']; label: string }[] = [
  { value: 'print', label: 'Print' },
  { value: 'clean', label: 'Clean' },
  { value: 'hacker', label: 'Hacker' },
];

function StoryGenerator({ s, update }: { s: Settings; update: Update }) {
  return (
    <Section title="Story generator" defaultOpen>
      <Setting label="Prompt template" htmlFor="tpl">
        <Select
          id="tpl"
          className="h-8 w-35"
          value={s.template}
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.value === e.target.value);
            if (t) update({ template: t.value });
          }}
        >
          {TEMPLATES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Setting>
      <Setting label="Apply preset" htmlFor="preset">
        <Select
          id="preset"
          className="h-8 w-45"
          defaultValue=""
          onChange={(e) => {
            const p = MODEL_PRESETS.find((x) => x.id === e.target.value);
            if (p) update({ template: p.template, model: { ...s.model, ...p.settings } });
          }}
        >
          <option value="">Choose…</option>
          {MODEL_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Setting>
      <p className="text-caption text-muted-foreground">Model: {s.modelId ?? 'as loaded in the backend'}. Change backends in Settings.</p>
    </Section>
  );
}

function MemorySystem({ s, update }: { s: Settings; update: Update }) {
  const memory = (patch: Partial<Settings['memory']>) => update({ memory: { ...s.memory, ...patch } });
  const context = (patch: Partial<Settings['context']>) => update({ context: { ...s.context, ...patch } });
  return (
    <Section title="Memory system" defaultOpen>
      <Setting label="Context length" htmlFor="ctx">
        <input
          id="ctx"
          className="w-30"
          type="range"
          min={1024}
          max={131072}
          step={1024}
          value={s.model.contextLength}
          onChange={(e) => update({ model: { ...s.model, contextLength: Number(e.target.value) } })}
        />
        <span className="font-mono text-caption">{(s.model.contextLength / 1024).toFixed(0)}k</span>
      </Setting>
      <SettingSwitch id="auto-summary" label="Auto summarization" checked={s.memory.autoSummary} onChange={(on) => memory({ autoSummary: on })} />
      <SettingSwitch id="memory-bank" label="Memory bank" checked={s.memory.memoryBank} onChange={(on) => memory({ memoryBank: on })} />
      <Setting label="Bank size" htmlFor="bank">
        <input
          id="bank"
          className={NUMBER_INPUT}
          type="number"
          min={10}
          max={2000}
          step={10}
          value={s.memory.bankSize}
          onChange={(e) => memory({ bankSize: Number(e.target.value) })}
        />
      </Setting>
      <SettingSwitch
        id="cache-stable"
        label="Cache-stable layout"
        title="History before cards/memories so the backend reuses its KV cache"
        checked={s.context.cacheStableLayout}
        onChange={(on) => context({ cacheStableLayout: on })}
      />
      <SettingSwitch
        id="cache-warming"
        label="Warm cache between turns"
        title="After each turn, prefill the next turn's stable prefix so the first token arrives faster"
        checked={s.context.cacheWarming ?? true}
        onChange={(on) => context({ cacheWarming: on })}
      />
      <SettingSwitch
        id="retry-prefetch"
        label="Prefetch a retry"
        title="Generate one retry alternative in the background on a second slot (needs -np 2 and spare VRAM)"
        checked={s.context.retryPrefetch ?? false}
        onChange={(on) => context({ retryPrefetch: on })}
      />
    </Section>
  );
}

function Feedback({ s, update }: { s: Settings; update: Update }) {
  const context = (patch: Partial<Settings['context']>) => update({ context: { ...s.context, ...patch } });
  return (
    <Section title="Testing & feedback">
      <SettingSwitch id="raw-output" label="Raw model output" checked={s.context.rawOutput} onChange={(on) => context({ rawOutput: on })} />
      <SettingSwitch
        id="context-warning"
        label="Context warning"
        title="Red ⚠ on the context meter when story cards or plot components did not fit"
        checked={s.context.contextWarning ?? true}
        onChange={(on) => context({ contextWarning: on })}
      />
    </Section>
  );
}

function Appearance({ s, update }: { s: Settings; update: Update }) {
  return (
    <Section title="Appearance">
      <Setting label="Text style" htmlFor="ts">
        <Select
          id="ts"
          className="h-8 w-35"
          value={s.textStyle}
          onChange={(e) => {
            const t = TEXT_STYLES.find((x) => x.value === e.target.value);
            if (t) update({ textStyle: t.value });
          }}
        >
          {TEXT_STYLES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Setting>
    </Section>
  );
}

export function GameplayTab({ adventure, api }: { adventure: Adventure; api: GameApi }) {
  const s = adventure.settings;
  return (
    <>
      <StoryGenerator s={s} update={api.updateSettings} />
      <MemorySystem s={s} update={api.updateSettings} />
      <ModelSettings model={s.model} onChange={(patch) => api.updateSettings({ model: { ...s.model, ...patch } })} />
      <Feedback s={s} update={api.updateSettings} />
      <Appearance s={s} update={api.updateSettings} />
    </>
  );
}
