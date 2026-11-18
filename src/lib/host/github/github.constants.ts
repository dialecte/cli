/** The GitHub adapter's constants: GitHub through the `gh` cli. */
import type { HostVendorName } from '../host.types.ts'

/** The vendor's name: its folder, and the config key `host`'s value. */
export const GITHUB_VENDOR_NAME: HostVendorName = 'github'

/** The hosts of an origin that mean GitHub; `ssh.github.com` is what `ssh -G` answers for the port-443 setup. */
export const GITHUB_REMOTE_HOSTS: readonly string[] = ['github.com', 'ssh.github.com']

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
