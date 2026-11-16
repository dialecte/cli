/** A hook's output read for the record `gate --hook` answered from: the full line as today (A23), the release line. */
import {
	WRITTEN_REUSE_AT,
	WRITTEN_REUSE_HEAD,
	WRITTEN_REUSE_TREE,
} from '../../../test/gate-hook.constants.ts'
import {
	GATE_FAILED_TAIL_LINE,
	GATE_HOOK_FAILED_LINE,
	GATE_HOOK_STEP_REUSED_LINE,
	STEP_LINE_MARKS,
} from '../gate/gate-config.constants.ts'
import { hookLandingLine, hookSummarySteps, readHookBase, readHookSteps } from './hook-output.ts'

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
function reusedLineOf(params: { step: string; mode: string; at: string; head?: string }): string {
	return GATE_HOOK_STEP_REUSED_LINE.replace('{step}', params.step)
		.replace('{mode}', params.mode)
		.replace('{at}', params.at)
		.replace('{head}', params.head ?? FULL_HEAD)
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

const OLDER_AT = '2026-11-14T08:00:00.000Z'
const TAIL_MARKER = GATE_FAILED_TAIL_LINE.replace('{step}', 'tests')

describe('a hook whose steps were answered from several runs: the card names the oldest run', () => {
	it.each([
		{
			label: 'the older run printed last, with the smaller head and the later mode',
			first: { step: 'check', mode: 'full', at: FULL_AT, head: 'c'.repeat(12) },
			second: { step: 'tests', mode: 'release', at: OLDER_AT, head: 'a'.repeat(12) },
			reused: { at: OLDER_AT, head: 'a'.repeat(12) },
		},
		{
			label: 'the older run printed first, with the larger head and the earlier mode',
			first: { step: 'check', mode: 'full', at: OLDER_AT, head: 'e'.repeat(12) },
			second: { step: 'tests', mode: 'release', at: FULL_AT, head: 'b'.repeat(12) },
			reused: { at: OLDER_AT, head: 'e'.repeat(12) },
		},
		{
			label: 'the older run answering tests, printed last, with the earlier mode',
			first: { step: 'check', mode: 'release', at: FULL_AT, head: 'd'.repeat(12) },
			second: { step: 'tests', mode: 'full', at: OLDER_AT, head: 'f'.repeat(12) },
			reused: { at: OLDER_AT, head: 'f'.repeat(12) },
		},
	])(
		'$label → test:hook reused with the older time and short HEAD',
		({ first, second, reused }) => {
			expect(summaryOf([reusedLineOf(first), reusedLineOf(second)])).toEqual([
				expect.objectContaining({ name: 'test:hook', failed: false, reused }),
			])
		},
	)
})

describe('hookLandingLine: a failed hook relays its step output, which is no step of the hook', () => {
	it.each([
		{
			label: 'a TAP line and a vitest FAIL line relayed after the marker',
			tail: ['ok 1 - x', 'FAIL  src/a.test.ts > case'],
		},
		{
			label: 'a relayed vitest FAIL line only',
			tail: ['FAIL  src/b.test.ts > other case', '      Tests  1 failed (1)'],
		},
		{
			label: 'a relayed line shaped like a step line, named like no hook step',
			tail: [`${STEP_LINE_MARKS.passed}  build  exit 0`, `${STEP_LINE_MARKS.failed}  lint  exit 1`],
		},
	])('$label → the ran list names the hook’s own steps only', ({ tail }) => {
		const output = [
			...HEADER,
			reusedLineOf({ step: 'check', mode: 'full', at: FULL_AT }),
			`${STEP_LINE_MARKS.failed}  tests  exit 1`,
			GATE_HOOK_FAILED_LINE.replace('{step}', 'tests'),
			TAIL_MARKER,
			...tail,
		].join('\n')

		expect(hookLandingLine({ output })).toBe(`  hook: reused check (full ${FULL_AT}) · ran tests`)
	})

	it('a passed step, a failed step, then a relayed tail of ok, FAIL and step-shaped lines → ran names both steps only', () => {
		const output = [
			...HEADER,
			`${STEP_LINE_MARKS.passed}  check  exit 0`,
			`${STEP_LINE_MARKS.failed}  tests  exit 1`,
			GATE_HOOK_FAILED_LINE.replace('{step}', 'tests'),
			TAIL_MARKER,
			'ok 1 - x',
			'FAIL  src/a.test.ts > case',
			`${STEP_LINE_MARKS.passed}  build  exit 0`,
		].join('\n')

		expect(hookLandingLine({ output })).toBe('  hook: reused none · ran check, tests')
	})
})

describe('a failed hook relays its step output: reuse-shaped lines in it are no answer of the hook', () => {
	const WHOLE_REUSED_LINE = `gate --hook: tests reused from gate --full green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`
	const OWN_LINES = [
		reusedLineOf({ step: 'check', mode: 'full', at: FULL_AT }),
		`${STEP_LINE_MARKS.failed}  tests  exit 1`,
		GATE_HOOK_FAILED_LINE.replace('{step}', 'tests'),
		TAIL_MARKER,
	]

	it('a relayed tail holding a step reuse line and a whole-tests reuse line → the landing line reuses check only', () => {
		const output = [
			...HEADER,
			...OWN_LINES,
			reusedLineOf({ step: 'build', mode: 'release', at: OLDER_AT }),
			WHOLE_REUSED_LINE,
		].join('\n')

		expect(hookLandingLine({ output })).toBe(`  hook: reused check (full ${FULL_AT}) · ran tests`)
	})

	it('a relayed tail holding a whole-tests reuse line → the failed test:hook is not marked reused', () => {
		const steps = readHookSteps([...HEADER, ...OWN_LINES, WHOLE_REUSED_LINE].join('\n'))
		const [step] = hookSummarySteps({ steps, passed: false })

		expect(step).toMatchObject({ name: 'test:hook', failed: true })
		expect(step).not.toHaveProperty('reused')
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

describe('readHookBase: a failed hook relays its step output, a base line in it is no base of the hook', () => {
	it('a relayed tail holding another base line of a known source → the base read is the hook’s own base', () => {
		const output = [
			...HEADER,
			BASE_LINE,
			`${STEP_LINE_MARKS.failed}  tests  exit 1`,
			GATE_HOOK_FAILED_LINE.replace('{step}', 'tests'),
			TAIL_MARKER,
			// a source the cli knows: only a read that stops at the tail marker leaves this line out
			`gate --hook: base ${'b'.repeat(40)} (handover), reused`,
		].join('\n')

		expect(readHookBase(output)).toEqual({ commit: 'a'.repeat(40), source: 'base-branch' })
	})
})
