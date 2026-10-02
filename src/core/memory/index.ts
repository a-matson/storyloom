export * from './memoryBank';
export type { MaintenanceDeps } from './memoryJobs';
/** Idle-only work, loaded on first use to keep it off the start-up bundle. */
export const loadMemoryJobs = () => import('./memoryJobs');
