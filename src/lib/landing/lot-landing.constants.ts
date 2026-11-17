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

/** Prune's reason for a review throwaway of a lot that has not landed: `{lot}` its name. */
export const THROWAWAY_OF_UNLANDED = 'a review throwaway of lot {lot}, not landed'
