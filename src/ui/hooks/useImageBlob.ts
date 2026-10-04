import { useEffect, useState } from 'react';
import { storage } from '@app/services';

/** Object URL for a stored image blob; revoked when the id changes or the block unmounts. `ownerId` is an adventure or a scenario. */
export function useImageBlob(ownerId: string, imageId: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (imageId === undefined) return undefined;
    let objectUrl: string | undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const blob = await storage.getImage(ownerId, imageId);
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        console.warn('could not read the stored image', e);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
      setUrl(undefined);
    };
  }, [ownerId, imageId]);
  return url;
}
