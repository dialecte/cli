/** The command's name, the start of every usage error (`facts <verb>: ...`). */
export const FACTS_COMMAND = 'facts'

/** Each verb of `facts`: the options that take a value and the flags it knows. */
export const FACTS_VERB_OPTIONS = {
	list: { valueOptions: ['about', 'state'], flags: ['json'] },
	show: { valueOptions: [], flags: ['json'] },
	forget: { valueOptions: ['reason'], flags: ['json'] },
} as const

/**
 * What `list --state` takes: a state of the current facts (`unchecked` also holds a person fact given without
 * documents), `orphan` (a fact file no pointer names) or `all` (every fact file).
 */
export const LIST_STATES = [
	'valid',
	'stale',
	'unverifiable',
	'unchecked',
	'forgotten',
	'orphan',
	'all',
] as const

/** The answers of the command; `{...}` are filled in. */
export const FACTS_MESSAGES = {
	unknownVerb: 'expected a verb: list | show | forget',
	unexpectedWords: 'unexpected {words}',
	unknownState: 'unknown state {state}: expected one of {states}',
	needsId: 'expected one fact id (F-<n>)',
	needsReason: 'expected --reason <text>: say why the fact no longer holds',
	unknownId:
		'no fact {id} in {folder}{closest} - `dialecte facts list --state all` lists every fact file',
	closest: ' - closest: {names}',
	unreadable:
		'the fact file {path} is not readable JSON: nothing shown or changed - read the file and record the fact again',
	noFacts: 'no facts in {folder}',
	noneMatch: 'no facts match in {folder} - `dialecte facts list --state all` lists every fact file',
	forgotten: '{id} forgotten - the file is kept, with the reason in its history',
	forgottenAlready: '{id} was forgotten already - nothing written',
} as const

/** How many closest ids an unknown id gets. */
export const CLOSEST_ID_LIMIT = 5

/** Where a question is cut on a `list` line, and the mark that says it was cut. */
export const QUESTION_CUT = 80
export const CUT_MARK = '...'

/** What starts the last column of a stale or unverifiable fact's line: why, and the fix. */
export const REASON_MARK = '- '

/** The separator of the columns of a text answer, and the indent of a history line under `show`. */
export const COLUMN_SEPARATOR = '  '
export const HISTORY_INDENT = '  '

/** The members of a history line `show` prints apart from the rest. */
export const HISTORY_SHOWN_FIRST = ['at', 'event', 'fact'] as const

/** The view state that `--state unchecked` and a list line add for a person fact given without documents. */
export const UNCHECKED_STATE = 'unchecked'
