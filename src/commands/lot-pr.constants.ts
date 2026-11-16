/** `dialecte lot pr`: its lines; `{lot}` the id given. */
export const LOT_PR_LINES = {
	prefix: 'lot pr: ',
	noWorktree: 'lot pr: {lot} has no worktree (a simulated lot, or its identity unreadable)',
	title: 'title: {title}',
	updated: 'pull request #{number} updated from the lot records: {url}',
	unchanged: 'pull request #{number} already reads the lot records: {url}',
	noPullRequest: 'no pull request yet: dialecte lot land {lot} --draft opens it with this text',
	headElsewhere:
		'! pull request #{number} is at {pushed}, the lot at {head}: the text describes the lot; dialecte lot land {lot} --draft pushes it',
	notOpen: 'lot pr: pull request #{number} is {state}: nothing sent',
} as const

/** The options `lot pr` takes: any other is a usage error (a mistyped `--print` must never send). */
export const LOT_PR_OPTIONS: readonly string[] = ['--print', '--json']
