/** The person's go-ahead for a hand-over that is not a store lot: who, and why (`--by`, `--reason`). */
export type NotALotGoAhead = {
	by: string
	reason: string
}

/** What the `lot` guard of `handover run` reads: the hand-over folder, whether it is a release, whether it is a rehearsal. */
export type StoreLotGuardParams = {
	folder: string
	/** The lots file says `"release": true`: such a hand-over is not concerned. */
	release: boolean
	/** A rehearsal goes on past a refusal, marked `!`. */
	rehearsal: boolean
	/** `--not-a-lot --by --reason`: recorded in the folder's decisions file before the verdict, for a folder that is not a store lot. */
	goAhead?: NotALotGoAhead
	/** The time the go-ahead row is dated from; default: now. */
	now?: Date
}

/** `--not-a-lot --by --reason` read from a command line: the go-ahead (none when the flag is absent), or the usage refusal. */
export type NotALotOptions = { goAhead: NotALotGoAhead | undefined } | { usage: string }

/**
 * What the `lot` guard and the card's `lot` line read of a hand-over folder: a healthy store lot (its name), a store
 * lot refused (simulated or damaged: the refusal text), or a folder that is not a store lot, with the go-ahead its
 * decisions file holds (the first row starting `not a store lot:`), if any.
 */
export type StoreLotStanding =
	| { kind: 'storeLot'; name: string }
	| { kind: 'refused'; detail: string }
	| { kind: 'notALot'; goAhead: NotALotGoAhead | undefined }
