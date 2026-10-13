export * from './memoryBank';
export { followLog, holds } from './invalidate';
export { appearanceOf, byPlayer, currentStates, isValue, LOOK_KEYS, rivalKey, setValue, withLooks, type Fields } from './looks';
export { current, identityText, indexAssertions, isCurrent, textOf, type AssertionOf } from './assertionIndex';
export { heldBy, YOU } from './items';
export type { MaintenanceDeps } from './memoryJobs';
export type { CutCounts, HelperCallLog } from './helperCall';
/** Idle-only work, loaded on first use to keep it off the start-up bundle. */
export const loadMemoryJobs = () => import('./memoryJobs');
export const loadAssertions = () => import('./assertions');
