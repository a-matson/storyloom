export type ImageJobKind = 'see' | 'cover' | 'portrait';

interface Job {
  kind: ImageJobKind;
  run: () => Promise<void>;
}

/**
 * Every txt2img in the page, one at a time. KoboldCpp renders one image at a time, so a second
 * request in flight only waits on the server with its timeout running. A See image or cover the
 * player asked for goes before queued portraits. Start a job's timeout inside `run`, not before.
 */
export class ImageQueue {
  private readonly jobs: Job[] = [];
  private running = false;

  enqueue<T>(kind: ImageJobKind, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({ kind, run: () => Promise.resolve().then(run).then(resolve, reject) });
      void this.next();
    });
  }

  private async next(): Promise<void> {
    if (this.running) return;
    const i = this.jobs.findIndex((j) => j.kind !== 'portrait');
    const [job] = this.jobs.splice(i < 0 ? 0 : i, 1);
    if (!job) return;
    this.running = true;
    await job.run();
    this.running = false;
    void this.next();
  }
}

/** The page's queue: the image server is one per page, not one per adventure. */
export const imageQueue = new ImageQueue();
