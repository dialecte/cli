import type { InterleavingSeam } from '../handover/handover.types.ts'

/** What `moveLotAside` takes: the lot folder to move and what `stopped.json` records about the stop. */
export type MoveLotAsideParams = {
	/** The folder `<git common folder>/dialecte-lots/<name>` (a symbolic link to a folder is moved as the link). */
	lotFolder: string
	/** Why the person stopped the lot, and who. */
	reason: string
	by: string
	/** The time of the stop (`stopped.json`'s `at`). */
	now: Date
	/** Why the lot reads damaged (a reason of `RECORD_DAMAGE_REASONS`). */
	damage: string
	/** Called once the free name in the aside folder is chosen, before the folder is moved (the tests cross here). */
	beforeMove?: InterleavingSeam
}

/** The folder moved, now at `folder`; or `gone` when no folder of that name is in the store any more. */
export type MovedAside = { state: 'moved'; folder: string } | { state: 'gone' }

/** What a stop records of a lot it moved aside (`stopped.json`), in this key order. */
export type StoppedRecord = {
	reason: string
	by: string
	at: string
	/** Why the lot read damaged. */
	damage: string
}
