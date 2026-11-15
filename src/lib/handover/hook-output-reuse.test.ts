/** A hook's output read for the record `gate --hook` answered from: the full line as today (A23), the release line. */
import {
	WRITTEN_REUSE_AT,
	WRITTEN_REUSE_HEAD,
	WRITTEN_REUSE_TREE,
} from '../../../test/gate-hook.constants.ts'
import { hookLandingLine, hookSummarySteps, readHookSteps } from './hook-output.ts'

import { describe, expect, it } from 'vitest'

const HEADER = ['', '> demo@1.0.0 test:hook', '> node src/cli.ts gate --hook']
const BASE_LINE = `gate --hook: base ${'a'.repeat(40)} (base-branch), reused`

/** The summary of a hook whose `test:hook` step printed `lines` and passed. */
function summaryOf(lines: string[]) {
	return hookSummarySteps({ steps: readHookSteps([...HEADER, ...lines].join('\n')), passed: true })
}

describe('a hook that reused a record: the line is read into the step', () => {
	it.each([
		{
			label: 'A23: today’s line of a green gate --full',
			line: `gate --hook: tests reused from gate --full green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`,
		},
		{
			label: 'the line of a green gate --release',
			line: `gate --hook: tests reused from gate --release green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`,
		},
	])('$label, then the base line → test:hook reused with its time and short HEAD', ({ line }) => {
		expect(summaryOf([line, BASE_LINE])).toEqual([
			expect.objectContaining({
				name: 'test:hook',
				failed: false,
				reused: { at: WRITTEN_REUSE_AT, head: WRITTEN_REUSE_HEAD },
			}),
		])
	})

	it('a base line of two ids (selected T0, T4), then the reuse line → the step is still reused with its time and short HEAD', () => {
		expect(
			summaryOf([
				`gate --hook: base ${'a'.repeat(40)} (handover), selected T0, T4`,
				`gate --hook: tests reused from gate --release green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`,
			]),
		).toEqual([
			expect.objectContaining({
				name: 'test:hook',
				reused: { at: WRITTEN_REUSE_AT, head: WRITTEN_REUSE_HEAD },
			}),
		])
	})

	it('a base line and no reuse line (the tests ran) → test:hook is not marked reused', () => {
		const [step] = summaryOf([
			`gate --hook: base ${'a'.repeat(40)} (base-branch), selected T0`,
			'      Tests  4 passed (4)',
		])

		expect(step).toMatchObject({ name: 'test:hook', counts: { tests: { passed: 4, total: 4 } } })
		expect(step).not.toHaveProperty('reused')
	})
})

const FULL_AT = '2026-11-15T09:00:00.000Z'
const HOOK_AT = '2026-11-15T10:30:00.000Z'
const FULL_HEAD = 'c'.repeat(12)

/** The line `gate --hook` prints for a step answered from a record of the run `mode` at `at`. */
function reusedLineOf(params: { step: string; mode: string; at: string }): string {
	return `gate --hook: reused ${params.step} from ${params.mode} ${params.at} (HEAD ${FULL_HEAD})`
}

const RUNNING_LINE =
	'gate --hook: no green record of tree aaaaaaaaaaaa with this install answers a hook step: running check, tests'

describe('a hook answering steps from records: the steps of the hook, not the hook, are read into the step', () => {
	it('every step answered from the same run, no step line → test:hook reused with that run’s time and short HEAD', () => {
		expect(
			summaryOf([
				reusedLineOf({ step: 'check', mode: 'full', at: FULL_AT }),
				reusedLineOf({ step: 'tests', mode: 'full', at: FULL_AT }),
			]),
		).toEqual([
			expect.objectContaining({
				name: 'test:hook',
				failed: false,
				reused: expect.objectContaining({ at: FULL_AT, head: FULL_HEAD }),
			}),
		])
	})
})

describe('hookLandingLine: what a hook reused and what it ran, from its own lines', () => {
	it.each([
		{
			label: 'every step answered, no step line',
			lines: [
				reusedLineOf({ step: 'check', mode: 'full', at: FULL_AT }),
				reusedLineOf({ step: 'tests', mode: 'hook-gate', at: HOOK_AT }),
			],
			expected: `  hook: reused check (full ${FULL_AT}), tests (hook-gate ${HOOK_AT}) · ran none`,
		},
		{
			label: 'check answered, tests run and passed',
			lines: [
				reusedLineOf({ step: 'check', mode: 'full', at: FULL_AT }),
				'ok    tests  exit 0  tests 4 passed / 4',
				'      Tests  4 passed (4)',
				'gate --hook: green',
			],
			expected: `  hook: reused check (full ${FULL_AT}) · ran tests`,
		},
		{
			label: 'check answered, tests run and failed',
			lines: [
				reusedLineOf({ step: 'check', mode: 'full', at: FULL_AT }),
				'FAIL  tests  exit 1',
				'gate --hook: failed at tests',
			],
			expected: `  hook: reused check (full ${FULL_AT}) · ran tests`,
		},
		{
			label: 'nothing answered, the running line first, check and build and tests run',
			lines: [
				RUNNING_LINE,
				'ok    check  exit 0',
				'ok    build  exit 0',
				'ok    tests  exit 0  tests 4 passed / 4',
				'      Tests  4 passed (4)',
				'gate --hook: green',
			],
			expected: '  hook: reused none · ran check, build, tests',
		},
	])('$label → $expected', ({ lines, expected }) => {
		expect(hookLandingLine({ output: [...HEADER, ...lines].join('\n') })).toBe(expected)
	})

	it('a hook that prints none of the lines of gate --hook (a vitest summary only) → no landing line', () => {
		expect(
			hookLandingLine({ output: [...HEADER, '      Tests  4 passed (4)'].join('\n') }),
		).toBeUndefined()
	})
})
