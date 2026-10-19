import { lazy, Suspense, useState } from 'react';
import type { Adventure } from '@core/model';
import { Button } from '@ui/components/ui/button';
import { downloadText, safeName } from '@ui/transferUi';
import { showAction } from '../entities/EntityDetails';

const CodexDrawer = lazy(async () => ({ default: (await import('./CodexDrawer')).CodexDrawer }));

export function CodexButton({ adventure }: { adventure: Adventure }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open codex</Button>
      {open && (
        <Suspense>
          <CodexDrawer
            adventure={adventure}
            onClose={() => setOpen(false)}
            onShow={showAction}
            onExport={(md) => downloadText(`${safeName(adventure.title)}.codex.md`, md, 'text/markdown')}
          />
        </Suspense>
      )}
    </>
  );
}
