/** `dialecte lot approve`: its options, the cli's own approver and package, and its lines; `{lot}` the lot's name. */

/** The options `lot approve` takes followed by a value, without the dashes. */
export const APPROVE_OPTIONS = ['by', 'reason'] as const

/** The package whose lots `--by orchestrator` approves: the cli knows itself by its name. */
export const CLI_PACKAGE_NAME = '@dialecte/cli'

/** The schema of an `approvals.jsonl` line. */
export const APPROVAL_LINE_SCHEMA = 1

/** The states a lot is approved in: still at work. */
export const APPROVABLE_STATES: readonly string[] = ['working', 'ready']

export const LOT_APPROVE_LINES = {
	prefix: 'lot approve: ',
	orchestratorElsewhere:
		"lot approve: {package} lots are approved by a person: --by orchestrator is for the cli's own lots",
	notApprovable: 'lot approve: {lot} is {state}: only a lot at work is approved',
	noLanding: 'lot approve: {lot} has no pull request yet: dialecte lot land {lot} opens it',
	noChangeRequest: 'lot approve: pull request #{number} of {lot} cannot be found',
	notOpen: 'pull request #{number} is {state}',
	lotNotApprovable: 'the lot is {state}',
	worktreeElsewhere:
		'the worktree is at {head}, the lot landed {landed} (lot land {lot} pushes it)',
	checksElsewhere: 'checks ran on {checked}, not the landed {landed}',
	refused: 'lot approve: {lot} not approved: {reasons}; nothing recorded, nothing queued',
	headElsewhere:
		'pull request #{number} is at {pushed}, the lot landed {landed} (lot land {lot} pushes it)',
	checksFailing: 'checks failing on the head: {names}',
	checksPending: 'checks pending on the head: {names}',
	checksNone: 'no check on the head yet',
	blocking: 'findings open: {rows}',
	approved: 'lot approve: {lot} approved by {by} on {head}, pull request #{number} queued',
	alreadyApproved:
		'lot approve: {lot} already approved by {by} on {head}, pull request #{number} queued',
	notQueued:
		'lot approve: {lot} approved by {by} on {head}, pull request #{number} not queued: {refusal}',
} as const
