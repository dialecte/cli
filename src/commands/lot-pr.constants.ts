/** `dialecte lot pr`: its lines; `{lot}` the id given. */
export const LOT_PR_LINES = {
	prefix: 'lot pr: ',
	title: 'title: {title}',
	updated: 'pull request #{number} updated from the lot records: {url}',
	unchanged: 'pull request #{number} already reads the lot records: {url}',
	noPullRequest: 'no pull request yet: dialecte lot land {lot} --draft opens it with this text',
	headElsewhereDraft:
		'! pull request #{number} is at {pushed}, the lot at {head}: the text describes the lot; dialecte lot land {lot} --draft pushes it',
	headElsewhere:
		'! pull request #{number} is at {pushed}, the lot at {head}: the text describes the lot; dialecte lot land {lot} pushes it',
	notOpen: 'lot pr: pull request #{number} is {state}: nothing sent',
} as const

/** The options `lot pr` takes: any other is a usage error (a mistyped `--print` must never send). */
export const LOT_PR_OPTIONS: readonly string[] = ['--print', '--json']

/** Where a lot's pull request verb finds the lot: its refusals, after `lot <verb>: `; `{lot}` the id given. */
export const LOT_PLACE_LINES = {
	prefix: 'lot {verb}: ',
	damaged: '{lot} is damaged: dialecte lot status {lot} says how',
	noWorktree: '{lot} has no worktree (a simulated lot, or its identity unreadable)',
} as const
