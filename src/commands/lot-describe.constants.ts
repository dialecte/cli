/** `dialecte lot describe`: its lines; `{lot}` the id given, `{changeRequestNoun}` the host's noun. */
export const LOT_DESCRIBE_LINES = {
	prefix: 'lot describe: ',
	title: 'title: {title}',
	updated: '{changeRequestNoun} #{number} updated from the lot records: {url}',
	unchanged: '{changeRequestNoun} #{number} already reads the lot records: {url}',
	noChangeRequest: 'no {changeRequestNoun} yet: dialecte lot land {lot} opens it with this text',
	headElsewhere:
		'! {changeRequestNoun} #{number} is at {pushed}, the lot at {head}: the text describes the lot; dialecte lot land {lot} pushes it',
	notOpen: 'lot describe: {changeRequestNoun} #{number} is {state}: nothing sent',
} as const

/** The verb, as `lot <verb>: ` refusals name it. */
export const LOT_DESCRIBE_VERB = 'describe'

/** The options `lot describe` takes: any other is a usage error (a mistyped `--print` must never send). */
export const LOT_DESCRIBE_OPTIONS: readonly string[] = ['--print', '--json']

/** Where a lot's change-request verb finds the lot: its refusals, after `lot <verb>: `; `{lot}` the id given. */
export const LOT_PLACE_LINES = {
	prefix: 'lot {verb}: ',
	damaged: '{lot} is damaged: dialecte lot status {lot} says how',
	noWorktree: '{lot} has no worktree (a simulated lot, or its identity unreadable)',
} as const
