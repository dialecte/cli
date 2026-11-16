/** The host seam's constants: GitHub through the `gh` cli. */

/** The `gh` command and the fields a pull request is read with. */
export const GH_COMMAND = 'gh'
export const PULL_REQUEST_FIELDS = 'number,url,title,state,isDraft,autoMergeRequest,headRefOid'

/** How long a host call may take: a read is short (offline answers fast), a write may wait on the host. */
export const HOST_READ_TIMEOUT_MS = 10_000
export const HOST_WRITE_TIMEOUT_MS = 60_000

/** A host call never prompts. */
export const HOST_ENVIRONMENT = { GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' } as const

/** What `gh` answers when the branch has no pull request: no pull request, not a refusal. */
export const NO_PULL_REQUEST_PATTERN = /no (open )?pull requests? found/i
