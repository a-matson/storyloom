// Only `loadMemoryJobs`: importing more from the barrel splits it out of the start-up chunk.
import { loadMemoryJobs } from '@core/memory';
import type { GameSession } from './session';

type Jobs = Awaited<ReturnType<typeof loadMemoryJobs>>;

/** The jobs chunk, unless loading fails or a turn is running (a notice then would claim an edit `mutate` drops). */
async function jobsFor(host: GameSession, what: string): Promise<Jobs | undefined> {
  const jobs = await loadMemoryJobs().catch((err: unknown) => host.onError(`Could not ${what}: ${String(err)}`));
  return jobs && !host.getSnapshot().busy ? jobs : undefined;
}

const unread = (host: GameSession, text: string, hint: string) => host.emit({ notice: `Could not read "${text.trim()}": try ${hint}` });

/** Sets `scene.time`; the scene line tells the model, nothing asks it. Never an action. */
async function setClock(host: GameSession, text: string, hint: string, read: (jobs: Jobs) => ReturnType<Jobs['parseTime']>): Promise<void> {
  const jobs = await jobsFor(host, 'set the time');
  if (!jobs) return;
  const time = read(jobs);
  if (!time) return unread(host, text, hint);
  host.mutate((_, adv) => (adv.plot = { ...adv.plot, scene: { ...(adv.plot.scene ?? { present: [] }), time } }));
  host.emit({ notice: `Now ${jobs.formatTime(time)}` });
}

/** `/wait 3 hours`, `/wait until night`. */
export const waitFor = (host: GameSession, text: string) =>
  setClock(host, text, '/wait 3 hours', (jobs) => {
    const by = jobs.parseWait(text);
    return by && jobs.advance(host.adv.plot.scene?.time, by);
  });

/** `/time evening, day 2`. */
export const setTime = (host: GameSession, text: string) =>
  setClock(host, text, '/time evening, day 2', (jobs) => jobs.parseTime(text, host.adv.plot.scene?.time));

/** `/travel the docks [alone]`: a place no card knows gets one, as a turn read's would. Never an action. */
export async function travelTo(host: GameSession, text: string): Promise<void> {
  const jobs = await jobsFor(host, 'travel');
  if (!jobs) return;
  const to = jobs.parseTravel(text);
  if (!to) return unread(host, text, '/travel the docks');
  host.mutate((log, adv) => {
    const at = log.actions.length;
    jobs.notePlace(adv, to.place, at);
    adv.plot = jobs.travel(adv.plot, adv.entities, to.place, at, to.alone);
  });
  host.emit({ notice: `Travelled to ${to.place}${to.alone ? ', alone' : ''}` });
}
