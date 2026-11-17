/** The host seam's constants: GitHub through the `gh` cli. */

/** The `gh` command and the fields a pull request is read with. */
export const GH_COMMAND = 'gh'
/** The fields the checks on a pull request's head are read with. */
export const CHECKS_FIELDS = 'headRefOid,statusCheckRollup'

export const PULL_REQUEST_FIELDS = 'number,url,title,body,state,isDraft,autoMergeRequest,headRefOid'

/** How long a host call may take: a read is short (offline answers fast), a write may wait on the host. */
export const HOST_READ_TIMEOUT_MS = 10_000
export const HOST_WRITE_TIMEOUT_MS = 60_000

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

/**
 * The command (and its first words) that opens a page in the browser, by platform; `default` for the others. Windows
 * opens through `url.dll`, never `cmd /c start`: cmd reads a link's `&` and `^` as its own syntax.
 */
export const BROWSER_OPENERS: Readonly<Record<string, readonly string[]>> & {
	default: readonly string[]
} = {
	darwin: ['open'],
	win32: ['rundll32', 'url.dll,FileProtocolHandler'],
	default: ['xdg-open'],
}

/** How long the browser opener may take: it hands the page over and returns. */
export const OPEN_TIMEOUT_MS = 10_000

/** The page of a pull request's changed files, after its own page. */
export const FILES_TAB_SUFFIX = '/files'

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
