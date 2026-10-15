export * from './memoryBank';
export { followLog, holds } from './invalidate';
export { appearanceOf, byPlayer, currentStates, isValue, LOOK_KEYS, rivalKey, setValue, withLooks, type Fields } from './looks';
export { current, identityText, indexAssertions, isCurrent, isLegacy, textOf, type AssertionOf } from './assertionIndex';
export { heldBy } from './items';
export { YOU } from './you';
export { sceneIds, sceneNames, withPresence } from './names';
export type { MaintenanceDeps } from './memoryJobs';
export type { CutCounts, HelperCallLog } from './helperCall';
/** Idle-only work, loaded on first use to keep it off the start-up bundle. */
export const loadMemoryJobs = () => import('./memoryJobs');
export const loadAssertions = () => import('./assertions');
