import { TEMPORARY_FOLDER_PREFIX as REFERENCE_CHECK_FOLDER_PREFIX } from '../command-map/command-reference.constants.ts'
import {
	COMMIT_INDEX_FOLDER_PREFIX,
	STATE_INDEX_FOLDER_PREFIX,
} from '../gate-records/gate-records.constants.ts'
import { REPORT_FOLDER_PREFIX } from '../gate/scoped-tests.constants.ts'
import { GATE_SCOPE_FOLDER_PREFIX } from '../gate/selection.constants.ts'
import {
	HANDOVER_PROBE_FOLDER_PREFIX,
	HOOK_LOG_FOLDER_PREFIX,
	REHEARSAL_FOLDER_PREFIX,
	REVIEW_INDEX_FOLDER_PREFIX,
	TRIAL_INDEX_FOLDER_PREFIX,
} from '../handover/handover.constants.ts'
import {
	BASE_COLLECT_FOLDER_PREFIX,
	BASE_RED_FOLDER_PREFIX,
	REPORTING_RUN_FOLDER_PREFIX,
} from '../tdd/tdd.constants.ts'

import type { GateRecordMode } from '../gate-records/gate-records.types.ts'
import type { HealthRule, HealthSeverity } from './health.types.ts'

/** A re-run at least this long is red; a shorter one is amber. */
export const DUPLICATE_RED_MS = 300_000

/** How long after a run's end a record it wrote may still carry its time. */
export const RECORD_EVENT_SLACK_MS = 60_000

/** The extension of a check store file: `<tree>.json`. */
export const STORE_FILE_EXTENSION = '.json'

/** How many characters of a hash a finding prints. */
export const SHORT_HASH_LENGTH = 12

/** The step a run of the events names for each mode of record: the run that wrote a record of that mode. */
export const STEP_FAMILY_OF_MODE: Readonly<Record<GateRecordMode, string>> = {
	fast: 'gate-fast',
	full: 'gate-full',
	release: 'gate-release',
	hook: 'gate-hook',
	'hook-gate': 'gate-hook',
	contrib: 'contrib',
}

/** The steps whose ends an identical-key re-run is looked for in: the steps that write a check record. */
export const CHECK_STEPS: ReadonlySet<string> = new Set(Object.values(STEP_FAMILY_OF_MODE))

/** The step of a rehearsal run in the events. */
export const REHEARSAL_STEP = 'rehearsal'

/** The decision of a rehearsal plan's lot that re-ran it. */
export const REHEARSED_DECISION = 'rehearsed'

/** The modes of a green record a rehearsal could have reused instead of re-running the lot. */
export const REHEARSAL_REUSABLE_MODES: ReadonlySet<GateRecordMode> = new Set<GateRecordMode>([
	'hook',
	'hook-gate',
	'full',
])

/** The origin of a record a rehearsal wrote. */
export const REHEARSAL_ORIGIN = 'rehearsal'

/** A step whose name is this or starts with it ran tests: a re-run of one with no known duration is red. */
export const TEST_STEP_PREFIX = 'test'

/** The reuse of a step end that ran its steps (not answered from a record). */
export const NO_REUSE = 'none'

/** The parts of two check keys a store-pair finding names when they differ, in the order it names them. */
export const DIFFERED_PARTS = {
	install: 'install',
	linked: 'linked',
	command: 'command',
} as const

