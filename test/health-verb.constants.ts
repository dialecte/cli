import {
	COMMAND_ONE,
	COMMAND_TWO,
	LINKED_ONE,
	LINKED_TWO,
	LOCK_ONE,
	LOCK_TWO,
	TREE,
	WINDOW,
} from './health.constants.ts'

import type { CheckKey } from '../src/lib/gate-records/gate-records.types.ts'

/** The clock of the verb's cases: the end of the health window. */
export const VERB_NOW = WINDOW.now

/** The folder of a store's lots under a git common dir. */
export const LOTS_FOLDER = 'dialecte-lots'

/** The usage line a usage error prints. */
export const VERB_USAGE_LINE =
	'dialecte health [--since <date|duration>] [--repository <name>] [--json]'

/** The labels of the four rules in a rendered finding. */
export const RULE_LABELS = [
	{ rule: 'duplicate-work', label: 'duplicate work' },
	{ rule: 'landing-time', label: 'landing time' },
	{ rule: 'stalled-run', label: 'stalled run' },
	{ rule: 'worktrees', label: 'worktrees' },
] as const

/** The second line of a report with no finding. */
export const OK_LINE = 'ok: duplicate work, landing time, stalled run, worktrees'

/** The 0105 fixture's three findings, newest first: the store pair, the landing, the rehearsal plan. */
export const REAL_FINDINGS_NEWEST_FIRST = [
	{ rule: 'duplicate-work', severity: 'red', at: '2026-11-15T04:26:50.772Z' },
	{ rule: 'landing-time', severity: 'red', at: '2026-11-15T04:10:12.968Z' },
	{ rule: 'duplicate-work', severity: 'red', at: '2026-11-15T03:38:50.904Z' },
] as const

/** A window start after every record of the 0105 fixture. */
export const AFTER_FIXTURE_SINCE = '2026-11-15T05:00:00.000Z'

/** The wait for an interrupted gate to end: a guard against a hang, never a measure of speed. */
export const INTERRUPT_WAIT_BOUND_MS = 60_000

/** Two check keys that differ in every part. */
export const KEY_ONE: CheckKey = {
	tree: TREE,
	lockHash: LOCK_ONE,
	commandHash: COMMAND_ONE,
	linked: LINKED_ONE,
}
export const KEY_TWO: CheckKey = {
	tree: TREE,
	lockHash: LOCK_TWO,
	commandHash: COMMAND_TWO,
	linked: LINKED_TWO,
}
