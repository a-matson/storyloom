export * from './memoryBank';
export { basisOf, followLog, holds } from './invalidate';
export { appearanceOf, currentStates, isCurrentState, LOOK_KEYS, rivalKey, setState } from './looks';
export { heldBy, setWhere, YOU } from './items';
export type { MaintenanceDeps } from './memoryJobs';
/** Idle-only work, loaded on first use to keep it off the start-up bundle. */
export const loadMemoryJobs = () => import('./memoryJobs');
