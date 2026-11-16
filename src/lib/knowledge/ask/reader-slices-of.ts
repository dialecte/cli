import {
	ANGLE_FAMILIES,
	NOTHING_NEW_REASON,
	ONE_READER_REASON,
	RANK_READER,
	READERS_AT_EFFORT,
	ROUND_READERS_MINIMUM,
	TOP_LESS_READER,
} from './ask.constants.ts'

import type {
	AngleFamily,
	PoolSlice,
	PreviousRound,
	ReaderLetter,
	ReaderPack,
	ReaderSlices,
	ReaderSlicesOfParams,
} from './ask.types.ts'

/**
 * The readers of the next round and their slices: A by rank, B by family round-robin, C (high) as B without the
 * top-ranked slice, each to the budget (a slice larger than the budget left is skipped, the filling goes on); after
 * a closed round only the slices no reader of the same letter had, a slice withheld when every angle that found it
 * is verified (D31); nothing new for any letter: skipped. A letter left with nothing is not given a brief.
 */
export function readerSlicesOf(params: ReaderSlicesOfParams): ReaderPack {
	const { pool, budget, previous } = params
	const round = Math.max(0, ...previous.map((closed) => closed.round)) + 1
	const verified = new Set(previous.flatMap((closed) => closed.verifiedAngles))
	const open = pool.filter(
		(slice) => slice.angles.length === 0 || !slice.angles.every((angle) => verified.has(angle)),
	)
	const [top] = pool
	const readers: ReaderSlices[] = []
	for (const letter of READERS_AT_EFFORT[params.effort]) {
		const had = hadBy({ previous, letter })
		const eligible = open.filter(
			(slice) => !had.has(slice.id) && !(letter === TOP_LESS_READER && slice.id === top?.id),
		)
		const ordered = letter === RANK_READER ? eligible : roundRobinOf({ slices: eligible })
		const reader = filledTo({ letter, slices: ordered, budget })
		if (reader.slices.length > 0) readers.push(reader)
	}
	if (readers.length === 0) return { skipped: true, reason: NOTHING_NEW_REASON }
	// D34: agreement needs two readers, so a round of one reader is never opened
	if (readers.length < ROUND_READERS_MINIMUM) return { skipped: true, reason: ONE_READER_REASON }
	return { round, readers }
}

/** The ids of the slices the readers of a letter were given in the closed rounds. */
function hadBy(params: { previous: PreviousRound[]; letter: ReaderLetter }): Set<string> {
	return new Set(
		params.previous.flatMap((closed) =>
			closed.given
				.filter((given) => given.letter === params.letter)
				.flatMap((given) => given.slices),
		),
	)
}

/** The slices by family round-robin: round n takes each family's n-th slice (rank kept), families in their order. */
function roundRobinOf(params: { slices: PoolSlice[] }): PoolSlice[] {
	const byFamily = new Map<AngleFamily, PoolSlice[]>()
	for (const family of ANGLE_FAMILIES) byFamily.set(family, [])
	for (const slice of params.slices) byFamily.get(slice.family)?.push(slice)
	const families = [...byFamily.values()]
	const longest = Math.max(0, ...families.map((family) => family.length))
	const ordered: PoolSlice[] = []
	for (let index = 0; index < longest; index += 1)
		for (const family of families) {
			const slice = family[index]
			if (slice !== undefined) ordered.push(slice)
		}
	return ordered
}

/** The slices taken in order while their counted lines fit the budget; one that does not fit is skipped. */
function filledTo(params: {
	letter: ReaderLetter
	slices: PoolSlice[]
	budget: number
}): ReaderSlices {
	const taken: PoolSlice[] = []
	let counted = 0
	for (const slice of params.slices) {
		if (counted + slice.counted > params.budget) continue
		taken.push(slice)
		counted += slice.counted
	}
	return { letter: params.letter, slices: taken, counted }
}
