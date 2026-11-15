/**
 * What a scope change does: narrows the lot's scope (`drop`), widens it (`add`), or takes back exactly what the add
 * before it appended (`undo`, when a lot met the add once it was written).
 */
export type ScopeChangeOp = 'drop' | 'add' | 'undo'

/**
 * A line of a lot's `scope-changes.jsonl` (schema 1): `by` and `reason` on every `add`, on a `drop` the verb writes
 * since every drop requires them (both or neither on an older drop line), never on an `undo`.
 */
export type ScopeChange = {
	schema: 1
	at: string
	op: ScopeChangeOp
	/** The paths changed, each a normalised scope entry. */
	paths: string[]
	by?: string
	reason?: string
}

/** The changes of a lot folder in file order, and how many lines did not read as one. */
export type ScopeChanges = {
	changes: ScopeChange[]
	unreadable: number
}

/**
 * A lot's scope as readers show it: its brief's scope (normalised), the effective scope (null when a change line does
 * not read: the guard then reads every path), the readable changes, and the count of lines that do not read when any.
 */
export type LotScope = {
	brief: string[]
	effective: string[] | null
	changes: ScopeChange[]
	unreadable?: number
}
