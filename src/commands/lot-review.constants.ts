/** `dialecte lot review`: its flags and lines; `{lot}` the lot's name. */

/** The flags `lot review` takes, without the dashes. */
export const LOT_REVIEW_FLAGS = ['no-open', 'comments'] as const

/** The options `lot review` takes followed by a value, without the dashes: `--comments`' round. */
export const LOT_REVIEW_OPTIONS = ['round'] as const

export const LOT_REVIEW_LINES = {
	prefix: 'lot review: ',
	header: 'lot review {lot} · {state} · {branch}',
	noChangeRequest: 'no {changeRequestNoun} yet: dialecte lot land {lot} opens it',
	changeRequestGone: '{changeRequestNoun} #{number} cannot be found',
	changeRequest: '{changeRequestNoun} #{number}{draft} · {url}',
	draft: ' draft',
	notOpen: ' {state}',
	heads: 'heads: {changeRequestNoun} {pushed}, landed {landed}, worktree {head}',
	checks: 'checks: {state}',
	checksNamed: 'checks: {state} ({names})',
	checksUnread: 'checks: not read ({refusal})',
	goal: 'goal: {goal}',
	noGoal: 'goal: not recorded',
	step: 'step {number}: {title}',
	spec: '  spec: {spec}',
	behaviour: '  - {behaviour}',
	tests: 'tests: {tdd} · {gate}',
	testsUnreadable: 'tests: tests.json cannot be read: {why}',
	tdd: 'tdd {cases} case(s) ({counts})',
	noTdd: 'tdd not recorded',
	gate: 'gate {mode} on {head}',
	noGate: 'gate not recorded',
	gateUnknown: 'gate: {unknown}',
	decisions: 'decisions:',
	decision: '  - {decision} ({by}, {when})',
	findings: 'findings:',
	finding: '  - {id} round {round} {severity} {state} {at}: {finding}',
	none: '  none',
	standard: 'standard: {status} - {detail}',
	approveReady: 'approve: ready: dialecte lot approve {lot} --by <who>',
	approveRefused: 'approve: would refuse: {reasons}',
	files: 'files: {files}',
	filesOpened: 'files: {files} opened',
	pulled: 'lot review: {id} {severity} {at} from comment {comment}',
	commentsCut: 'lot review: the pull stopped after {done}: {reason}',
	pulledNone: 'lot review: already: every comment of {changeRequestNoun} #{number} is a finding',
	filesNotOpened: 'files: {files} (not opened: {refusal})',
} as const
