import type { HandoverEntryState } from '../handover/handover.types.ts'
import type { LotStateName, StateFolderLocation } from '../store/store.types.ts'
import type { PlanBlock, PlanFault } from './plan-block.types.ts'

/** The status of a spec file: `missing` (no file), `DRAFT` (no `Status:` line or one starting with DRAFT), else `written`. */
export type SpecStatusName = 'missing' | 'DRAFT' | 'written'

/** A spec's status with the first `Status:` line it was read from (undefined without one). */
export type SpecStatus = { status: SpecStatusName; line: string | undefined }

/** A person's mark on a plan entry (`plan mark`), one line of the plan's marks file. */
export type PlanMark = {
	plan: string
	id: string
	state: 'done'
	by: string
	reason: string | null
	at: string
}

/** A lot of a repository's store. */
export type StoreLotFact = {
	name: string
	branch: string
	feature: string
	state: LotStateName
	open: boolean
	scope: string[]
	worktree: string | null
	/**
	 * Set when the lot reads `committed` because its hand-over was committed outside its folder and its branch is on
	 * the target branch, while that hand-over is not closed yet: the folder of the hand-over and the target branch.
	 */
	landed?: { folder: string; target: string }
}

/** A landed lot `plan next` names: its repository's name in the plan, the lot, its hand-over's folder, the target. */
export type PlanLandedLot = { repository: string; lot: string; folder: string; target: string }

/** An entry of a repository's hand-over registry. */
export type RegistryFact = {
	name: string
	folder: string
	branch: string
	worktree: string
	written: string
	state: HandoverEntryState
}

/** A linked worktree of a repository: its name in `<common>/worktrees/`, its folder, its branch (undefined when detached). */
export type WorktreeFact = { name: string; path: string; branch: string | undefined }

/**
 * A record that does not read: a registry `*.json` the reader drops, a store lot whose identity, state or brief
 * scope does not read, a `worktrees/<name>/` without a readable `gitdir` or `HEAD`; `file` is what does not read.
 */
export type DamagedRecord = { kind: 'store' | 'registry' | 'worktree'; name: string; file: string }

/** The records of one kind read from a repository, and the ones that do not read. */
export type FactsRead<Fact> = { facts: Fact[]; damaged: DamagedRecord[] }

/** What a repository's common folder holds, or why it could not be read. */
export type RepositoryFacts =
	| {
			readable: true
			path: string
			common: string
			caseInsensitive: boolean
			storeLots: StoreLotFact[]
			registry: RegistryFact[]
			worktrees: WorktreeFact[]
			/** The records that do not read (open work of unknown scope); none when left out. */
			damaged?: DamagedRecord[]
	  }
	| { readable: false; path: string; reason: string }

/** Everything `plan next` reads from disk, once. */
export type PlanFacts = {
	repositories: Record<string, RepositoryFacts>
	specs: Record<string, SpecStatus>
	/** Whether each entry's brief file (absolute path) exists. */
	briefs: Record<string, boolean>
	marks: PlanMark[]
}

/** The arguments of `readPlanFacts`. */
export type ReadPlanFactsParams = {
	block: PlanBlock
	/** The plan file, when the marks of that plan are to be read. */
	planPath?: string
	stateLocation?: StateFolderLocation
}

/** A part of the block read from its JSON: the value when it holds, and every fault found in it. */
export type PlanParsed<Value> = { value?: Value; faults: PlanFault[] }

/**
 * What the order checks read of one entry, taken leniently from its JSON (a field that does not hold is left out),
 * so an entry refused for another field still takes part in the order.
 */
export type PlanOrderNode = {
	id: string | undefined
	group: string | undefined
	dependsOn: string[]
	branch: string | undefined
	hasHandover: boolean
}

/** What every entry of the block is checked against: the repositories, the ids and groups, where each id first is. */
export type PlanEntryContext = {
	planFolder: string
	repositories: string[]
	firstIndexOfId: Map<string, number>
	groups: Set<string>
}
