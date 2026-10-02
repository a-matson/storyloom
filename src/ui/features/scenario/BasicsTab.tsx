import { useId, useState } from 'react';
import { Input } from '@ui/components/ui/field';
import { TextField, type TabProps } from './fields';

const parseTags = (text: string) =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

export function BasicsTab({ draft, update }: TabProps) {
  const titleId = useId();
  const tagsId = useId();
  // Raw text so a trailing comma survives typing; the draft keeps the parsed list.
  const [tags, setTags] = useState(draft.tags.join(', '));
  return (
    <>
      <section className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-control font-semibold">
          Title
        </label>
        <Input id={titleId} value={draft.title} onChange={(e) => update({ title: e.target.value })} />
      </section>
      <TextField label="Description" hint="shown in the library" value={draft.description} onChange={(description) => update({ description })} />
      <section className="flex flex-col gap-2">
        <label htmlFor={tagsId} className="text-control font-semibold">
          Tags
        </label>
        <Input
          id={tagsId}
          placeholder="fantasy, mystery"
          value={tags}
          onChange={(e) => {
            setTags(e.target.value);
            update({ tags: parseTags(e.target.value) });
          }}
        />
      </section>
    </>
  );
}
