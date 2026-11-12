import type { AgentTimeTexts } from './attribute-steps.types.ts'
import type { SuiteFamily } from './unrecorded-steps.types.ts'

/** The width of a line's label (`agents   `, `time     `): the value starts after it. */
export const LABEL_WIDTH = 9

/** The spaces between two columns of the station table. */
export const COLUMN_GAP = '  '

/** Between the parts of a report line. */
export const PART_SEPARATOR = ' · '

/** Between the items of one cell (a station's suites, its skills). */
export const ITEM_SEPARATOR = ', '

/** What a cell holding nothing prints. */
export const EMPTY_CELL = '-'

/** What a line holding nothing prints. */
export const NOTHING_TEXT = 'none'

/** The column header of the station table. */
export const STATION_COLUMNS: readonly string[] = [
	'station',
	'step',
	'round',
	'agent',
	'tier',
	'model',
	'tokens',
	'time',
	'suites',
	'skills',
]

/** The index of the suites column: a `shared` or `outside stations` row starts its suites there. */
export const SUITES_COLUMN = 8

/** The row label of the steps several open stations held. */
export const SHARED_ROW = 'shared'

/** The row label of the steps no station held, or the orchestration ran. */
export const OUTSIDE_ROW = 'outside stations'

/** The line printed when no station run was recorded. */
export const NO_STATIONS_LINE = 'stations: none recorded'

/** How a station row names a step family it ran. */
export const STATION_SUITE_LABELS: Readonly<Record<SuiteFamily, string>> = {
	'gate-fast': 'fast',
	'gate-full': 'full',
	'gate-release': 'release',
	'gate-hook': 'hook',
	contrib: 'contrib',
	'tdd-red': 'tdd red',
	'tdd-green': 'tdd green',
	mutation: 'mutation',
	rehearsal: 'rehearsal',
	'handover-run': 'handover run',
}

/** How the `suites` and `heavy` lines name a step family. */
export const SUITE_LINE_LABELS: Readonly<Record<SuiteFamily, string>> = {
	'gate-fast': 'gate --fast',
	'gate-full': 'gate --full',
	'gate-release': 'gate --release',
	'gate-hook': 'gate --hook',
	contrib: 'contrib',
	'tdd-red': 'tdd red',
	'tdd-green': 'tdd green',
	mutation: 'mutation',
	rehearsal: 'rehearsal',
	'handover-run': 'handover run',
}

/** The families the `suites` line always lists; the others only when they ran. */
export const ALWAYS_LISTED_FAMILIES: readonly SuiteFamily[] = [
	'gate-fast',
	'gate-full',
	'tdd-red',
	'tdd-green',
	'mutation',
	'rehearsal',
]

/** How a family's limit is named after its number (`(limit 5: S+R-1)`); a family not here prints `(limit n)`. */
export const LIMIT_RULES: Readonly<Partial<Record<SuiteFamily, string>>> = { 'gate-fast': 'S+R-1' }

/** How the folders line names a `worktree add` source that is no word of its own (`none`: nothing to bring). */
export const WORKTREE_ADD_SOURCE_TEXTS: Readonly<Record<string, string>> = {
	none: 'no node_modules',
}

/** After the money sums when some stations reported none: `{unknown}` of `{stations}`. */
export const MONEY_UNKNOWN_STATIONS = '({unknown} of {stations} unknown)'

/** The mark after a count over its limit. */
export const OVER_LIMIT_MARK = ' !'

/** What an effort with no known source is named after: the risk class it stands for. */
export const UNKNOWN_EFFORT_SOURCE = 'risk class'

/** The legend: the residual of the gate records, and the attribution by time. */
export const LEGEND_LINES: readonly string[] = [
	"gate counts are at least the events'; an unrecorded earlier run of a mode is not seen",
	'suites are attributed to stations by time: a step run by hand during a station lands on that station',
]

/** The label of the legend's first line. */
export const LEGEND_LABEL = 'legend'

/** The characters of a skill's hash the report prints. */
export const SKILL_HASH_LENGTH = 8

/** The time line's agent time, after the agents' share: every run timed, a lower bound, or none timed. */
export const REPORT_AGENT_TIME: AgentTimeTexts = {
	known: 'agent time {time}',
	atLeast: 'agent time ≥ {time} ({unknown} of {runs} unknown)',
	unknown: 'agent time unknown',
}
