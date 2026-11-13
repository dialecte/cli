import type { TimelineEntry } from './next-station.types.ts'

/** A decisions row that lets a review round above the cap be taken: the round, who said so, and why. */
export type BeyondCapRow = { round: number; by: string; reason: string }

/** One entry of the timeline before its order is set: its time (`null`: not known, placed last), its rank among entries of the same time. */
export type TimedEntry = { at: string | null; rank: number; entry: TimelineEntry }

/** The step and round a station event carries; a field it does not carry is absent. */
export type RunPosition = { step?: number; round?: number }
