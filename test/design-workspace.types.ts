import type { StationLot } from './lot-station-workspace.types.ts'

/** A store lot for the `lot design` cases, and the real path of its design file. */
export type DesignLot = StationLot & { designFile: string }
