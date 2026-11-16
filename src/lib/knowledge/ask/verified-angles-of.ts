import { verifiedCitesOf } from './verified-cites-of.ts'

import type { VerifiedAnglesOfParams } from './ask.types.ts'

/**
 * The angles a verified cite came from (D39): the sorted, unique angles of the slices of the ask that hold a verified
 * cite of an accepted report (a cite is in a slice when it was checked against the slice given: same file and range).
 * A refused cite counts for nothing; the next pack hands out the angles no verified cite came from.
 */
export function verifiedAnglesOf(params: VerifiedAnglesOfParams): string[] {
	const angles = new Set<string>()
	for (const report of params.accepted)
		for (const { slice: given } of verifiedCitesOf({ report }))
			for (const slice of params.slices)
				if (slice.file === given.file && slice.from === given.from && slice.to === given.to)
					for (const angle of slice.angles) angles.add(angle)
	return [...angles].sort()
}
