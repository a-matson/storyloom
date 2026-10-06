import type { TurnTrace } from '@core/model';
import { Pill } from '@ui/components/ui/pill';
import { SectionLabel } from '@ui/components/ui/section-label';

const mono = 'font-mono text-caption';
const muted = 'text-muted-foreground';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-caption">
      <span className={`w-28 shrink-0 ${muted}`}>{label}</span>
      <span className={`${mono} text-prose`}>{children}</span>
    </div>
  );
}

const ms = (n: number) => `${(n / 1000).toFixed(2)} s`;

/** Everything about one generation except the prompt text. */
export function TraceSummary({ trace: t }: { trace: TurnTrace }) {
  const sampler = Object.entries(t.sampler).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0));
  const notes = [...t.warnings, ...t.scriptLogs];
  return (
    <>
      <div className="flex items-center gap-2">
        <Pill tone={t.outcome === 'done' ? 'auto' : 'plain'}>{t.outcome}</Pill>
        <Pill>{t.kind}</Pill>
        {t.errorKind && <Pill>{t.errorKind}</Pill>}
        {t.scriptCache && t.scriptCache !== 'kept' && (
          <Pill title={t.scriptCache === 'rewritten' ? 'a script replaced the whole prompt' : 'a script changed a cached section'}>uncached: script</Pill>
        )}
        {t.stopReason && <span className={`text-caption ${muted}`}>stopped: {t.stopReason}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <Row label="Provider">
          {t.providerId}
          {t.modelId ? ` · ${t.modelId}` : ''}
        </Row>
        <Row label="Template">{t.template}</Row>
        <Row label="Time">
          {ms(t.timings.totalMs)}
          {t.timings.ttftMs === undefined ? '' : ` · first token ${ms(t.timings.ttftMs)}`}
        </Row>
        <Row label="Prompt">
          {t.promptChars.toLocaleString()} chars · {t.promptHash}
        </Row>
        <Row label="History">{t.historyRange ? `actions ${t.historyRange.from + 1}–${t.historyRange.to}` : 'none'}</Row>
        <Row label="Cards">
          {t.triggeredCardIds.length} triggered{t.droppedCardIds.length > 0 ? `, ${t.droppedCardIds.length} dropped` : ''}
        </Row>
        <Row label="Memories">{t.memoryIds.length} used</Row>
        {t.entitiesUsed && <Row label="Entities">{t.entitiesUsed.length} used</Row>}
        {t.droppedSections.length > 0 && <Row label="Dropped">{t.droppedSections.join(', ')}</Row>}
      </div>
      <SectionLabel>Sections</SectionLabel>
      <div className="flex flex-col gap-1">
        {t.sections.map((s) => (
          <div key={s.kind} className="flex items-center gap-2 text-caption">
            <span className="grow">{s.kind}</span>
            {s.cacheable && <Pill tone="auto">cached prefix</Pill>}
            {s.trimmed && <Pill>trimmed</Pill>}
            <span className={`${mono} w-16 text-right`}>{s.tokens.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <SectionLabel>Sampler</SectionLabel>
      <div className={`${mono} flex flex-wrap gap-x-4 gap-y-1 text-prose`}>
        {sampler.map(([k, v]) => (
          <span key={k}>
            {k} {String(v)}
          </span>
        ))}
        {t.sampler.stop.length > 0 && <span>stop {JSON.stringify(t.sampler.stop)}</span>}
      </div>
      {notes.length > 0 && (
        <>
          <SectionLabel>Warnings and script logs</SectionLabel>
          <div className={`${mono} whitespace-pre-wrap text-prose`}>{notes.join('\n')}</div>
        </>
      )}
    </>
  );
}
