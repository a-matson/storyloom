export * from './memoryBank';
export { basisOf, followLog, holds } from './invalidate';
export { appearanceOf, currentStates, isCurrentState, LOOK_KEYS, rivalKey, setState, withLooks } from './looks';
export { current, identityText, indexAssertions, isCurrent, textOf, type AssertionIndex, type AssertionOf } from './assertionIndex';
export { heldBy, setWhere, YOU } from './items';
export type { MaintenanceDeps } from './memoryJobs';
export type { CutCounts, HelperCallLog } from './helperCall';
/** Idle-only work, loaded on first use to keep it off the start-up bundle. */
export const loadMemoryJobs = () => import('./memoryJobs');
export const loadAssertions = () => import('./assertions');
export { deriveAssertions } from './assertions';
