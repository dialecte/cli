/** What the tests of a hand-over on a package with a scoped gate step share: the hook it runs, the lots it hands over. */

import { HOOK_STEP_LINES, TEST_COUNT_LINE } from './scratch-checks.constants.ts'

/**
 * The base line a scoped package's hook prints as `gate --hook` does: the base a hand-over hands down, else the
 * merge-base of HEAD and `main` (the base of a branch cut from `main`).
 */
export const HOOK_BASE_LINE_COMMAND =
	'echo "gate --hook: base ${DIALECTE_HANDOVER_BASE:-$(git merge-base HEAD main)} (base-branch), selected T0"'

/** The lines the hook prints before and after its base line: npm's header for the step, then vitest's count. */
export const HOOK_HEADER_LINES = HOOK_STEP_LINES.slice(0, 3)
export const HOOK_COUNT_LINE = TEST_COUNT_LINE

/** The two lots of a hand-over on the base branch: the source, then the changelog. */
export const SOURCE_LOT = { paths: ['src/'], message: 'feat(read): read answers one' }
export const CHANGELOG_LOT = {
	paths: ['CHANGELOG.md'],
	message: 'docs(changelog): read answers one',
}

export const TWO_LOTS = [SOURCE_LOT, CHANGELOG_LOT]

/** The commit that moves the base branch without changing its tree, and the one that adds a file to it. */
export const EMPTY_MOVE_MESSAGE = 'chore: the base moves'
export const MOVED_FILE = 'docs/moved.md'
export const MOVED_FILE_TEXT = 'moved\n'
export const MOVED_FILE_MESSAGE = 'docs(moved): the base moves'

/** The merge lots' message. */
export const MERGE_MAIN_MESSAGE = 'merge: bring main in'
