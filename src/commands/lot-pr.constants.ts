/** `dialecte lot pr`: its lines; `{lot}` the id given. */
export const LOT_PR_LINES = {
	prefix: 'lot pr: ',
	noWorktree: 'lot pr: {lot} has no worktree (a simulated lot, or its identity unreadable)',
	title: 'title: {title}',
	updated: 'pull request #{number} updated from the lot records: {url}',
	unchanged: 'pull request #{number} already reads the lot records: {url}',
	noPullRequest: 'no pull request yet: dialecte lot land {lot} --draft opens it with this text',
	notOpen: 'lot pr: pull request #{number} is {state}: nothing sent',
} as const
