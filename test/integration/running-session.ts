// Shim until the part-C batches import ./scenario; the orchestrator deletes it after the last one.
export { startRunningSession, hostSets, hostPutsBack, type Seated } from './scenario'
