/** `dialecte lot brief`: its lines; `{lot}` the lot, `{field}` a brief field. */
export const LOT_BRIEF_LINES = {
	rewritten: 'lot brief: {lot} rewritten ({fields}) by {by}',
	unchanged: 'lot brief: {lot} already holds this brief: nothing written',
	fixedField:
		'lot brief: {field} changed: only the summary, the issue, step titles and behaviours change after the start, nothing written',
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

/** The brief field holding the steps, whose titles and behaviours are public. */
export const STEPS_FIELD = 'steps'
/** The fields `lot brief` may change, at the top of the brief and in each step. */
export const PUBLIC_BRIEF_FIELDS: readonly string[] = ['summary', 'issue', STEPS_FIELD]
export const PUBLIC_STEP_FIELDS: readonly string[] = ['title', 'behaviours']
