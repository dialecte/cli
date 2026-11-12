import type { BASE_BRANCH_SOURCES, GATE_BASE_SOURCES } from './gate-base.constants.ts'

/** Where the base branch was found (`findBaseBranchRef`). */
export type BaseBranchSource = (typeof BASE_BRANCH_SOURCES)[number]

/** The base branch of a repository: its full ref, its short name, and which rule found it. */
export type BaseBranchRef = {
	/** `refs/heads/<branch>` or `refs/remotes/origin/<branch>`. */
	ref: string
	branch: string
	source: BaseBranchSource
}

/** Where the base of a gate came from. */
export type GateBaseSource = (typeof GATE_BASE_SOURCES)[number]

/** The commit a scoped step selects against, once per run. */
export type GateBase = {
	/** A full sha, or the empty tree id. */
	commit: string
	source: GateBaseSource
	/** Said once beside the result (`no base branch main: everything selected`). */
	note?: string
	/** Why a given hand-over base was not honoured: the hook prints it. */
	ignored?: string
}

/** The gate base of one `gate` run, as its key and record hold it, with the lines the run says about it. */
export type GateRunBase = {
	base: UsedGateBase
	/** Said once before the steps: the note of rule 4, the line of a base from `--base`. */
	lines: string[]
}

/** The base a hand-over run hands down, with the hand-over folder it belongs to. */
export type HandoverBase = { commit: string; folder: string }

/**
 * The hand-over variables of the environment the cli was given: both (`handoverBase`), one without the other (why
 * it is ignored), or neither (`{}`).
 */
export type GivenHandoverBase = { handoverBase?: HandoverBase; ignored?: string }

/** The base a gate run used, as its record and a hook's base line hold it. */
export type UsedGateBase = { commit: string; source: GateBaseSource }
