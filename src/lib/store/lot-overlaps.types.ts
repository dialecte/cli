/** Which verb accepted the overlap: `lot start` (the brief's scope) or `lot scope` (an add). */
export type OverlapVerb = 'start' | 'scope'

/**
 * One overlap a lot accepted (`--overlap-ok --by <who> --reason <text>`): the open lot it meets, the met pairs
 * (`<own entry> meets <other entry>`), who accepted it and why. One line of the lot folder's `overlaps.jsonl`.
 */
export type LotOverlapRecord = {
	schema: 1
	at: string
	verb: OverlapVerb
	lot: string
	met: string[]
	by: string
	reason: string
}

/** The lot folder's `overlaps.jsonl` read: the records in file order, and how many lines do not read as one. */
export type LotOverlaps = { overlaps: LotOverlapRecord[]; unreadable: number }
