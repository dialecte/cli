/** Why a store lot's landing cannot be read: `{lot}` its folder name, `{reason}` the base branch's refusal. */
export const LOT_LANDING_REFUSALS = {
	noIdentity: 'the lot {lot} has no identity that reads',
	noBase: '{reason}',
} as const

/** How a landed lot's line names what proved it merged: `{base}`, `{commit}` (short) and `{number}`. */
export const LANDED_LINES = {
	ancestor: 'landed on {base} at {commit}: its tip is on {base}',
	host: 'landed on {base} at {commit}: pull request #{number} merged',
	tree: 'landed on {base} at {commit}: its work is in {base} (a squash read offline)',
} as const

/** A lot `lot close` was asked for whose landing is not merged: `{lot}`, `{state}` and why. */
export const NOT_LANDED_TEXTS = {
	unlanded: 'not landed: its work is not in {base}',
	closed: 'not landed: pull request #{number} was closed unmerged',
	empty: 'not landed: no commit of its own beyond its base',
	unknown: 'its landing cannot be read: {reason}',
} as const

/** A host that could not say whether the lot's pull request merged: `{reason}`. */
export const HOST_SILENT_TEXT = 'the host could not say whether its pull request merged ({reason})'

/** Prune's reason for a lot whose landing git alone cannot prove: `{lot}` its name. */
export const NOT_PROVABLE_OFFLINE =
	'landing not provable offline: run lot close {lot}, which asks the host'

/** The stack line's state when the parent's landing cannot be read: `{reason}`. */
export const STACK_UNREADABLE = 'its landing cannot be read: {reason}'

/** tdd's failure when a stacked lot's parent cannot be read: `{parent}` its name, `{reason}` why. */
export const STACK_PARENT_UNREADABLE =
	'the stack parent {parent} cannot be read: {reason}; the lot is never measured as one not stacked'

/** Why a folder's landing is not settled: it holds no store lot's records. */
export const SETTLE_NOT_A_LOT = 'not a lot of the store: its folder holds no lot records'
