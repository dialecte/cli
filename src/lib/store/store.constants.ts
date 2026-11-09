import type {
	LotStateName,
	RefusalRule,
	StoreFileNames,
	TransitionPosition,
} from './store.types.ts'

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
	simulatedStart: 'dialecte lot start {brief} --simulate {scenario}',
	manual: 'run the stations, then dialecte handover write <lots.json> --out {name}',
	wait: 'dialecte lot wait {name}',
	simulated: 'dialecte lot wait {name} --timeout 60',
	answer: 'dialecte lot answer {name} {question} "<answer>"',
	answerPerson: 'dialecte lot answer {name} {question} "<answer>" --by <who>',
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

/** The states on which no question stays open: a lot in one takes no question and no answer either. */
export const QUESTIONS_CLOSED_STATES: readonly LotStateName[] = ['canceled', 'failed', 'committed']

/** The longest question text, question details and answer, in characters (33S section 4). */
export const QUESTION_TEXT_LIMIT = 500
export const QUESTION_DETAILS_LIMIT = 4000
export const ANSWER_LIMIT = 2000

/** A question id: `q` and its number. */
export const QUESTION_ID_PREFIX = 'q'

/**
 * A question id, as a record holds it and as an answer's file name holds it (`q<k>.json`): `q<k>`, `k` 1 or more,
 * no leading zero. The one pattern of an id.
 */
export const QUESTION_ID_PATTERN = /^q[1-9]\d*$/

/** Who a question asks; the audience type derives from it. */
export const QUESTION_AUDIENCES = ['caller', 'person'] as const

/** A time as the store writes it (`Date.prototype.toISOString`): the one shape a record's time may hold. */
export const STORE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** A lot's index as its identity holds it: digits only. */
export const LOT_INDEX_PATTERN = /^\d+$/

/**
 * Why a lot's records read as damaged (validated once, on read): fixed words, never a field of the record, so
 * nothing forged reaches a line.
 */
export const RECORD_DAMAGE_REASONS = {
	index: 'identity.json holds an index that is not digits',
	created: 'identity.json holds a created time the store does not write',
	questionId: 'a transition holds a question id that is no q<k>',
	audience: 'a transition holds a question audience that is neither caller nor person',
	position: 'a transition holds a position whose step, of or round is no non-negative integer',
	at: 'a transition holds a time the store does not write',
	answerName: 'an answer file is named after no question id (q<k>.json, k 1 or more)',
	answerQuestion: 'an answer file names another question than its file name',
	entryState: 'the registry entry naming the lot holds an unknown state',
	entryWritten: 'the registry entry naming the lot holds a written time the store does not write',
	marker: 'a hand-over marker holds a time the store does not write',
	scenario:
		'scenario.json is no scenario the simulator plays (unreadable, no steps, or a step it cannot play)',
} as const

/** Who answers a caller question when `--by` is left out; a person's answer never takes it. */
export const CALLER = 'caller'

/** The option naming who answers or stops, as the refusals of its rule name it. */
export const BY_OPTION = '--by'

/** The position of a lot with no transition yet: no station has run. */
export const NO_POSITION: TransitionPosition = { step: 0, of: 0, station: null, round: null }

/** The reason of a question transition; `{id}` is the question's id. */
export const QUESTION_REASON = 'question {id} asked'

/**
 * The characters a text an agent wrote prints escaped (33S case 40), as ranges of code points, both ends included:
 * C0 controls, DEL and C1 controls, the Arabic letter mark, the bidi marks, the line and paragraph separators, the
 * bidi embeddings and overrides, the bidi isolates.
 */
export const DISPLAY_ESCAPED_RANGES: ReadonlyArray<readonly [number, number]> = [
	[0x00, 0x1f],
	[0x7f, 0x9f],
	[0x61c, 0x61c],
	[0x200e, 0x200f],
	[0x2028, 0x2029],
	[0x202a, 0x202e],
	[0x2066, 0x2069],
]

/** The station whose steps a scenario plays at round 1 (every other step is at no round). */
export const ROUND_STATION = 'reviewer'

/** Who publishes the transitions a simulated lot plays (`cause.by`). */
export const SIMULATOR = 'simulator'

/**
 * The reasons of the transitions a simulated lot plays, by what caused them; `{station}` is the step's station,
 * `{question}` the id of the question answered.
 */
export const SIMULATED_REASONS: Readonly<
	Record<'station' | 'limit' | 'fail' | 'ready' | 'answer', string>
> = {
	station: 'the {station} ran (simulated)',
	limit: 'the {station} reached its limit (simulated)',
	fail: 'the full gate failed (simulated)',
	ready: 'the hand-over is ready (simulated)',
	answer: '{question} answered, the {station} ran (simulated)',
}

/**
 * The pause before the one re-read of a lot whose only evidence of `canceled` is `abandoned.json` (33S section 4,
 * the residual seam of row 2), and how often `lot wait` reads a real lot, in milliseconds.
 */
export const REREAD_PAUSE_MS = 100
export const POLL_MS = 1000

/** The milliseconds of a second, for `--timeout <seconds>`. */
export const MILLISECONDS_PER_SECOND = 1000

/** The brief checks a simulated start records in `wouldRefuse` instead of refusing (33S section 5). */
export const SIMULATED_FINDING_RULES: readonly RefusalRule[] = ['overlap', 'branch-exists']

/** The radix an escaped character's code is written in. */
export const ESCAPE_RADIX = 16

/** What separates the lines of a text form: kept when each line is escaped. */
export const LINE_FEED = '\n'
