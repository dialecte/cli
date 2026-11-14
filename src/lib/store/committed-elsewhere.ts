/**
 * The entry rule of a lot whose hand-over was committed outside its own folder, files only: the entry it reads
 * `committed` from, and the guards that keep a resumed or running lot reading from its own records. Shared by the
 * git-free reader (`readCheckedLotState`) and the landed reading (`readLandedLotState`).
 */
import { realPathOf } from '../file-system.ts'
import { entryOfFolder } from '../handover/handover-store-read.ts'

import type { HandoverRunMarker, StoreEntry } from '../handover/handover.types.ts'
import type { LotIdentity, Transition } from './store.types.ts'

/**
 * The registry entry a lot reads `committed` from while no entry registers its folder: every entry naming its
 * worktree (real path) and branch is committed, and at least one exists; the latest written of them.
 */
export function committedElsewhereEntry(params: {
	entries: readonly StoreEntry[]
	identity: LotIdentity
	lotFolder: string
}): StoreEntry | undefined {
	const { entries, identity } = params
	// an entry registering the lot folder itself always decides
	if (entryOfFolder({ entries, folder: params.lotFolder }) !== undefined) return undefined
	if (typeof identity.worktree !== 'string') return undefined
	const worktree = realPathOf(identity.worktree)
	const naming = entries.filter(
		(entry) => entry.branch === identity.branch && realPathOf(entry.worktree) === worktree,
	)
	if (naming.length === 0 || naming.some((entry) => entry.state !== 'committed')) return undefined
	return naming.reduce(function latestWritten(latest, entry) {
		return entry.written > latest.written ? entry : latest
	})
}

/**
 * The lot runs or was resumed after the hand-over `entry` records: a live run marker, or a transition later than the
 * entry's `written`. It then reads from its own records, never from that entry.
 */
export function isResumedAfterEntry(params: {
	entry: StoreEntry
	transitions: readonly Transition[]
	runMarker: HandoverRunMarker | undefined
}): boolean {
	if (params.runMarker !== undefined) return true
	const written = Date.parse(params.entry.written)
	return params.transitions.some((transition) => Date.parse(transition.at) > written)
}
