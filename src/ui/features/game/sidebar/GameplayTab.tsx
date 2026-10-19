import type { Adventure, AdventureSettings, AppSettings } from '@core/model';
import { MODEL_PRESETS } from '@core/text';
import type { GameApi } from '@ui/hooks/useGameSession';
import { Input, Select } from '@ui/components/ui/field';
import { TEMPLATES } from '@ui/features/setup/backends';
import { DiceSwitch } from './DiceSwitch';
import { DirectorSwitch } from './DirectorSwitch';
import { ImagesSection } from './ImagesSection';
import { MemoryPreset } from './MemoryPreset';
import { ModelSettings } from './ModelSettings';
import { NeverWrite } from './NeverWrite';
import { NumberInput } from './NumberInput';
import { Section, Setting } from './Section';
import { MODEL_HELP } from './settingHelp';
import { SettingSwitch } from './SettingSwitch';
import { StateRead } from './StateRead';

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
      <SettingSwitch
        id="dynamic-samplers"
        label="Dynamic samplers"
        help="Each turn nudges the loaded model's preset samplers (temperature, top-k, seed) instead of using Model settings, against sameness in long stories; the prompt and cache are unaffected"
        checked={s.model.dynamic}
        onChange={(on) => update({ model: { ...s.model, dynamic: on } })}
      />
      <SettingSwitch
        id="auto-retry"
        label="Re-roll repeated replies"
        help="A reply that is empty, copies an earlier passage or writes your actions for you is generated once more with a note; the first stays in the retry stack"
        checked={s.model.autoRetry}
        onChange={(on) => update({ model: { ...s.model, autoRetry: on } })}
      />
      <Setting
        label="Content"
        htmlFor="content"
        help="Sent in every system prompt. Unrestricted: adult fiction, nothing softened or skipped. Custom: your own text."
      >
        <Select
          id="content"
          className="h-8 w-35"
          value={s.content}
          onChange={(e) => update({ content: e.target.value === 'custom' ? 'custom' : 'unrestricted' })}
        >
          <option value="unrestricted">Unrestricted</option>
          <option value="custom">Custom</option>
        </Select>
      </Setting>
      {s.content === 'custom' && (
        <Input
          aria-label="Custom content text"
          placeholder="Blank sends nothing"
          value={s.contentText ?? ''}
          onChange={(e) => update({ contentText: e.target.value })}
        />
      )}
      <NeverWrite value={s.bannedPhrases} onChange={(bannedPhrases) => update({ bannedPhrases })} />
      <p className="text-caption text-muted-foreground">Model: {s.modelId ?? 'as loaded in the backend'}. Change backends in Settings.</p>
    </Section>
  );
}

function MemorySystem({ s, update }: { s: Settings; update: Update }) {
  const memory = (patch: Partial<Settings['memory']>) => update({ memory: { ...s.memory, ...patch } });
  const context = (patch: Partial<Settings['context']>) => update({ context: { ...s.context, ...patch } });
  return (
    <Section title="Memory system" defaultOpen>
      <Setting label="Context length" htmlFor="ctx" help={MODEL_HELP.contextLength.help}>
        <input
          id="ctx"
          aria-describedby="ctx-help"
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
      <MemoryPreset value={s.memory} onChange={(m) => update({ memory: m })} />
      <SettingSwitch id="auto-summary" label="Auto summarization" checked={s.memory.autoSummary} onChange={(on) => memory({ autoSummary: on })} />
      <SettingSwitch id="memory-bank" label="Memory bank" checked={s.memory.memoryBank} onChange={(on) => memory({ memoryBank: on })} />
      <SettingSwitch
        id="contradiction-check"
        label="Check each turn for contradictions"
        help="Locked values of who is present are always checked (one helper call on slot 1); this adds the scene line"
        checked={s.memory.contradictionCheck ?? false}
        onChange={(on) => memory({ contradictionCheck: on })}
      />
      <SettingSwitch
        id="entity-facts"
        label="Send entity facts and cards"
        help="Now-lines for who is in the scene and identities for items and who is named; off, only pinned facts of who is here or named; rules and the scene line are sent either way"
        checked={s.memory.entityFacts}
        onChange={(on) => memory({ entityFacts: on })}
      />
      <SettingSwitch
        id="introductions"
        label="Create character cards as they are introduced"
        help="One short helper call on slot 1 after a turn that names someone new"
        checked={s.memory.introductions}
        onChange={(on) => memory({ introductions: on })}
      />
      <StateRead value={s.memory.stateRead} onChange={(stateRead) => memory({ stateRead })} />
      <Setting label="Bank size" htmlFor="bank" help="Most memories the bank keeps for this adventure. Default 200.">
        <NumberInput
          id="bank"
          describedBy="bank-help"
          min={10}
          max={2000}
          step={10}
          value={s.memory.bankSize}
          onCommit={(v) => v !== undefined && memory({ bankSize: v })}
        />
      </Setting>
      <SettingSwitch
        id="cache-stable"
        label="Cache-stable layout"
        help="History before cards/memories so the backend reuses its KV cache"
        checked={s.context.cacheStableLayout}
        onChange={(on) => context({ cacheStableLayout: on })}
      />
      <SettingSwitch
        id="cache-warming"
        label="Warm cache between turns"
        help="After each turn, prefill the next turn's stable prefix so the first token arrives faster"
        checked={s.context.cacheWarming ?? true}
        onChange={(on) => context({ cacheWarming: on })}
      />
      <SettingSwitch
        id="retry-prefetch"
        label="Prefetch a retry"
        help="Generate one retry alternative in the background on a second slot (needs -np 2 and spare VRAM)"
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
        help="Red ⚠ on the context meter when story cards or plot components did not fit"
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

export function GameplayTab({
  adventure,
  api,
  app,
  onAppChange,
}: {
  adventure: Adventure;
  api: GameApi;
  app: AppSettings;
  onAppChange: (next: AppSettings) => void;
}) {
  const s = adventure.settings;
  return (
    <>
      <StoryGenerator s={s} update={api.updateSettings} />
      <DiceSwitch adventure={adventure} api={api} />
      <DirectorSwitch api={api} />
      <MemorySystem s={s} update={api.updateSettings} />
      <ModelSettings model={s.model} onChange={(patch) => api.updateSettings({ model: { ...s.model, ...patch } })} />
      <ImagesSection s={s} app={app} onAppChange={onAppChange} update={api.updateSettings} />
      <Feedback s={s} update={api.updateSettings} />
      <Appearance s={s} update={api.updateSettings} />
    </>
  );
}
