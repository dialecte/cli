/** The wordings of the gate base a scoped step selects against (`resolveGateBase`). */

/** `--base <ref>` names no commit. */
export const GATE_BASE_REFUSAL = '--base {ref}: no such commit'

/** Rule 4: no base branch, or none sharing a commit with HEAD; `{branch}` is the base branch's name. */
export const NO_BASE_BRANCH_NOTE = 'no base branch {branch}: everything selected'

/** Why a hand-over base was not honoured; `{base}` is the base as given, `{folder}` its hand-over folder. */
export const HANDOVER_BASE_IGNORED_REASONS = {
	noLiveRun: 'hand-over base {base} ignored: no live hand-over run of {folder}',
	otherFolder: 'hand-over base {base} ignored: the live hand-over run is {live}, not {folder}',
	notACommit: 'hand-over base {base} ignored: not a full commit id',
	noBaseBranch: 'hand-over base {base} ignored: no base branch to check against',
	notAncestorOfHead: 'hand-over base {base} ignored: not an ancestor of HEAD',
	notAncestorOfBaseBranch:
		'hand-over base {base} ignored: not an ancestor of the base branch {ref}',
} as const

/**
 * The variables a hand-over run hands the `gate --hook` its commits start: the hand-over base (a full sha) and the
 * real path of the hand-over folder. Only `gate --hook` reads them, from the environment the cli was given.
 */
export const HANDOVER_BASE_VARIABLES = {
	base: 'DIALECTE_HANDOVER_BASE',
	folder: 'DIALECTE_HANDOVER_FOLDER',
} as const

/** One hand-over variable given without the other: never honoured; `{value}` is the one given. */
export const HANDOVER_HALF_GIVEN_REASONS = {
	baseOnly: 'hand-over base without its folder: {value} ignored',
	folderOnly: 'hand-over folder without its base: {value} ignored',
} as const

/** Every source a gate base can come from (`GateBaseSource`). */
export const GATE_BASE_SOURCES = ['flag', 'handover', 'base-branch', 'none', 'release'] as const

/** A full object id: SHA-1 or SHA-256, lower-case hex. */
export const FULL_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

/** Where the base branch is looked for, in order: the local branch, then origin's (a rehearsal clone). */
export const BASE_BRANCH_REFS: readonly string[] = [
	'refs/heads/{branch}',
	'refs/remotes/origin/{branch}',
]