/** The texts of the duplicate-work findings; `{name}` is filled with its value. */
export const DUPLICATE_TEXTS = {
	storePair:
		'tree {tree}: {mode} ran {duration} although a green {greenMode} record existed ({greenAt}{rehearsal})',
	rehearsal:
		'tree {tree}: the rehearsal re-ran lot {lot} for {duration} although a green {greenMode} record existed ({greenAt}{rehearsal})',
	eventRerun: 'state {state}: {step} ran {duration} again with the same key as at {firstAt}',
	greenLine: 'green  {mode} {at}{rehearsal}  install {lock}  command {command}  linked {linked}',
	rerunLine: 're-run {mode} {at}  install {lock}  command {command}  linked {linked}',
	keyLine: 'key  tree {tree}  install {lock}  command {command}  linked {linked}',
	differed: 'differed: {parts}',
	sameKey: 'same key: the reuse missed it',
	planLine: 'rehearsal.json: lot {lot} {decision} - {reason}',
	planKey: 're-run key: not recorded',
	unknownTime: 'for an unknown time',
	/** After the green record's time in the one line, when a rehearsal wrote it. */
	rehearsalSuffix: ', rehearsal',
	/** After the green record's time in its detail line, when a rehearsal wrote it. */
	rehearsalMark: ' rehearsal',
	partsSeparator: ', ',
} as const

/** A handover run longer than this is a slow landing. */
export const LANDING_BUDGET_MS = 300_000

/** The step of a handover run in the events. */
export const HANDOVER_RUN_STEP = 'handover-run'

/** The step of a commit hook run in the events. */
export const HOOK_STEP = STEP_FAMILY_OF_MODE.hook

/** The texts of the landing-time findings; `{name}` is filled with its value. */
export const LANDING_TEXTS = {
	text: 'handover run {duration} (budget {budget}) at {at}',
	guards: 'guards {duration}',
	hookReused: 'lot {index} hook reused',
	hookRan: 'lot {index} hook ran {duration}{reason}',
	unknownTime: 'for an unknown time',
	duplicate: ' - duplicate (see duplicate work)',
	interrupted: ' - interrupted',
	noGreenRecord: ' - no green record of tree {tree}',
	notReused: ' - not reused',
	partsSeparator: ' · ',
	rehearsals: 'rehearsals before it: {rehearsals}',
	rehearsal: '{duration} ({at})',
	rehearsalsSeparator: ', ',
} as const

/** A step running longer than this on a live process is flagged (2 h). */
export const STEP_STALL_MS = 7_200_000

/** A heavy step running longer than this on a live process is flagged (3 h). */
export const HEAVY_STEP_STALL_MS = 10_800_000

/** A station open longer than this is flagged (4 h). */
export const STATION_STALL_MS = 14_400_000

/** The kinds of event that start or end a run: the last of them tells whether a lot's run stalled. */
export const STALL_RUN_KINDS: ReadonlySet<string> = new Set([
	'step.start',
	'step.end',
	'station.start',
	'station.end',
])

/**
 * The command that resumes a stalled run of each step: `{worktree}` is the step event's worktree, `{folder}` the
 * lot folder, `{lot}` the lot name. A step not listed gives no command.
 */
export const RESUME_COMMANDS: Readonly<Record<string, string>> = {
	'gate-fast': 'cd {worktree} && dialecte gate --fast',
	'gate-full': 'cd {worktree} && dialecte gate --full',
	'gate-release': 'cd {worktree} && dialecte gate --release',
	contrib: 'cd {worktree} && dialecte contrib',
	'tdd-red': 'cd {worktree} && dialecte tdd red',
	'tdd-green': 'cd {worktree} && dialecte tdd green',
	'gate-hook': 'dialecte handover run {folder}',
	'handover-run': 'dialecte handover run {folder}',
	rehearsal: 'dialecte handover run {folder}',
	mutation: 'dialecte lot status {lot}',
	'worktree-add': 'dialecte lot status {lot}',
	'throwaway-add': 'dialecte lot status {lot}',
}

/** The placeholder of a resume command that needs the step event's worktree. */
export const WORKTREE_PLACEHOLDER = '{worktree}'

/** The texts of the stalled-run findings; `{name}` is filled with its value. */
export const STALL_TEXTS = {
	gone: '{step} stalled: started {at}, pid {pid} is gone',
	alive: '{step} running {duration}: pid {pid} alive since {at}',
	interrupted: '{step} interrupted at {at} after {duration}',
	station: 'station {station} open {duration} since {at}',
	worktree: 'worktree {worktree}',
} as const

