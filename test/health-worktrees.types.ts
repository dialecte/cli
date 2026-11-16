import type { LotEvent } from '../src/lib/events/event.types.ts'
import type { HealthFinding, HealthWorktree } from '../src/lib/health/health.types.ts'
import type { DAMAGED_STATE } from '../src/lib/store/store.constants.ts'
import type { LotStateName } from '../src/lib/store/store.types.ts'

/** A registered worktree of a case: idle for `idleMs` before the clock, at `<worktrees folder>/<name>` unless given. */
export type WorktreeSpec = {
	name: string
	idleMs?: number
	/** How long before the clock the worktree was created (idle time + 1 s unless given). */
	createdMs?: number
	path?: string
	gone?: boolean
	handover?: HealthWorktree['handover']
}

/** A lot of a case: its state (`working` unless given; `undefined` for a lot with no state) and the worktree it names. */
export type WorktreeLotSpec = {
	name?: string
	state?: LotStateName | typeof DAMAGED_STATE | undefined
	worktree?: string
	events?: LotEvent[]
}

export type IdleCase = {
	name: string
	worktrees: WorktreeSpec[]
	lots?: WorktreeLotSpec[]
	expected: HealthFinding[]
}

/** The finding of the idle rule: `worktrees`, the repository's name, at the clock, no lot. */
export type IdleFindingParams = {
	severity?: 'red' | 'amber'
	text: string
	detail?: string[]
}

/** One worktree creation of a case: the step, how long it took, when it ended, and the parts its end carries. */
export type AddSpec = {
	lot?: string
	step: string
	durationMs: number
	endAt: string
	parts?: unknown
	/** Write only the end of the run. */
	withoutStart?: boolean
}

export type AddCase = {
	name: string
	adds: AddSpec[]
	expected: HealthFinding[]
}

/** A finding of the slow-add rule: amber, at the start, of the case's lot unless given. */
export type AddFindingParams = {
	lot?: string
	at: string
	text: string
	detail?: string[]
}

/** A scratch folder of a case: its name and how long before the clock it was modified. */
export type ScratchSpec = { name: string; ageMs: number }

export type ScratchCase = {
	name: string
	folders: ScratchSpec[]
	expected: HealthFinding[]
}

/** What the reader writes under a common dir for one registered worktree. */
export type RegisteredWorktreeParams = {
	common: string
	name: string
	/** The path the `gitdir` file names (`<path>/.git`). */
	path: string
	indexAt?: Date
	headAt?: Date
}

export type HandoverEntryParams = {
	common: string
	name: string
	worktree: string
	state: 'pending' | 'committed' | 'abandoned'
	closed?: string
}

export type LotIdentityParams = { common: string; name: string; worktree: string | null }
