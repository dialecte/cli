/** The environment git runs in for the cli's own calls, and the gate's steps. */

/**
 * No optional lock: a `git status` or `git diff` reading the working tree does not refresh and write the
 * index (taking `index.lock`), so a read never collides with a commit running at the same time.
 */
export const GIT_READ_ENVIRONMENT = { GIT_OPTIONAL_LOCKS: '0' } as const

/** The header `git cat-file --batch` writes before an object's content: `<oid> <type> <size>`. */
export const CAT_FILE_HEADER_PATTERN = /^[0-9a-f]+ (?<type>\w+) (?<size>\d+)$/

/** The remote a fetch reads: the host where the merge queue lands. */
export const ORIGIN_REMOTE = 'origin'

/** How long a fetch of origin may take before the last known refs are used instead. */
export const FETCH_TIMEOUT_MS = 60_000

/** What a fetch of origin answers when it fails; `{reason}` the first line of git's message. */
export const FETCH_FAILED_LINE = 'origin not fetched ({reason}): the last known refs are read'

/** A fetch never prompts: no terminal credential prompt, ssh in batch mode. */
export const FETCH_ENVIRONMENT = {
	GIT_TERMINAL_PROMPT: '0',
	GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
} as const

/** The oldest git the cli runs on (`merge-tree --write-tree`): major, minor. */
export const GIT_FLOOR = [2, 38] as const

/** The line `git --version` prints: its version, major and minor. */
export const GIT_VERSION_PATTERN = /^git version (?<version>(?<major>\d+)\.(?<minor>\d+)\S*)/
