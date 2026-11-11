import type { RecordedStep } from '../src/lib/gate-records/gate-records.types.ts'

/** The time of a gate record, and a later one. */
export const GATE_TIME = '2026-11-06T10:00:00.000Z'
export const NEWER_TIME = '2026-11-06T11:00:00.000Z'

/** A `lockHash` no install here has: a record made against another `node_modules`. */
export const FOREIGN_LOCK_HASH = 'f'.repeat(64)

/** What a step the standing hook did not run reads like. */
export const MERGED_TREE_WORDS = 'merged'

const TDD_NOTE = '368 case(s) of the change'
const TESTS_COUNTS = { tests: { passed: 3146, failed: 0, skipped: 4, total: 3150 } }
const HOOK_TESTS_COUNTS = { tests: { passed: 3186, failed: 0, skipped: 4, total: 3190 } }

/** The steps of a `gate --full` of the worktree's own tree: tdd, check, skills (no script), build, tests. */
export const GATE_STEPS: RecordedStep[] = [
	{ name: 'tdd', status: 'passed', counts: {}, note: TDD_NOTE, cases: [] },
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'skills', status: 'skipped', counts: {}, reason: 'no npm script "skills:check"' },
	{ name: 'build', status: 'passed', counts: {} },
	{ name: 'tests', status: 'passed', counts: TESTS_COUNTS },
]

/** The steps of the commit hook's summary: check, test:hook, build. */
export const HOOK_STEPS: RecordedStep[] = [
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'test:hook', status: 'passed', counts: HOOK_TESTS_COUNTS },
	{ name: 'build', status: 'passed', counts: {} },
]
