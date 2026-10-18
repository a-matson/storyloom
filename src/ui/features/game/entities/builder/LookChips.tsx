import { SHEET_KEYS, type SheetKey } from '@core/memory';
import { Pill } from '@ui/components/ui/pill';
import { SectionLabel } from '@ui/components/ui/section-label';

interface Props {
  looks: Readonly<Record<string, string>>;
  onSave: (k: SheetKey, v: string) => void;
}

/** What the builder stored, one chip per tag; removing a chip saves its key without it. */
export function LookChips({ looks, onSave }: Props) {
  const filled = SHEET_KEYS.filter((k) => looks[k]?.trim());
  if (filled.length === 0) return null;
  return (
    <>
      <SectionLabel>Looks</SectionLabel>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Looks">
        {filled.flatMap((k) => {
          const parts = [...new Set((looks[k] ?? '').split(',').map((t) => t.trim()))];
          return parts.map((t) => (
            <li key={`${k}-${t}`}>
              <Pill className="gap-1 normal-case tracking-normal">
                {k}: {t}
                <button
                  type="button"
                  className="cursor-pointer text-muted-foreground hover:text-prose"
                  aria-label={`Remove ${k}: ${t}`}
                  onClick={() => onSave(k, parts.filter((x) => x !== t).join(', '))}
                >
                  ×
                </button>
              </Pill>
            </li>
          ));
        })}
      </ul>
    </>
  );
}
