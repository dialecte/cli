import { TEMPORARY_INFIX } from '../lib/store/store.constants.ts'

/** The options `lot start` takes followed by a value, and its flags, without the dashes. */
export const START_VALUE_OPTIONS: readonly string[] = ['effort', 'simulate', 'by', 'reason']
export const START_FLAGS: readonly string[] = ['dry-run', 'json']

/** Why `lot start` is a usage error: `{extra}` the words beyond the brief, `{effort}` and `{efforts}` the flag's. */
export const START_USAGE_REASONS = {
	noBrief: 'lot start takes one brief: none given',
	extra: 'lot start takes one brief, not also {extra}',
	effort: '--effort {effort} is not one of {efforts}',
	goAheadHalf: '--by and --reason go together: {option} alone',
	goAheadLine: '{option} takes one non-empty line',
	asked: 'no effort among {efforts} after {attempts} answers',
} as const

/** The verb the forbidden-word refusal of `--by` and `--reason` names. */
export const START_VERB = 'start'

/** The line of a start: the effort, where it came from, the risk class and its first reason. */
export const START_EFFORT_LINE = 'effort {effort} ({source}) · risk class {class}: {detail}'

/** The detail of a class derived with no reason: no scope entry reaches a declared glob. */
export const NO_DECLARED_PATH = 'no declared path'

/** The refusal of an effort below the scope's class without `--by` and `--reason` (D13). */
export const START_BELOW_REFUSAL =
	'lot start: effort {effort} is below risk class {class} ({detail}): add --by <who> --reason <text>'

/** The question `lot start` asks on a terminal (D13), and how many answers out of the efforts it reads at most. */
export const START_EFFORT_PROMPT = 'effort for risk class {class} [{effort}]: '
export const START_EFFORT_ATTEMPTS = 3

/** The refusal of a question whose input closed before an answer (D22). */
export const START_NO_ANSWER = 'lot start: no answer to the effort question'

/** The schema of `identity.json`. */
export const IDENTITY_SCHEMA = 1

/** Who publishes the transitions of `lot start`, and the reasons of its own. */
export const ENGINE = 'engine'
export const START_REASON = 'lot started'
export const OVERLAP_REASON = 'overlap with {lot}, started at the same time'
export const BRANCH_MADE_SUFFIX = '; the branch {branch} was made: a retry meets branch-exists'

/** The note of a link that could not be made once the worktree exists (the lot goes on). */
export const LINK_REFUSED_NOTE =
	'the link {link} to the lot folder could not be made: {reason}; open the lot by its id'

/**
 * The final name the hard-link probe's files are temporaries of, and its two files below the store folder
 * (`<final name>.tmp-<pid>-<n>`: never a record; a dead pid's are swept as any temporary of that name).
 */
export const PROBE_NAME = '.link-probe'
export const PROBE_SOURCE = `${PROBE_NAME}${TEMPORARY_INFIX}{pid}-1`
export const PROBE_TARGET = `${PROBE_NAME}${TEMPORARY_INFIX}{pid}-2`
