import type { Adventure, AdventureSettings } from '@core/model';
import { MODEL_PRESETS } from '@core/text';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Select } from '@ui/components/ui/field';
import { TEMPLATES } from '@ui/features/setup/backends';
import { ModelSettings } from './ModelSettings';
import { NumberInput } from './NumberInput';
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
      <SettingSwitch
        id="contradiction-check"
        label="Check each turn for contradictions"
        title="One extra helper call after each turn (a few seconds on slot 1) checks the output against canon, pinned facts and the scene"
        checked={s.memory.contradictionCheck ?? false}
        onChange={(on) => memory({ contradictionCheck: on })}
      />
      <Setting label="Bank size" htmlFor="bank">
        <NumberInput
          id="bank"
          min={10}
          max={2000}
          step={10}
          value={s.memory.bankSize}
          onCommit={(v) => {
            if (v !== undefined) memory({ bankSize: v });
          }}
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

const IMAGE_NUMBERS: { label: string; key: 'width' | 'height' | 'steps' | 'cfgScale'; step: number; min: number }[] = [
  { label: 'Width', key: 'width', step: 64, min: 256 },
  { label: 'Height', key: 'height', step: 64, min: 256 },
  { label: 'Steps', key: 'steps', step: 1, min: 1 },
  { label: 'CFG scale', key: 'cfgScale', step: 0.5, min: 1 },
];

/** Blank means "whatever the image server already has". */
const text = (value: string) => (value.trim() === '' ? undefined : value);

const IMAGE_TEXT_INPUT = 'h-8 w-45 rounded-sm border border-border bg-bar px-2 text-caption';

function Images({ s, update }: { s: Settings; update: Update }) {
  const image = (patch: Partial<Settings['image']>) => update({ image: { ...s.image, ...patch } });
  return (
    <Section title="Images">
      <Setting label="Checkpoint" htmlFor="img-model" title="Blank uses whatever the image server has loaded; names are listed by Test in Settings">
        <input id="img-model" className={IMAGE_TEXT_INPUT} value={s.image.model ?? ''} onChange={(e) => image({ model: text(e.target.value) })} />
      </Setting>
      {IMAGE_NUMBERS.map((n) => (
        <Setting key={n.key} label={n.label} htmlFor={`img-${n.key}`}>
          <NumberInput
            id={`img-${n.key}`}
            step={n.step}
            min={n.min}
            value={s.image[n.key]}
            onCommit={(v) => {
              if (v !== undefined) image({ [n.key]: v });
            }}
          />
        </Setting>
      ))}
      <Setting label="Negative prompt" htmlFor="img-neg">
        <input
          id="img-neg"
          className={IMAGE_TEXT_INPUT}
          value={s.image.negativePrompt ?? ''}
          onChange={(e) => image({ negativePrompt: text(e.target.value) })}
        />
      </Setting>
      <SettingSwitch
        id="img-portraits"
        label="Character portraits"
        title="Drawn between turns, one character at a time"
        checked={s.image.portraits}
        onChange={(on) => image({ portraits: on })}
      />
      <Setting label="Portrait style" htmlFor="img-style" title="Added to every portrait prompt; blank picks one from the adventure's tags">
        <input
          id="img-style"
          className={IMAGE_TEXT_INPUT}
          value={s.image.portraitStyle ?? ''}
          onChange={(e) => image({ portraitStyle: text(e.target.value) })}
        />
      </Setting>
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
      <Images s={s} update={api.updateSettings} />
      <Feedback s={s} update={api.updateSettings} />
      <Appearance s={s} update={api.updateSettings} />
    </>
  );
}
