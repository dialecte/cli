/** `dialecte lot design`: its options and its lines; `{lot}` the lot's full name. */

/** The options `lot design` takes followed by a value, without the dashes. */
export const DESIGN_VALUE_OPTIONS = ['from', 'by', 'reason'] as const

/** The flags `lot design` takes, without the dashes. */
export const DESIGN_FLAGS = ['from-plan', 'approve', 'waive', 'json'] as const

/** The verb the free-text checks name. */
export const DESIGN_VERB = 'design'

export const LOT_DESIGN_LINES = {
	damaged: 'lot design: {lot} is damaged: its records do not read',
	notAtWork: 'lot design: {lot} is {state}: only a lot at work records a design',
	unreadable: 'lot design: {file} cannot be read; nothing written',
	empty: 'lot design: {file} is empty; nothing written',
	notText: 'lot design: {file} is not UTF-8 text; nothing written',
	outsideWorkTree:
		'lot design: {file} is in no git work tree: keep the design in a repository, beside its plan; nothing written',
	noPlanSpec:
		'lot design: {lot} carries out no plan entry with a spec: dialecte lot design {lot} --from <file>; nothing written',
	sharedSpec:
		"lot design: spec {file} covers {count} entries: write this lot's design (it may cite the spec), then dialecte lot design {lot} --from <file>; nothing written",
	ownWorktree: "lot design: {verb} from the main checkout, not the lot's worktree; nothing written",
	nothingRecorded:
		'lot design: {lot} has no design recorded: dialecte lot design {lot} --from <file> records it; nothing written',
	changedSinceRecorded:
		'lot design: {file} changed since recorded: dialecte lot design {lot} --from {file} records it again; nothing written',
	notRequired: 'lot design: {lot} needs no design: nothing to waive; nothing written',
	recorded: 'lot design: {lot} recorded {file} ({hash})',
	approved: 'lot design: {lot} approved by {by} ({hash})',
	waived: 'lot design: {lot} waived by {by}',
	failed: 'lot design: {reason}',
} as const
