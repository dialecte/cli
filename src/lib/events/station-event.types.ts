/** A station call's phase: a start, or an end. */
export type StationPhase = 'start' | 'end'

/** What `lot station`'s words ask for, once read and checked (every fault answered at once). */
export type StationRequest = {
	/** The lot as the person named it (index, full name, path). */
	id: string
	phase: StationPhase
	station: string
	/** `--run` of an end. */
	run?: string
	/** The `--event <host id>` of the call. */
	hostEvent: string | null
	/**
	 * The station fields of the event beside the envelope, as they will be written, `station` first; `skills` hold
	 * `{ name, how }` only: the cli adds each hash once it knows the lot's repository.
	 */
	fields: Record<string, unknown>
	json: boolean
}

/** A request that could not be read: each fault in one line; `usage` when the words themselves are wrong. */
export type StationFaults = { faults: string[]; usage: boolean }

/** A skill as the call names it, before its hash is read. */
export type NamedSkill = { name: string; how: string }

/** The host-given values of one call, before they are checked: from the flags or from a `--from` file. */
export type StationValues = Record<string, unknown>
