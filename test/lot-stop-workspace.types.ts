import type { LotHandoverWorkspace } from './lot-handover-workspace.types.ts'

/** A real lot whose hand-over is written into its folder: the lot and the registry name of the hand-over. */
export type ReadyLot = { lot: LotHandoverWorkspace; name: string }

/** What changed between two snapshots of a folder: the names added, removed and changed. */
export type SnapshotDifference = { added: string[]; removed: string[]; changed: string[] }
