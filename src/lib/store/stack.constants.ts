/** A stacked lot's record in its store folder, and its schema. */
export const STACK_FILE = 'stack.json'
export const STACK_SCHEMA = 1

/** The states of a lot that takes a child (`lot start --on`): it is still at work. */
export const STACKABLE_STATES: readonly string[] = ['working', 'ready']

/** Why `--on` names no lot a child can start on; `{lot}` the id given. */
export const STACK_PARENT_REFUSALS = {
	unknown: 'lot start: --on {lot} names no lot: nothing written',
	damaged: 'lot start: --on {lot} is damaged: dialecte lot status {lot} says how, nothing written',
	state:
		'lot start: --on {lot} is {state}: only a working or ready lot takes a child, nothing written',
	repository:
		'lot start: --on {lot} is a lot of {parent}, the brief names {repository}: a stack stays in one repository, nothing written',
	noBranch: 'lot start: --on {lot}: its branch {branch} is not in {repository}, nothing written',
} as const

/**
 * How `lot status` and the card name a lot's stack parent: `{pull}` its pull request; `{state}` that pull request's
 * state as the host holds it (`lot status`), or `{reason}` the host's silence. The card reads files only: no state.
 */
export const STACK_TEXT = {
	withState: 'on {parent} ({pull}, {state})',
	filesOnly: 'on {parent} ({pull})',
	noPull: 'on {parent} (no pull request yet)',
	hostSilent: 'the host cannot say: {reason}',
	damagedRecord: 'damaged ({damage})',
} as const

/** A pull request's state as the stack line names it. */
export const STACK_PULL_STATES = {
	merged: 'merged',
	closed: 'closed',
	queued: 'queued',
	draft: 'draft',
	open: 'open',
} as const

/** The damage of a `stack.json` that does not read as a stack record. */
export const STACK_DAMAGE = 'stack.json does not read as a stack record'

/** The card's stack line name, and the `lot status` line. */
export const STACK_CARD_LINE_NAME = 'stack'
export const STACK_STATUS_LINE = 'stack: {stack}'
