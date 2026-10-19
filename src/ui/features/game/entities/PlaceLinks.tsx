import type { entityEdits } from '@app/session/entities';
import type { Entity } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { Input, Select } from '@ui/components/ui/field';

type Edits = ReturnType<typeof entityEdits>;

/** `p`'s ways to other places, stored on either end, with remove; and a row to add one. */
export function PlaceLinks({ p, places, edits }: { p: Entity; places: Entity[]; edits: Edits }) {
  const ways = places.flatMap((o) => {
    const c = o === p ? undefined : (p.connectedTo?.find((x) => x.id === o.id) ?? o.connectedTo?.find((x) => x.id === p.id));
    return c ? [{ o, via: c.via }] : [];
  });
  return (
    <>
      {ways.map(({ o, via }) => (
        <span key={o.id} className="flex items-center gap-1.5">
          <span className="grow">
            to {o.name}
            {via && <span className="text-muted-foreground"> (through {via})</span>}
          </span>
          <Button variant="ghost" aria-label={`Remove the way from ${p.name} to ${o.name}`} onClick={() => void edits.unlink(p.id, o.id)}>
            ✕
          </Button>
        </span>
      ))}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const to = data.get('to');
          const via = data.get('via');
          if (typeof to === 'string' && to) void edits.link(p.id, to, typeof via === 'string' ? via : undefined);
          e.currentTarget.reset();
        }}
      >
        <Select name="to" aria-label={`${p.name} leads to`} className="text-caption grow" defaultValue="">
          <option value="">Leads to…</option>
          {places
            .filter((o) => o !== p && !ways.some((w) => w.o === o))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </Select>
        <Input name="via" aria-label={`Way from ${p.name} goes through`} placeholder="through…" className="text-caption w-24" />
        <Button variant="ghost" type="submit" aria-label={`Link ${p.name}`}>
          Link
        </Button>
      </form>
    </>
  );
}
