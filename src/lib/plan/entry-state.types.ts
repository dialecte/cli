import type { PlanBlock, PlanEntryKind } from './plan-block.types.ts'
import type { PlanFacts, SpecStatusName, StoreLotFact } from './plan.types.ts'

/** Where an entry stands: `done`, `open` (work under way), `ready`, `waiting`, `parked`, `unknown` (not readable). */
export type EntryStateName = 'done' | 'open' | 'ready' | 'waiting' | 'parked' | 'unknown'

/** The record that makes an entry done or open. */
export type EntryRealization = {
	kind: 'store' | 'registry' | 'worktree' | 'mark' | 'spec'
	name: string
	folder: string | null
	worktree: string | null
}

/** One entry's state, with what it was read from and what it waits for. */
export type EntryStatus = {
	id: string
	kind: PlanEntryKind
	state: EntryStateName
	/** The store lot's own state when a store lot makes the entry open. */
	lotState: string | null
	realizedBy: EntryRealization | null
	waitsFor: { id: string; state: EntryStateName }[]
	/** Why the entry is `unknown`, or the line that parked it. */
	reason: string | null
	/** `pending since <date>`, `manual, no hand-over yet`. */
	note: string | null
	/** An open entry's scope by repository (the union of the candidates' when the attribution is uncertain). */
	heldScope: Record<string, string[]>
	spec: { file: string; status: SpecStatusName } | null
}

/** Open work no entry of the plan accounts for; `scope` null is unknown (it marks proposals `unverified`). */
export type OutsideWork = {
	repository: string
	kind: 'store' | 'registry' | 'worktree'
	name: string
	scope: string[] | null
	since: string | null
	/** Why it is listed when it is not plain outside work: `of <id> (<state>)`, `damaged: <file>`. */
	note?: string
}

/** Every entry's state in block order, and the open work outside the plan. */
export type PlanStates = { entries: EntryStatus[]; outside: OutsideWork[] }

/**
 * What an entry's own records say before any worktree is attributed: done, open or unknown, with the fields that
 * come with it; undefined when no record speaks for it.
 */
export type EntryRecord = Pick<
	EntryStatus,
	'state' | 'lotState' | 'realizedBy' | 'reason' | 'note' | 'heldScope'
>

/** A worktree attributed to an entry of its branch, with the scope it holds (a union when uncertain). */
export type WorktreeAttribution = {
	worktree: { name: string; path: string }
	heldScope: Record<string, string[]>
}

/** A store lot with the name of the repository it was read from. */
export type RepositoryStoreLot = { repository: string; lot: StoreLotFact }

/** The arguments of `entryStates`. */
export type EntryStatesParams = { block: PlanBlock; facts: PlanFacts }
