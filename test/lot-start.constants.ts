/** The time every `lot start` of the tests runs at: the identity's `created` and the first transition's `at`. */
export const START_NOW = new Date('2026-11-08T12:00:00.000Z')

/** The lot a first start of the default brief makes in the scratch workspace (index 0001, repository `repo`). */
export const LOT_NAME = '0001-repo-dataflow-subscribe'

/** The branch of the default brief, and the base ref it starts from. */
export const BRIEF_BRANCH = 'feat/dataflow-subscribe'
export const BRIEF_BASE = 'main'

/** The usage lines of the two verbs, as the map writes them after `dialecte lot `. */
export const START_USAGE =
	'start <brief.json> [--effort low|medium|high] [--dry-run] [--simulate <scenario>] [--json]'
export const STATUS_USAGE = 'status <id> [--json]'

/** The second repository of the workspace (case 32), its brief file and what that brief names. */
export const OTHER_REPOSITORY = 'other'
export const OTHER_BRIEF_FILE = 'brief-other.json'
export const OTHER_BRANCH = 'feat/other'
export const OTHER_LOT_NAME = '0001-other-other'

/** An error code a file system without hard links answers with. */
export const LINK_REFUSAL_CODES: readonly string[] = ['EPERM', 'ENOTSUP', 'EXDEV']

/** The message of the refusals the tests inject. */
export const INJECTED_LINK_MESSAGE = 'hard links are not supported here'
export const INJECTED_WORKTREE_MESSAGE = 'the worktree could not be made'
export const INJECTED_SYMLINK_MESSAGE = 'symbolic links are not allowed here'
export const INJECTED_BREAK_MESSAGE = 'the claim step broke'
export const INJECTED_REFUSAL_MESSAGE = 'the store refuses this write'

/** The lot another start left, found at the step that names the new lot's folder. */
export const OVERLAPPING_LOT = '0003-repo-taken'

/** A byte that is no UTF-8: a lone continuation of Latin-1 `é`. */
export const NON_UTF8_BYTE = 0xe9
