import type { ContextBuildResult, ContextSection } from '@core/context';
import { Pill } from '@ui/components/ui/pill';
import { SectionLabel } from '@ui/components/ui/section-label';
import { SECTION_BG, SECTION_LABEL } from '../sections';

const muted = 'text-muted-foreground';
const mono = 'font-mono text-caption';

function SectionRow({ s, result }: { s: ContextSection; result: ContextBuildResult }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-bar px-3 py-2">
      <span className={`size-2 rounded-[2px] ${SECTION_BG[s.kind]}`} />
      <span className="grow font-medium">
        {SECTION_LABEL[s.kind]}
        {s.kind === 'history' && result.historyRange && (
          <span className={muted}>
            {' '}
            · actions {result.historyRange.from + 1}–{result.historyRange.to}
          </span>
        )}
        {s.kind === 'storyCards' && <span className={muted}> · {result.triggeredCards.length} triggered</span>}
        {s.kind === 'memories' && <span className={muted}> · {result.usedMemories.length} retrieved</span>}
      </span>
      {s.cacheable && <Pill tone="auto">cached prefix</Pill>}
      {s.trimmed && <Pill>trimmed</Pill>}
      <span className={`${mono} w-16 text-right text-prose`}>{s.tokens.toLocaleString()}</span>
    </div>
  );
}

function Cards({ result }: { result: ContextBuildResult }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>Triggered cards</SectionLabel>
      {result.triggeredCards.map((m) => (
        <div key={m.card.id} className="flex items-center gap-2 text-caption text-prose">
          <span className="font-medium">{m.card.name}</span>
          <span className={muted}>
            hit “{m.triggers.join('”, “')}” {m.lastHitDistance === 0 ? 'in the last action' : `${m.lastHitDistance} actions ago`} · frequency {m.hits}
          </span>
        </div>
      ))}
      {result.droppedCards.map((m) => (
        <div key={m.card.id} className={`flex items-center gap-2 text-caption ${muted}`}>
          <span>{m.card.name}</span>
          <span>did not fit</span>
        </div>
      ))}
    </div>
  );
}

/** Budget bar, per-section tokens, triggered cards, retrieved memories and builder warnings. */
export function BudgetView({ result }: { result: ContextBuildResult }) {
  const total = result.budget.total || 1;
  return (
    <>
      <div className="flex h-[18px] overflow-hidden rounded-[5px] bg-secondary">
        {result.sections.map((s) => (
          <span
            key={s.kind}
            className={`block h-full ${SECTION_BG[s.kind]}`}
            style={{ width: `${(s.tokens / total) * 100}%` }}
            title={`${SECTION_LABEL[s.kind]} ${s.tokens}`}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {result.sections.map((s) => (
          <SectionRow key={s.kind} s={s} result={result} />
        ))}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className={muted}>Free</span>
          <span className="grow" />
          <span className={`${mono} ${muted}`}>{result.budget.free.toLocaleString()}</span>
        </div>
      </div>
      {result.triggeredCards.length > 0 && <Cards result={result} />}
      {result.usedMemories.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionLabel>Memories used</SectionLabel>
          {result.usedMemories.map((m) => (
            <div key={m.id} className="text-caption text-prose">
              <span className={`${mono} ${muted}`}>
                actions {m.fromAction + 1}–{m.toAction}
              </span>{' '}
              {m.text}
            </div>
          ))}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionLabel>Warnings</SectionLabel>
          {result.warnings.map((w) => (
            <div key={w} className="text-caption text-warning">
              {w}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
