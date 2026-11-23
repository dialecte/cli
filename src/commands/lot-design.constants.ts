/** `dialecte lot design`: its options and its lines; `{lot}` the lot's full name. */

/** The options `lot design` takes followed by a value, without the dashes. */
export const DESIGN_VALUE_OPTIONS = ['from', 'by', 'reason'] as const

/** The options `lot design` takes followed by a value, each as often as given, without the dashes. */
export const DESIGN_REPEATABLE_OPTIONS = ['verdict'] as const

/** The flags `lot design` takes, without the dashes. */
export const DESIGN_FLAGS = ['from-plan', 'approve', 'waive', 'json'] as const

/** The system's shared temporary folders, refused as a design's home beside the one `tmpdir` names. */
export const SYSTEM_TEMPORARY_ROOTS: readonly string[] = ['/tmp', '/private/tmp']

/** The verb the free-text checks name. */
export const DESIGN_VERB = 'design'

export const LOT_DESIGN_LINES = {
	damaged: 'lot design: {lot} is damaged: its records do not read',
	notAtWork: 'lot design: {lot} is {state}: only a lot at work records a design',
	unreadable: 'lot design: {file} cannot be read; nothing written',
	empty: 'lot design: {file} is empty; nothing written',
	notText: 'lot design: {file} is not UTF-8 text; nothing written',
	inScratch:
		'lot design: {file} is in a temporary or scratch folder, which is wiped: keep the design beside its plan; nothing written',
	noPlanSpec:
		'lot design: {lot} carries out no plan entry with a spec: dialecte lot design {lot} --from <file>; nothing written',
	sharedSpec:
		"lot design: spec {file} covers {count} entries: write this lot's design (it may cite the spec), then dialecte lot design {lot} --from <file>; nothing written",
	ownWorktreeCommand: 'lot design: {verb}',
	nothingRecorded:
		'lot design: {lot} has no design recorded: dialecte lot design {lot} --from <file> records it; nothing written',
	changedSinceRecorded:
		'lot design: {file} changed since recorded: dialecte lot design {lot} --from {file} records it again; nothing written',
	goneWithCopy:
		'lot design: {file} is gone and so is its copy in the lot folder: dialecte lot design {lot} --from <file> records it again; nothing written',
	notRequired: 'lot design: {lot} needs no design: nothing to waive; nothing written',
	recorded: 'lot design: {lot} recorded {file} ({hash})',
	approved: 'lot design: {lot} approved by {by} ({hash})',
	waived: 'lot design: {lot} waived by {by}',
	failed: 'lot design: {reason}',
	reviewMissing:
		'lot design: no saved verdict names design {hash} of {lot} in {folder}: save the review there with the lines "Design: {hash}" and "Verdict: READY", or name it with --verdict <file>, or waive: dialecte lot design {lot} --waive --by <who> --reason <text>; nothing written',
	reviewBlocking:
		'lot design: {name} says {verdict} for design {hash} of {lot}: record a new revision, or waive; nothing written',
	reviewDisagree:
		'lot design: {name} holds Verdict: lines that disagree for design {hash} of {lot}: a changed verdict goes in a new review file; nothing written',
	reviewOpenFence:
		'lot design: {name} leaves a code fence open, so its verdict is not read, for design {hash} of {lot}: close the fence; nothing written',
	reviewFolderGone:
		'lot design: {folder} is gone: name the review with --verdict <file>, or waive; nothing written',
	reviewNamesOther: 'lot design: {file} names no design {hash} of {lot}; nothing written',
	reviewNoVerdict:
		'lot design: {file} names design {hash} but holds no Verdict: line; nothing written',
	reviewTooMany: 'lot design: {count} reviews do not fit one approval line; nothing written',
	verdictUnreadable: 'lot design: review {file} cannot be read; nothing written',
	verdictEmpty: 'lot design: review {file} is empty; nothing written',
	verdictNotText: 'lot design: review {file} is not UTF-8 text; nothing written',
	verdictInScratch:
		'lot design: review {file} is in a temporary or scratch folder, which is wiped: keep it beside the design; nothing written',
	hintEarlierReady:
		'! {name} is READY for {earlier}, recorded before: the design changed since, so a review of {hash} is needed',
	hintNoVerdict: '! {name} names design {hash} but holds no Verdict: line',
	verdictReady: 'verdict READY in {names}',
	verdictMissing:
		'verdict missing: a review saved in {folder} names it with "Design: {hash}" and "Verdict: READY"',
	verdictBlocking: 'verdict {verdict} in {name}',
	verdictDisagree: 'verdict with lines that disagree in {name}',
	verdictOpenFence: 'verdict behind an open code fence in {name}',
	verdictFolderGone: 'verdict: {folder} is gone: name the review with --verdict <file>, or waive',
} as const

/** Between two review names of the verdict line. */
export const REVIEW_NAME_SEPARATOR = ', '

/** A design file's refusal line by its kind. */
export const DESIGN_FILE_REFUSAL_LINES = {
	unreadable: LOT_DESIGN_LINES.unreadable,
	empty: LOT_DESIGN_LINES.empty,
	'not-text': LOT_DESIGN_LINES.notText,
	'in-scratch': LOT_DESIGN_LINES.inScratch,
} as const

/** A named review's refusal line by its kind. */
export const REVIEW_FILE_REFUSAL_LINES = {
	unreadable: LOT_DESIGN_LINES.verdictUnreadable,
	empty: LOT_DESIGN_LINES.verdictEmpty,
	'not-text': LOT_DESIGN_LINES.verdictNotText,
	'in-scratch': LOT_DESIGN_LINES.verdictInScratch,
} as const
