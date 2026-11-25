import type { LotStateName } from './store.types.ts'

/** The lot `--from` names, as the start resolves it: its folder (real path) and its state. */
export type CarrySourceState = {
	lot: string
	state: LotStateName
}

/** Every refusal line of a carry check, in the order the checks ran; nothing is published. */
export type CarryRefusals = {
	refusals: string[]
}

/** The bytes of a record read as they stand, and their sha256. */
export type CarryRecord = {
	bytes: Buffer
	hash: string
}

/** What a start copies of a canceled source lot: its ledger, its declaration when it has one, and where it measured from. */
export type CarrySource = CarrySourceState & {
	/** The source lot's worktree (real path). */
	worktree: string
	ledger: CarryRecord
	/** The source's `.dialecte/lot.json`; absent when the lot has none. */
	declaration?: CarryRecord
	/** The bases of the ledger's production states that git can read. */
	bases: string[]
	/** How many red receipts the ledger holds: what `tdd red` may carry. */
	receipts: number
}

/**
 * `carry.json`: the canceled lot a start carries receipts from, its state then, when, the sha256 of the copies beside
 * it (`carry/ledger.json`, `carry/lot.json` when the source had one) and how many red receipts the ledger holds.
 */
export type CarryFile = {
	schema: 1
	from: string
	state: LotStateName
	at: string
	ledger: string
	declaration?: string
	receipts: number
}

/** What a start prints and answers of its carry: the source lot's name, its state, the red receipts kept. */
export type CarrySummary = {
	from: string
	state: LotStateName
	receipts: number
}
