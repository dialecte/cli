/**
 * The names a review round's snapshot is made of in a hand-over folder, and the rounds whose `round-<n>/` snapshot
 * stands there: one reader for the card, `lot status` and `lot snapshot`. Files only: no git, no process.
 */
import { readdirSync } from 'node:fs'

import { ROUND_FOLDER_PATTERN } from '../gate-records/gate-records.constants.ts'

/** The names a round's snapshot is made of in the hand-over folder. */
export function roundNames(round: number): {
	folder: string
	deleted: string
	base: string
	state: string
} {
	return {
		folder: `round-${round}`,
		deleted: `round-${round}.deleted`,
		base: `round-${round}.base`,
		state: `round-${round}.state`,
	}
}

/** The rounds of the `round-<n>/` snapshots in the hand-over folder, ascending; none when it cannot be read. */
export function snapshotRounds(folder: string): number[] {
	let entries
	try {
		entries = readdirSync(folder, { withFileTypes: true })
	} catch {
		return []
	}
	return entries
		.flatMap(function roundOf(entry) {
			const match = ROUND_FOLDER_PATTERN.exec(entry.name)
			return entry.isDirectory() && match ? [Number(match[1])] : []
		})
		.sort((left, right) => left - right)
}
