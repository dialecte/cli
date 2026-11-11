import type { PlanEntryKind, PlanHeavyKind } from './plan-block.types.ts'

/** The info string of the one fenced block of a plan holding its lots. */
export const PLAN_FENCE_INFO = 'json dialecte-lots'

/** A fence's opening or closing line: three or more backticks, then the info string of an opening one. */
export const FENCE_LINE_PATTERN = /^(`{3,})(.*)$/

/** The extension of a plan file, and the suffix of the file beside it that may hold the block instead. */
export const PLAN_EXTENSION = '.md'
export const SIDECAR_SUFFIX = '.lots.json'

/** The block's schema version. */
export const PLAN_SCHEMA = 1

/** The shape of an entry id and of a group name, and their longest length. */
export const PLAN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*$/
export const PLAN_ID_MAX_LENGTH = 40

/** The longest title of an entry. */
export const PLAN_TITLE_MAX_LENGTH = 120

/** What breaks a text that must stay on one line. */
export const LINE_BREAK_PATTERN = /[\r\n]/

/** The kinds of an entry, and the kinds that change a repository (they take a scope and a match). */
export const PLAN_ENTRY_KINDS: readonly PlanEntryKind[] = ['lot', 'fix', 'spec', 'person']
export const PLAN_REPOSITORY_KINDS: readonly PlanEntryKind[] = ['lot', 'fix']

/** The extra heavy steps an entry may declare. */
export const PLAN_HEAVY_KINDS: readonly PlanHeavyKind[] = ['mutation', 'browser', 'release']

/** The keys of the block, of an entry and of an entry's match: any other key is refused. */
export const PLAN_BLOCK_KEYS: readonly string[] = ['schema', 'repositories', 'shared', 'lots']
export const PLAN_ENTRY_KEYS: readonly string[] = [
	'id',
	'group',
	'title',
	'kind',
	'dependsOn',
	'spec',
	'scope',
	'heavy',
	'brief',
	'match',
	'parked',
]
export const PLAN_MATCH_KEYS: readonly string[] = ['branch', 'handover', 'feature']

/** The `match` keys no two `lot` or `fix` entries share: each names the records of one entry only. */
export const PLAN_UNIQUE_MATCH_KEYS: readonly ('handover' | 'feature')[] = ['handover', 'feature']

/** The scope entry naming a whole repository: a block-only sentinel, kept as it is. */
export const WHOLE_REPOSITORY_ENTRY = '.'

/** What a `.`-only entry is made of (`.`, `./`): the whole repository once normalised. */
export const WHOLE_REPOSITORY_PATTERN = /^\.[./]*$/

/** The line of a spec saying its status, the status of a spec still being written, the emphasis stripped first. */
export const SPEC_STATUS_PREFIX = 'Status:'
export const SPEC_DRAFT_STATUS = 'DRAFT'
export const SPEC_EMPHASIS_PATTERN = /[*_]/g

/** The file of a linked worktree's git folder naming what it has checked out. */
export const LINKED_WORKTREE_HEAD_FILE = 'HEAD'

/** The HEAD of a linked worktree with a branch checked out. */
export const BRANCH_HEAD_PATTERN = /^ref: refs\/heads\/(.+?)\s*$/

/** A linked worktree named by the store's index (`0016-cli-events-report-l0`): a lot's, matched or not. */
export const INDEX_WORKTREE_PATTERN = /^\d{4}-/

/** A review throwaway (`<lot>-round-<n>`) or a verify worktree (`<lot>-verify`) of a lot's worktree. */
export const THROWAWAY_WORKTREE_PATTERN = /^(.+)-(?:round-\d+|verify)$/

/** The branch of a review or verify throwaway: the lot's branch plus `-round-<n>` or `-verify`. */
export const THROWAWAY_BRANCH_PATTERN = THROWAWAY_WORKTREE_PATTERN

/** The note of an entry open by its worktree alone, and the start of the note of a pending hand-over. */
export const MANUAL_OPEN_NOTE = 'manual, no hand-over yet'

/** The note of outside work read from a record that does not read: `damaged: <file>`. */
export const DAMAGED_NOTE_PREFIX = 'damaged:'
export const PENDING_NOTE_PREFIX = 'pending since'

/** The length of the date part (`2026-11-04`) of a registry entry's ISO time. */
export const ISO_DATE_LENGTH = 10

/** The lot states of a store lot that make its entry open. */
export const OPEN_LOT_STATES: readonly string[] = ['working', 'input-required', 'ready', 'failed']

/** The command a proposal names when its brief exists: every new lot starts with it. */
export const LOT_START_COMMAND = 'dialecte lot start'

/** The folder of the plan marks below the state folder, a marks file's extension and its name's hex length. */
export const PLAN_MARKS_SEGMENTS: readonly string[] = ['dialecte', 'plans']
export const PLAN_MARKS_EXTENSION = '.jsonl'
export const PLAN_MARKS_NAME_LENGTH = 16

/** The permission bits of a marks file. */
export const PLAN_MARKS_FILE_MODE = 0o644

/** The heavy-marker steps of the whole-suite runs every lot makes: a proposal stacks with each of them. */
export const WHOLE_SUITE_STEPS: readonly string[] = [
	'gate-full',
	'gate-release',
	'contrib',
	'rehearsal',
]

/** The marker step of a declared `mutation`. */
export const MUTATION_STEP = 'mutation'

/** The marker steps of a heavy part of `gate --fast` or `gate --hook` (`gate-fast: e2e`): a declared `browser`. */
export const HEAVY_PART_STEP_PREFIXES: readonly string[] = ['gate-fast: ', 'gate-hook: ']

/** How a marker's step is said when it is a command (`gate-full` -> `gate --full`); others are said as they are. */
export const STEP_TEXTS: Readonly<Record<string, string>> = {
	'gate-full': 'gate --full',
	'gate-release': 'gate --release',
}

/** The advice of a proposal on a short machine: `<start> (<reasons>)<end>`. */
export const SHORT_MACHINE_START = 'the machine is short now'
export const SHORT_MACHINE_END = ': its heavy steps would wait (section 8)'

/** How the reasons of a short machine are joined. */
export const REASON_SEPARATOR = '; '

/** The width of a clock time's hours and minutes (`09:05`). */
export const CLOCK_DIGITS = 2

/** The width of the label column of `plan next`'s text, and of its id column. */
export const PLAN_LABEL_WIDTH = 10
export const PLAN_ID_WIDTH = 6

/** How the parts of one line of `plan next` are joined, and the items of a list inside a part. */
export const PART_SEPARATOR = ' · '
export const LIST_SEPARATOR = ', '

/** How the head line's parts are joined. */
export const HEAD_SEPARATOR = '  ·  '

/** The start line when no lot or fix can start. */
export const NO_LOT_LINE =
	'no lot: every ready lot meets an open one, waits, or has its spec in DRAFT'

/** How the available memory is said by where it was read from. */
export const MEMORY_SOURCE_TEXTS: Readonly<Record<string, string>> = {
	vm_stat: 'free+inactive',
	meminfo: 'available',
	freemem: 'free',
}

/** The heavy line's memory part when the memory could not be read (case 17). */
export const MEMORY_UNKNOWN_TEXT = 'memory unknown (judged on the load alone)'

/** The heavy line's first part when the live markers could not be read; the reason follows in parentheses. */
export const MARKERS_UNKNOWN_TEXT = 'markers unknown'

/** The note of a registry entry whose state the cli does not know: `state <x> not known`. */
export const UNKNOWN_REGISTRY_STATE_PREFIX = 'state'
export const UNKNOWN_REGISTRY_STATE_SUFFIX = 'not known'

/** The registry states the cli reads; any other is read like `pending` (open, never done). */
export const KNOWN_REGISTRY_STATES: readonly string[] = ['pending', 'committed', 'abandoned']

/** Milliseconds in a second, and seconds in a minute and minutes in an hour. */
export const MILLISECONDS_PER_SECOND = 1000
export const SECONDS_PER_MINUTE = 60

/** The commands `plan next` names. */
export const PLAN_COMMAND = 'dialecte plan'
