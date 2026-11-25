/** `dialecte lot brief`: its lines; `{lot}` the lot, `{field}` a brief field. */
export const LOT_BRIEF_LINES = {
	rewritten: 'lot brief: {lot} rewritten ({fields}) by {by}',
	unchanged: 'lot brief: {lot} already holds this brief: nothing written',
	fixedField:
		"lot brief: {field} changed: only the summary, the issue, the reviewer sections, step titles and behaviours, and each lot's commit message change after the start, nothing written",
	refused: 'lot brief: {detail}: nothing written',
	unread: 'lot brief: {path} does not read as JSON: nothing written',
	unreadable: 'lot brief: {path} cannot be read: nothing written',
	transitionUnwritten: 'lot brief: its transition cannot be written: {reason}: nothing written',
	simulated: 'lot brief: {lot} is simulated: it plays its scenario, nothing written',
	damaged: 'lot brief: {lot} is damaged: dialecte lot status {lot} says how',
	notWorking:
		'lot brief: {lot} is {state}: only a working or ready lot takes a new brief, nothing written',
} as const

/** The value options of `lot brief`. */
export const LOT_BRIEF_VALUE_OPTIONS: readonly string[] = ['from', 'by', 'reason']

/** The top-level brief fields `lot brief` may change: public text. */
export const PUBLIC_TEXT_FIELDS: readonly string[] = ['summary', 'issue', 'sections']

/**
 * The brief's lists whose items hold public text, and those fields of each item `lot brief` may change: a list's length
 * and every other field of an item stay as started.
 */
export const PUBLIC_LIST_FIELDS: Readonly<Record<string, readonly string[]>> = {
	steps: ['title', 'behaviours'],
	lots: ['message'],
}
