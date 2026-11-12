import type { EventFieldsByKind } from './event.types.ts'

/** The most bytes one event line may hold. */
export const EVENT_LINE_LIMIT = 4_096

/** A cli event's lists are cut after this many entries. */
export const CUT_LIST_LIMIT = 40

/** A cli event's strings are cut after this many characters. */
export const CUT_STRING_LIMIT = 200

/** The schema version every event line carries. */
export const EVENT_SCHEMA = 1

/** What an event's ISO time loses in its id: the separators and the final `Z`. */
export const EVENT_ID_TIME_SEPARATORS = /[-:.Z]/g

/** The mode of an events file the writer makes: 0644, written by its owner, read by anyone. */
export const EVENT_FILE_MODE = 0o644

/** The fields every event may carry, whatever its kind (the envelope, and `cut` on a cut cli event). */
export const ENVELOPE_FIELDS: readonly string[] = [
	'schema',
	'id',
	'at',
	'lot',
	'kind',
	'by',
	'pid',
	'cli',
	'worktreeCli',
	'simulated',
	'hostEvent',
	'cut',
]

/** The fields a station event may carry beside the envelope (spec 4, "Station events"). */
const STATION_FIELDS: readonly string[] = [
	'run',
	'station',
	'step',
	'round',
	'attempt',
	'agent',
	'executor',
	'vendor',
	'model',
	'tier',
	'effort',
	'session',
	'skills',
	'tokens',
	'money',
	'duration',
	'exit',
	'verdict',
	'suites',
	'started',
]

/** The fields a step event may carry beside the envelope (spec 4, "Step events"). */
const STEP_FIELDS: readonly string[] = [
	'run',
	'step',
	'heavy',
	'worktree',
	'throwaway',
	'exit',
	'outcome',
	'durationMs',
	'stateHash',
	'reuse',
	'parts',
	'partsTotal',
	'partsFailedTotal',
]

/**
 * The kinds a reader knows, each with the fields it may carry beside the envelope. `ask.*` is known by its prefix.
 * The reader counts a field unknown when no kind here holds it.
 */
export const EVENT_FIELDS_BY_KIND: EventFieldsByKind = {
	'station.start': STATION_FIELDS,
	'station.end': STATION_FIELDS,
	'step.start': STEP_FIELDS,
	'step.end': STEP_FIELDS,
	'step.foreign': ['step', 'worktree'],
	'step.wait': ['step', 'waitedMs'],
	folder: ['action', 'path', 'branch', 'tip', 'durationMs'],
}

/** Every field a reader knows: the envelope's and those of every known kind (a field is unknown when none holds it). */
export const KNOWN_EVENT_FIELDS: ReadonlySet<string> = new Set([
	...ENVELOPE_FIELDS,
	...Object.values(EVENT_FIELDS_BY_KIND).flat(),
])

/** A review throwaway's folder name, `<lot name>-round-<n>`: the lot's name in the first group. */
export const THROWAWAY_LOT_NAME_PATTERN = /^(.+)-round-\d+$/

/** The read errors that mean no events file: nothing at its path, or a folder standing there. */
export const NO_EVENTS_FILE_CODES: readonly string[] = ['ENOENT', 'EISDIR']

/** The prefix of K's ask kinds: known to the reader, their payload fields not checked (K owns them). */
export const ASK_KIND_PREFIX = 'ask.'

/** The kinds that open a run: a start, paired with its end by `run`. */
export const RUN_START_KINDS: readonly string[] = ['station.start', 'step.start']

/** The prefix of the host's station kinds (`station.start`, `station.end`). */
export const STATION_KIND_PREFIX = 'station.'

/** The prefix of the cli's step kinds (`step.start`, `step.end`, `step.foreign`, `step.wait`). */
export const STEP_KIND_PREFIX = 'step.'

/** The kind of a step's wait for the machine: it waited `waitedMs` before its `at`. */
export const STEP_WAIT_KIND = 'step.wait'

/** The kind of a step run in a worktree whose link names this lot but which is not its worktree. */
export const STEP_FOREIGN_KIND = 'step.foreign'

/** The kind of a folder action (trash, park, branch delete). */
export const FOLDER_KIND = 'folder'

/** The kinds that close a run. */
export const RUN_END_KINDS: readonly string[] = ['station.end', 'step.end']