/** A worktree whose index and HEAD are older than this, with no open lot, is idle (24 h). */
export const WORKTREE_IDLE_MS = 86_400_000

/** A `worktree-add` or `throwaway-add` over this is slow (1 m). */
export const WORKTREE_ADD_BUDGET_MS = 60_000

/** A scratch folder older than this is leaked (6 h). */
export const SCRATCH_LEAK_MS = 21_600_000

/** The file of a linked worktree's git folder that git rewrites on every staging: with HEAD, its last activity. */
export const LINKED_WORKTREE_INDEX_FILE = 'index'

/** The repository name of the scratch finding: the temporary folder belongs to no repository. */
export const SCRATCH_REPOSITORY = 'scratch'

/** The leading digits of a worktree name: the lot index `lot close` takes. */
export const WORKTREE_INDEX_PATTERN = /^\d+/

/** The steps that create a worktree. */
export const WORKTREE_ADD_STEPS: ReadonlySet<string> = new Set(['worktree-add', 'throwaway-add'])

/**
 * The name prefixes of the scratch folders the cli makes: read in the scratch root, and in the system's temporary
 * folder where earlier versions made them.
 */
export const SCRATCH_PREFIXES: readonly string[] = [
	REHEARSAL_FOLDER_PREFIX,
	HOOK_LOG_FOLDER_PREFIX,
	HANDOVER_PROBE_FOLDER_PREFIX,
	TRIAL_INDEX_FOLDER_PREFIX,
	REVIEW_INDEX_FOLDER_PREFIX,
	GATE_SCOPE_FOLDER_PREFIX,
	REPORT_FOLDER_PREFIX,
	COMMIT_INDEX_FOLDER_PREFIX,
	STATE_INDEX_FOLDER_PREFIX,
	REPORTING_RUN_FOLDER_PREFIX,
	BASE_COLLECT_FOLDER_PREFIX,
	BASE_RED_FOLDER_PREFIX,
	REFERENCE_CHECK_FOLDER_PREFIX,
]

/** The texts of the worktree findings; `{name}` is filled with its value, a `One` text words a count of one. */
export const WORKTREE_TEXTS = {
	idleOne: '1 idle worktree with no open lot (oldest {name}, idle {duration})',
	idle: '{count} idle worktrees with no open lot (oldest {name}, idle {duration})',
	noneIdle: 'no idle worktree',
	committedNotClosed: 'committed, not closed: {name} - dialecte lot close {index}',
	committedNotClosedNoIndex: 'committed, not closed: {name}',
	goneOne: '1 registered worktree whose folder is gone',
	gone: '{count} registered worktrees whose folder is gone',
	slowAdd: '{step} took {duration}',
	nodeModules: 'node_modules {value}',
	leakedOne: '1 leaked scratch folder (oldest {path}, {duration} old)',
	leaked: '{count} leaked scratch folders (oldest {path}, {duration} old)',
} as const

/** The label of each rule in a rendered finding, in the order the ok line names them. */
export const RULE_LABELS: Readonly<Record<HealthRule, string>> = {
	'duplicate-work': 'duplicate work',
	'landing-time': 'landing time',
	'stalled-run': 'stalled run',
	worktrees: 'worktrees',
}

/** The mark that starts a rendered finding of each severity. */
export const SEVERITY_MARKS: Readonly<Record<HealthSeverity, string>> = {
	red: '✗',
	amber: '!',
}

/** The texts of the health report; `{name}` is filled with its value. */
export const REPORT_TEXTS = {
	header: 'health  since {since}  {red} red · {amber} amber',
	finding: '{mark} {label}  {repository}{lot}  {text}',
	detail: '    {line}',
	next: '    next: {next}',
	ok: 'ok: {labels}',
	labelsSeparator: ', ',
} as const
