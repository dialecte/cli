import type { LotStateName, StoreFileNames } from './store.types.ts'

/** The names inside a lot folder that the store itself writes. */
export const STORE_FILES: StoreFileNames = {
	brief: 'brief.json',
	plan: 'plan.md',
	scenario: 'scenario.json',
	identity: 'identity.json',
	transitions: 'transitions',
	answers: 'answers',
	asks: 'asks',
}

/** The folder of the store in the repository's git common folder. */
export const STORE_FOLDER = 'dialecte-lots'

/** A transition's file name inside `transitions/`: six digits. */
export const TRANSITION_FILE_PATTERN = /^\d{6}\.json$/

/** The digits of a transition's file name. */
export const TRANSITION_NUMBER_WIDTH = 6

/** The extension of a record file. */
export const RECORD_EXTENSION = '.json'

/** An answer's file name inside `answers/`. */
export const ANSWER_FILE_PATTERN = /^q\d+\.json$/

/** The number of the question an answer's file name holds (`q12.json` → 12). */
export const ANSWER_NUMBER_PATTERN = /^q(\d+)\.json$/

/** The `name` of the error a store write refuses with (a command turns it into exit 2). */
export const STORE_REFUSAL = 'StoreRefusal'

/** The highest transition number. */
export const TRANSITION_CEILING = 999_999

/** How the numbers of a refusal are written (`1,000,000`). */
export const NUMBER_LOCALE = 'en-US'

/** The infix of a temporary name: `<final name>.tmp-<pid>-<n>` for a file, `.<name>.tmp-<pid>` for a folder. */
export const TEMPORARY_INFIX = '.tmp-'

/**
 * What follows the final name in a temporary file of a writer (`<final name>.tmp-<pid>-<n>`), anchored at both
 * ends; the first group is the writer's pid.
 */
export const TEMPORARY_FILE_SUFFIX_PATTERN = /^\.tmp-(\d+)-\d+$/

/** A lot folder being built: `.<name>.tmp-<pid>`; the first group is the builder's pid. */
export const TEMPORARY_FOLDER_PATTERN = /^\..+\.tmp-(\d+)$/

/** The mode of a record published read-only. */
export const READ_ONLY_MODE = 0o444

/** The error codes of a file system that makes no hard link. */
export const HARD_LINK_UNSUPPORTED_CODES: readonly string[] = ['EPERM', 'ENOTSUP']

/** The mode of a file published writable. */
export const WRITABLE_MODE = 0o644

/** The permission bits of a mode. */
export const PERMISSION_BITS = 0o777

/** The entry of a `.git` file pointing to the git folder of a linked worktree. */
export const GITDIR_LINE_PATTERN = /^gitdir:\s*(.+?)\s*$/m

/** The `.git` entry a repository's work tree holds, and the file of a git folder naming its common folder. */
export const GIT_ENTRY = '.git'
export const COMMONDIR_FILE = 'commondir'

/** What a git common folder holds, by which a `dialecte-lots` folder is told from a look-alike. */
export const COMMON_FOLDER_FILE = 'HEAD'
export const COMMON_FOLDER_FOLDERS: readonly string[] = ['objects', 'refs']

/** The variable naming the state folder, and the state folder below the home folder when it is unset or empty. */
export const STATE_HOME_VARIABLE = 'XDG_STATE_HOME'
export const DEFAULT_STATE_SEGMENTS: readonly string[] = ['.local', 'state']

/** The user's store list below the state folder. */
export const STORE_LIST_SEGMENTS: readonly string[] = ['dialecte', 'lot-stores']

/** What ends a line: of the store list, of a message a lot verb answers. */
export const LINE_SEPARATOR_PATTERN = /\r?\n/

/** What joins a message's lines when JSON holds it on one line. */
export const REFUSAL_LINE_SEPARATOR = '; '

/** The link a lot's worktree holds to its lot folder, below the worktree. */
export const LOT_LINK_SEGMENTS: readonly string[] = ['.dialecte', 'lot']

/** An index alone, and a full name (four digits or more, a dash, the rest). */
export const INDEX_ID_PATTERN = /^\d+$/
export const FULL_NAME_ID_PATTERN = /^\d{4,}-.+/

/** A word of an id's shape: an index or a full name. */
export const ID_PATTERNS: readonly RegExp[] = [INDEX_ID_PATTERN, FULL_NAME_ID_PATTERN]

/** The name of a review throwaway: its lot's name and `-round-<n>`. */
export const THROWAWAY_NAME_PATTERN = /-round-\d+$/

/**
 * The commands a lot's state calls for next (33S section 7, D18), and the real start a dry run calls for; `{name}`
 * is the lot's full name, `{question}` a question id, `{handover}` a registry name, `{brief}` a shell-quoted path.
 */
export const NEXT_COMMANDS = {
	start: 'dialecte lot start {brief}',
	manual: 'run the stations, then dialecte handover write <lots.json> --out {name}',
	simulated: 'dialecte lot wait {name} --timeout 60',
	answer: 'dialecte lot answer {name} {question} "<answer>" --by <who>',
	result: 'dialecte lot result {name}',
	show: 'dialecte handover show {handover}',
	run: 'dialecte handover run {handover}',
	stop: 'dialecte lot stop {name} --reason <text>',
} as const

/** What runs a lot in S: a person or a host runs the stations by hand, or the simulator plays a scenario. */
export const RUNNERS = { manual: 'manual', simulated: 'simulated' } as const

/** The states of a closed lot: its worktree is kept by no lot (33S section 11). */
export const LOTS_KEEPING_NOTHING: readonly LotStateName[] = ['committed', 'canceled']

/** Why `worktree prune` and `lot close` keep a worktree an open lot names. */
export const LOT_KEEP_REASON = 'lot {name} {state}'

/** The states on which no question stays open. */
export const QUESTIONS_CLOSED_STATES: readonly LotStateName[] = ['canceled', 'failed', 'committed']
