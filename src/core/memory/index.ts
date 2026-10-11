export * from './memoryBank';
export { followLog } from './invalidate';
export { appearanceOf, currentStates, isCurrentState, setState } from './looks';
export type { MaintenanceDeps } from './memoryJobs';
/** Idle-only work, loaded on first use to keep it off the start-up bundle. */
export const loadMemoryJobs = () => import('./memoryJobs');
