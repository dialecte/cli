import type { HealthWindow } from '../src/lib/health/health.types.ts'
import type { RunSpec } from './health.types.ts'

export const REPOSITORY_FOLDER = 'cli'
export const HEALTH_LOT = '0108-cli-health-run'
export const FIXTURE_0105 = 'health-0105'

export const TREE = `7a1b2c3d4e5f${'0'.repeat(28)}`
export const TREE_PREFIX = '7a1b2c3d4e5f'
export const OTHER_TREE = `9f8e7d6c5b4a${'0'.repeat(28)}`

function hashOf(prefix: string): string {
	return `${prefix}${'0'.repeat(64 - prefix.length)}`
}

export const LOCK_ONE = hashOf('a1a1a1a1a1a1')
export const LOCK_TWO = hashOf('b2b2b2b2b2b2')
export const COMMAND_ONE = hashOf('c3c3c3c3c3c3')
export const COMMAND_TWO = hashOf('d4d4d4d4d4d4')
export const LINKED_ONE = hashOf('e5e5e5e5e5e5')
export const LINKED_TWO = hashOf('f6f6f6f6f6f6')
export const STEP_HASH_ONE = hashOf('a7a7a7a7a7a7')
export const STEP_HASH_TWO = hashOf('b8b8b8b8b8b8')
export const STATE_ONE = hashOf('f1f1f1f1f1f1')
export const STATE_ONE_PREFIX = 'f1f1f1f1f1f1'
export const STATE_TWO = hashOf('f2f2f2f2f2f2')

export const HEAD = 'e'.repeat(40)
export const RECORD_STATE = 'f'.repeat(64)

export const WINDOW: HealthWindow = {
	since: new Date('2026-11-15T00:00:00.000Z'),
	now: new Date('2026-11-15T12:00:00.000Z'),
}

export const OLDER_GREEN_AT = '2026-11-15T00:30:00.000Z'
export const GREEN_AT = '2026-11-15T01:00:00.000Z'
export const RERUN_AT = '2026-11-15T02:10:00.000Z'
export const MID_AT = '2026-11-15T02:05:00.000Z'
export const BEFORE_WINDOW_GREEN_AT = '2026-11-14T22:00:00.000Z'
export const BEFORE_WINDOW_RERUN_AT = '2026-11-14T23:00:00.000Z'

export const LONG_RUN_MS = 600_000
export const SHORT_RUN_MS = 4_000

export const REHEARSAL_START_AT = '2026-11-15T02:00:00.000Z'
export const REHEARSAL_END_AT = '2026-11-15T02:10:00.000Z'
export const REHEARSAL_PLAN_AT = '2026-11-15T02:00:02.000Z'
export const REHEARSAL_REASON = 'the branch moved: the merge leaves a new tree'

/** The number the scratch rehearsal plan gives its one lot, and the number of the lot the real plan rehearses. */
export const PLAN_LOT = 1
export const REAL_PLAN_LOT = 2

export const SAME_KEY_TEXT = 'same key: the reuse missed it'
export const LONG_RUN: RunSpec = { step: 'gate-hook', durationMs: LONG_RUN_MS }

export const OTHER_LOT = '0109-cli-other-run'
export const AFTER_NOW_AT = '2026-11-15T13:00:00.000Z'
export const REHEARSAL_SHORT_END_AT = '2026-11-15T02:04:00.000Z'
export const REHEARSAL_PLAN_BEFORE_GREEN_AT = '2026-11-15T02:00:01.000Z'
export const BEFORE_WINDOW_REHEARSAL_START_AT = '2026-11-14T22:00:00.000Z'
export const BEFORE_WINDOW_REHEARSAL_END_AT = '2026-11-14T22:10:00.000Z'
export const BEFORE_WINDOW_REHEARSAL_PLAN_AT = '2026-11-14T22:00:02.000Z'
export const AN_ORIGIN = { at: '2026-11-15T01:00:00.000Z', head: 'a'.repeat(40) }

export const BEFORE_WINDOW_EARLIER_GREEN_AT = '2026-11-14T21:00:00.000Z'

/** The store files of the real fixture, one per tree. */
export const REAL_STORE_FILES = [
	'c7fef5d3019b92dcd501cda52dcaa0bb75cba3d9.json',
	'fab7209873bff1376ecf8d5eebb7edc90de08061.json',
]
