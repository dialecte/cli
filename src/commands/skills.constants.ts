/** Groups below q/tx/doc/project walked for skills: deep enough for `tx.lifecycle.transplant.deep`. */
export const METHOD_DISCOVERY_DEPTH = 3

export const SUBCOMMAND_NAMES = ['sync', 'generate', 'check', 'changed'] as const

/** `skills sync --agents-file --no-agents-file`. */
export const AGENTS_FILE_FLAGS_REFUSAL =
	'skills sync: --agents-file and --no-agents-file exclude each other'

/** `skills sync --no-contributing` in a contributor, whose profile always installs the contributor skills. */
export const CONTRIBUTOR_SYNC_REFUSAL =
	'skills sync: the contributor profile installs the contributor skills'
