/** The words of the hand-over's `mutation` line: the card's gate line and the run's guard; prune names runs the same way. */

/** The name of the card's gate line and of the run's guard. */
export const MUTATION_GATE_NAME = 'mutation'

/** The verdict when the package owes nothing. */
export const NOTHING_PENDING = 'nothing pending'

/** The guard's detail for a package that declares no mutation scope. */
export const NO_MUTATION_SCOPE = 'no mutation scope declared'

/** Between the parts of a verdict's detail. */
export const VERDICT_PART_SEPARATOR = ' · '

/** The nouns the failed counts are made of, singular at 1. */
export const NEW_SURVIVOR_NOUN = 'new survivor'
export const DIED_RUN_NOUN = 'died run'

/** After the failed counts: where the person reads them in full. */
export const STATUS_HINT = ': dialecte mutants status'

/** One line per `new` survivor: `{file}:{line} {mutation} (lot {lot})`. */
export const NEW_SURVIVOR_LINE = '{file}:{line} {mutation} (lot {lot})'

/** A run whose owner process is gone before it reported. */
export const RUN_DIED_LINE =
	'run {id} died before reporting: rerun or dialecte mutants abandon {id}'

/** A run whose owner process still lives. */
export const RUN_RUNNING = 'run {id} still running (pid {pid})'

/** What a running run of the hand-over's branches means, after `RUN_RUNNING`: by kind of hand-over. */
export const RUNNING_CONSEQUENCE = {
	plain: ': its survivors are not in yet',
	merge: ': the merge waits for it',
	gate: ': a gate lot waits for it',
} as const

/** The last line of a verdict that lists survivors or died runs. */
export const ACT_ON_EACH =
	'act on each: a test that kills it, a recorded reason in .dialecte/mutation-records.json, or dialecte mutants schedule <follow-up>'

/** A gate lot without a reported run of its branches on the tree it hands over. */
export const GATE_LOT_WITHOUT_RUN = 'gate lot: run dialecte mutants run on this tree first'

/** A folder lot file whose `mutation` is no mode: `{file}`, `{modes}`, `{value}`. */
export const INVALID_FOLDER_MODE = '{file}: "mutation" must be one of {modes}, not {value}'
