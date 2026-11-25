/** The schema of `carry.json`. */
export const CARRY_SCHEMA = 1

/** The names of the copies a start with `--from` writes inside `STORE_FILES.carryCopies`. */
export const CARRY_LEDGER_COPY_NAME = 'ledger.json'
export const CARRY_DECLARATION_COPY_NAME = 'lot.json'

/** The words a refusal for a live source names: the command that settles it. */
export const CARRY_STOP_COMMAND = 'lot stop'

/**
 * Why `lot start --from <lot>` refuses; `{lot}` the id given, `{state}` the source's state, `{repository}` and
 * `{sourceRepository}` the new brief's and the source's, `{worktree}` the source's worktree, `{file}` the file that does not read.
 */
export const CARRY_REFUSALS = {
	unknown: 'lot start: --from {lot} names no lot: nothing written',
	damaged: 'lot start: --from {lot} is damaged: lot status {lot} says how, nothing written',
	simulated:
		'lot start: --from {lot} is simulated: it has no worktree and no receipts, nothing written',
	live: 'lot start: --from {lot} is {state}: stop it first (lot stop {lot}), nothing written',
	markerOnly:
		'lot start: --from {lot} is canceled by its marker only: its cancel is not settled, wait for the run its marker names to end, nothing written',
	onMain:
		'lot start: --from {lot} is {state}: its work is on main, there is nothing to rebuild, nothing written',
	repository:
		'lot start: --from {lot} is a lot of {sourceRepository}, the brief names {repository}: nothing written',
	worktreeGone: 'lot start: --from {lot}: its worktree {worktree} is gone, nothing written',
	ledgerMissing: 'lot start: --from {lot}: its receipts are missing, nothing written',
	ledgerUnreadable:
		'lot start: --from {lot}: its receipts in {file} cannot be read, nothing written',
	ledgerVersion:
		'lot start: --from {lot}: its receipts in {file} are of another version, nothing written',
	ledgerNoProduction:
		'lot start: --from {lot}: its receipts in {file} hold no production state, nothing written',
	declarationUnreadable:
		'lot start: --from {lot}: its lot file {file} cannot be read, nothing written',
	noBase: 'lot start: --from {lot}: git cannot read any base its receipts name, nothing written',
} as const

/** The usage error of `--from` with `--simulate`. */
export const CARRY_SIMULATE_USAGE = '--from takes a real lot: it cannot go with --simulate'

/** The line a start prints for its carry, and the dry run's: `{lot}` the source, `{state}` its state, `{receipts}` the red receipts kept. */
export const CARRY_START_LINE =
	'carry from {lot} ({state}): {receipts} red receipts kept for tdd red'
export const CARRY_DRY_RUN_LINE =
	'would carry from {lot} ({state}): {receipts} red receipts kept for tdd red'
