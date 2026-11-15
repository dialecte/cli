/** The environment git runs in for the cli's own calls, and the gate's steps. */

/**
 * No optional lock: a `git status` or `git diff` reading the working tree does not refresh and write the
 * index (taking `index.lock`), so a read never collides with a commit running at the same time.
 */
export const GIT_READ_ENVIRONMENT = { GIT_OPTIONAL_LOCKS: '0' } as const

/** The header `git cat-file --batch` writes before an object's content: `<oid> <type> <size>`. */
export const CAT_FILE_HEADER_PATTERN = /^[0-9a-f]+ (?<type>\w+) (?<size>\d+)$/
