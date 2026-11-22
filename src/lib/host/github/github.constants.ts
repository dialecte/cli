/** The GitHub adapter's constants: GitHub through the `gh` cli. */
import type { HostNouns, HostVendorName, QueueKind } from '../host.types.ts'

/** The vendor's name: its folder, and the config key `host`'s value. */
export const GITHUB_VENDOR_NAME: HostVendorName = 'github'

/** The hosts of an origin that mean GitHub; `ssh.github.com` is what `ssh -G` answers for the port-443 setup. */
export const GITHUB_REMOTE_HOSTS: readonly string[] = ['github.com', 'ssh.github.com']

/** GitHub's change-request nouns. */
export const GITHUB_NOUNS: HostNouns = {
	changeRequestNoun: 'pull request',
	changeRequestNouns: 'pull requests',
}

/** GitHub's word for each queue kind; a merge queue is GitHub's only queue. */
export const GITHUB_QUEUE_NOUNS: Readonly<Record<QueueKind, string>> = {
	queue: 'merge queue',
	'auto-merge': 'auto-merge',
	none: 'no queue',
}

/** Where a GitHub repository keeps its pull request template. */
export const GITHUB_CHANGE_REQUEST_TEMPLATE = '.github/pull_request_template.md'

/**
 * GitHub's change-request noun as words of an identifier, in lower case: an identifier holding one of these words
 * spells it (`pullRequest`, `PULL_URL`, `#pull`, `Pulls`, the long noun as one word `pullrequest`); a word that only
 * starts with it (`pulled`, `pullover`) does not.
 */
export const GITHUB_NOUN_WORDS: readonly string[] = ['pull', 'pulls', 'pullrequest', 'pullrequests']

/** The same noun in a file's path: `pull-request`, `pull_request`, `pullRequest`, in any case; only the long form. */
export const GITHUB_NOUN_PATH_PATTERN = /pull[-_]?request/i

/** The query of the queue a pull request's base offers: the repository allows auto-merge, the base has a merge queue. */
export const QUEUE_SETTINGS_QUERY =
	'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){autoMergeAllowed pullRequest(number:$number){isMergeQueueEnabled}}}'

/** The `gh` command. */
export const GH_COMMAND = 'gh'

/**
 * The GraphQL query of whether a pull request is queued: auto-merge on, or in the merge queue (`gh pr view` has no
 * merge-queue field). `{owner}` and `{repo}` are filled by `gh api` from the repository.
 */
export const QUEUED_QUERY =
	'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){isInMergeQueue autoMergeRequest{enabledAt}}}}'

/** A host call never prompts, and writes plain text. */
export const HOST_ENVIRONMENT = {
	GH_PROMPT_DISABLED: '1',
	GIT_TERMINAL_PROMPT: '0',
	// what gh writes is parsed: never coloured, whatever the caller's terminal asks
	NO_COLOR: '1',
	CLICOLOR_FORCE: '0',
	GH_FORCE_TTY: '',
} as const

/** What `gh` answers when the branch has no pull request: no pull request, not a refusal. */
export const NO_PULL_REQUEST_PATTERN = /no (open )?pull requests? found/i

/** The line comments of a pull request through `gh api`: `{number}` its number; one JSON object per line. */
export const REVIEW_COMMENTS_ENDPOINT = 'repos/{owner}/{repo}/pulls/{number}/comments'
export const REVIEW_COMMENTS_JQ =
	'.[] | {id, path, line: (.line // .original_line), body, replyTo: .in_reply_to_id}'

/** A check run's conclusions that pass; any other conclusion of a completed run fails. */
export const PASSING_CONCLUSIONS: readonly string[] = ['SUCCESS', 'NEUTRAL', 'SKIPPED']

/** The status of a check run that is done; any other is still pending. */
export const COMPLETED_STATUS = 'COMPLETED'

/** A commit status's states: the one that passes, and those still pending; any other fails. */
export const PASSING_STATUS_STATE = 'SUCCESS'
export const PENDING_STATUS_STATES: readonly string[] = ['PENDING', 'EXPECTED']

/** The type a commit status has in the rollup; every other entry is a check run. */
export const STATUS_CONTEXT_TYPE = 'StatusContext'

/** The gh-stack extension's command (`gh stack`). */
export const GH_STACK = 'stack'

/** Why the host links no stacks here: the gh-stack extension does not answer. */
export const NO_STACKS_REASON = 'gh stack is not installed'

/** The page of a pull request's changed files, after its own page. */
export const FILES_TAB_SUFFIX = '/files'

/**
 * The pull request whose line comments the live probe reads: a merged public one holding comments on a line and
 * replies, so a renamed key of the review comments shows.
 */
export const REVIEW_PROBE = { owner: 'cli', repo: 'cli', number: '15071' } as const

/** A branch no repository has: the live probe reads it to check what gh prints for no pull request. */
export const NO_SUCH_BRANCH = 'zz-dialecte-no-such-branch-probe'

/** The read that finds the pull request the other live probes read. */
export const GITHUB_SUBJECT_CALL = 'listMergedPullRequests' as const

/** How `gh pr list` is asked for the newest merged pull request. */
export const MERGED_STATE = 'merged'
export const ONE_PULL_REQUEST = '1'

/** The command that installs the gh-stack extension. */
export const GH_STACK_INSTALL = 'gh extension install github/gh-stack'

/** What the live probes of the GitHub vendor say; `{x}` filled per line. */
export const GITHUB_PROBE_TEXTS = {
	nothingToProbe: 'gh pr list: no merged pull request, nothing to probe',
	notTheJson: 'gh pr list: not the JSON it writes: {text}',
	newestMerged: 'pull request #{number}, the newest merged',
	needsPullRequest: 'no merged pull request to read: nothing to probe',
	pullRequestRead: '#{number} read; a branch with none reads as no pull request',
	pullRequestNone: '#{number} reads as no pull request',
	noPullRequestTextChanged: 'the text gh prints for no pull request changed: {refusal}',
	checksRead: '#{number}: checks {state}',
	queuedRead: '#{number}: queued {queued}',
	queueKindRead: '#{number}: {kind} ({noun})',
	commentsRead: '{reference}: {count} comments, {lines} on a line, {replies} replies',
	commentKeysChanged:
		'review-comment keys changed: {reference} reads {lines} comments on a line and {replies} replies, at least one of each expected',
	stacksOn: 'gh stack answers',
	stacksOff: '{why}: stacks off',
} as const
