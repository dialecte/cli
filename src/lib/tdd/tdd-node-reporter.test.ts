import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import {
	ASSERTION_ERROR,
	DESCRIBE_THROWN_ERROR,
	FILE_A,
	FILE_B,
	FILE_FAILED_ERROR,
	MISSING_EXPORT_STDERR,
	STUB_ERROR,
	SUBTESTS_FAILED_ERROR,
	TIMEOUT_ERROR,
} from '../../../test/tdd-runners-node-events.constants.ts'
import {
	endEvent,
	noiseEvents,
	startEvent,
	stderrEvent,
	stderrEventWithoutEntryFile,
} from '../../../test/tdd-runners-node-events.ts'
import tddNodeReporter, { readNodeEvents } from './tdd-node-reporter.ts'
import { MISSING_EXPORT_PATTERN, TIMEOUT_PATTERN } from './tdd.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { NodeEventPlace } from '../../../test/tdd-runners-node-events.types.ts'
import type { NodeTestError, NodeTestEvent } from './tdd-node-reporter.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** Where node places a test or suite of `a.test.ts`. */
function placeIn(params: {
	name: string
	nesting: number
	line: number
	column: number
	file?: string
}): NodeEventPlace {
	return { file: FILE_A, ...params }
}

/** The events of a case that passes: it starts, then passes. */
function passedCase(place: NodeEventPlace): NodeTestEvent[] {
	return [startEvent(place), endEvent({ place, kind: 'test', outcome: { result: 'pass' } })]
}

/** The events of a case that fails with `error`. */
function failedCase(params: { place: NodeEventPlace; error: NodeTestError }): NodeTestEvent[] {
	const { place } = params
	return [
		startEvent(place),
		endEvent({ place, kind: 'test', outcome: { result: 'fail', error: params.error } }),
	]
}

/** The events of one case `one` under `describe('add')`, ended by `caseEnd`. */
function addSuiteAround(caseEvents: NodeTestEvent[]): NodeTestEvent[] {
	const suite = placeIn({ name: 'add', nesting: 0, line: 3, column: 1 })
	return [
		startEvent(suite),
		...caseEvents,
		endEvent({ place: suite, kind: 'suite', outcome: { result: 'pass' } }),
	]
}

const ONE_PLACE = placeIn({ name: 'one', nesting: 1, line: 4, column: 3 })

describe('readNodeEvents: the cases', () => {
	it('a case under describe add, passed → one module, the case named add > one with its place', () => {
		const events = addSuiteAround(passedCase(ONE_PLACE))

		expect(readNodeEvents(events)).toEqual([
			{
				file: FILE_A,
				runner: 'node',
				errors: [],
				cases: [
					{
						name: 'add > one',
						state: 'passed',
						project: '',
						location: { line: 4, column: 3 },
						errors: [],
					},
				],
			},
		])
	})

	it('a top-level case, a case two describes deep, then a top-level case after them → names joined with > and never carrying a closed describe', () => {
		const outer = placeIn({ name: 'outer', nesting: 0, line: 3, column: 1 })
		const inner = placeIn({ name: 'inner', nesting: 1, line: 3, column: 27 })
		const events = [
			...passedCase(placeIn({ name: 'top', nesting: 0, line: 2, column: 1 })),
			startEvent(outer),
			startEvent(inner),
			...passedCase(placeIn({ name: 'deep', nesting: 2, line: 3, column: 53 })),
			endEvent({ place: inner, kind: 'suite', outcome: { result: 'pass' } }),
			endEvent({ place: outer, kind: 'suite', outcome: { result: 'pass' } }),
			...passedCase(placeIn({ name: 'after', nesting: 0, line: 4, column: 1 })),
		]

		expect(readNodeEvents(events)).toMatchObject([
			{
				cases: [{ name: 'top' }, { name: 'outer > inner > deep' }, { name: 'after' }],
			},
		])
	})

	it('two cases made by one loop line → distinct names, one shared location', () => {
		const events = [
			...passedCase(placeIn({ name: 'row 1', nesting: 0, line: 2, column: 25 })),
			...passedCase(placeIn({ name: 'row 2', nesting: 0, line: 2, column: 25 })),
		]

		expect(readNodeEvents(events)).toMatchObject([
			{
				cases: [
					{ name: 'row 1', location: { line: 2, column: 25 } },
					{ name: 'row 2', location: { line: 2, column: 25 } },
				],
			},
		])
	})

	it('a skipped case, a todo case and a passed one → skipped, pending, passed', () => {
		const skipped = placeIn({ name: 'sk', nesting: 1, line: 7, column: 6 })
		const todo = placeIn({ name: 'td', nesting: 1, line: 8, column: 6 })
		const events = addSuiteAround([
			startEvent(skipped),
			endEvent({ place: skipped, kind: 'test', outcome: { result: 'pass', skip: true } }),
			startEvent(todo),
			endEvent({ place: todo, kind: 'test', outcome: { result: 'pass', todo: true } }),
			...passedCase(ONE_PLACE),
		])

		expect(readNodeEvents(events)).toMatchObject([
			{
				cases: [
					{ name: 'add > sk', state: 'skipped', location: { line: 7, column: 6 } },
					{ name: 'add > td', state: 'pending' },
					{ name: 'add > one', state: 'passed' },
				],
			},
		])
	})

	it('enqueue, dequeue, complete, plan, summary and diagnostic events around a failed case → ignored: one case, one error, no module error', () => {
		const noise = noiseEvents({
			place: ONE_PLACE,
			kind: 'test',
			outcome: { result: 'fail', error: ASSERTION_ERROR },
		})
		const events = addSuiteAround([
			...noise.slice(0, 2),
			...failedCase({ place: ONE_PLACE, error: ASSERTION_ERROR }),
			...noise.slice(2),
		])

		expect(readNodeEvents(events)).toMatchObject([
			{
				errors: [],
				cases: [{ name: 'add > one', state: 'failed', errors: [{ name: 'AssertionError' }] }],
			},
		])
	})

	it('a suite failing because its case failed → the case failed, the module holds no error of its own', () => {
		const suite = placeIn({ name: 'add', nesting: 0, line: 3, column: 1 })
		const events = [
			startEvent(suite),
			...failedCase({ place: ONE_PLACE, error: ASSERTION_ERROR }),
			endEvent({
				place: suite,
				kind: 'suite',
				outcome: { result: 'fail', error: SUBTESTS_FAILED_ERROR },
			}),
		]

		expect(readNodeEvents(events)).toMatchObject([
			{ errors: [], cases: [{ name: 'add > one', state: 'failed' }] },
		])
	})

	it('cases of two files → one module each, in the order the files first appear', () => {
		const events = [
			...passedCase(placeIn({ name: 'in a', nesting: 0, line: 2, column: 1 })),
			...passedCase(placeIn({ name: 'in b', nesting: 0, line: 2, column: 1, file: FILE_B })),
		]

		expect(readNodeEvents(events)).toMatchObject([
			{ file: FILE_A, cases: [{ name: 'in a' }] },
			{ file: FILE_B, cases: [{ name: 'in b' }] },
		])
	})
})

describe('readNodeEvents: the error of a failed case', () => {
	it('an assert.equal mismatch → the cause read: its name, its message, its frames innermost first with their file:// kept', () => {
		const events = addSuiteAround(failedCase({ place: ONE_PLACE, error: ASSERTION_ERROR }))

		expect(readNodeEvents(events)).toMatchObject([
			{
				errors: [],
				cases: [
					{
						name: 'add > one',
						state: 'failed',
						errors: [
							{
								name: 'AssertionError',
								message: '1 == 2',
								frames: [
									{ file: 'file:///work/demo/src/a.test.ts', line: 4, column: 28 },
									{ file: 'file:///work/demo/src/helper.ts', line: 9, column: 3 },
								],
							},
						],
					},
				],
			},
		])
	})

	it('a stub thrown from production code → its message and the production frame before the test frame', () => {
		const events = addSuiteAround(failedCase({ place: ONE_PLACE, error: STUB_ERROR }))

		expect(readNodeEvents(events)).toMatchObject([
			{
				cases: [
					{
						state: 'failed',
						errors: [
							{
								message: 'not implemented: add',
								frames: [
									{ file: 'file:///work/demo/src/add.ts', line: 2, column: 9 },
									{ file: 'file:///work/demo/src/a.test.ts', line: 5, column: 30 },
								],
							},
						],
					},
				],
			},
		])
	})

	it('a case that ran out of time → failed, its message one the timeout pattern reads', () => {
		const events = addSuiteAround(failedCase({ place: ONE_PLACE, error: TIMEOUT_ERROR }))

		expect(readNodeEvents(events)).toMatchObject([
			{
				errors: [],
				cases: [{ state: 'failed', errors: [{ message: expect.stringMatching(TIMEOUT_PATTERN) }] }],
			},
		])
	})
})

describe('readNodeEvents: the error of a file', () => {
	it('the file as a test fails, its stderr naming a missing export → the module error carries that text, no case', () => {
		const file = placeIn({ name: 'src/b.test.ts', nesting: 0, line: 1, column: 1, file: FILE_B })
		const events = [
			...MISSING_EXPORT_STDERR.map((message) => stderrEvent({ entryFile: FILE_B, message })),
			startEvent(file),
			endEvent({
				place: file,
				kind: 'test',
				outcome: { result: 'fail', error: FILE_FAILED_ERROR },
			}),
		]

		expect(readNodeEvents(events)).toMatchObject([
			{
				file: FILE_B,
				runner: 'node',
				errors: [{ message: expect.stringMatching(MISSING_EXPORT_PATTERN) }],
				cases: [],
			},
		])
	})

	it('stderr events carrying only a relative file (no entryFile), the failing file reported with its absolute path → the module error still carries the stderr text', () => {
		const relative = 'src/c.test.ts'
		const absolute = resolve(relative)
		const file = placeIn({ name: relative, nesting: 0, line: 1, column: 1, file: absolute })
		const events = [
			...MISSING_EXPORT_STDERR.map((message) =>
				stderrEventWithoutEntryFile({ file: relative, message }),
			),
			startEvent(file),
			endEvent({
				place: file,
				kind: 'test',
				outcome: { result: 'fail', error: FILE_FAILED_ERROR },
			}),
		]

		expect(readNodeEvents(events)).toMatchObject([
			{
				file: absolute,
				errors: [{ message: expect.stringMatching(MISSING_EXPORT_PATTERN) }],
				cases: [],
			},
		])
	})

	it('a describe whose callback threw, no stderr → the module error carries the thrown message, no case', () => {
		const suite = placeIn({ name: 'boom', nesting: 0, line: 2, column: 1 })
		const events = [
			startEvent(suite),
			endEvent({
				place: suite,
				kind: 'suite',
				outcome: { result: 'fail', error: DESCRIBE_THROWN_ERROR },
			}),
		]

		expect(readNodeEvents(events)).toMatchObject([
			{
				file: FILE_A,
				errors: [{ message: expect.stringContaining('describe blew') }],
				cases: [],
			},
		])
	})

	it('two files failing to load, each with its own stderr → each module error carries only its own file stderr', () => {
		const first = placeIn({ name: 'src/a.test.ts', nesting: 0, line: 1, column: 1 })
		const second = placeIn({ name: 'src/b.test.ts', nesting: 0, line: 1, column: 1, file: FILE_B })
		const events = [
			stderrEvent({ entryFile: FILE_A, message: 'failure text of a\n' }),
			stderrEvent({ entryFile: FILE_B, message: 'failure text of b\n' }),
			startEvent(first),
			endEvent({
				place: first,
				kind: 'test',
				outcome: { result: 'fail', error: FILE_FAILED_ERROR },
			}),
			startEvent(second),
			endEvent({
				place: second,
				kind: 'test',
				outcome: { result: 'fail', error: FILE_FAILED_ERROR },
			}),
		]

		expect(
			readNodeEvents(events).map((module) => module.errors.map((error) => error.message.trim())),
		).toEqual([['failure text of a'], ['failure text of b']])
	})
})

describe('tddNodeReporter', () => {
	/** The events of a run as the async stream node hands a reporter. */
	async function* streamOf(events: NodeTestEvent[]): AsyncGenerator<NodeTestEvent> {
		yield* events
	}

	it('a run → nothing yielded, the modules written as JSON to the file DIALECTE_TDD_REPORT names', async () => {
		const folder = temporaryFolder('dialecte-node-reporter-')
		const reportPath = join(folder, 'report.json')
		vi.stubEnv('DIALECTE_TDD_REPORT', reportPath)
		const events = addSuiteAround(passedCase(ONE_PLACE))

		await expect(tddNodeReporter(streamOf(events)).next()).resolves.toEqual({
			done: true,
			value: undefined,
		})

		expect(JSON.parse(readFileSync(reportPath, 'utf8'))).toEqual([
			{
				file: FILE_A,
				runner: 'node',
				errors: [],
				cases: [
					{
						name: 'add > one',
						state: 'passed',
						project: '',
						location: { line: 4, column: 3 },
						errors: [],
					},
				],
			},
		])
	})

	it('no DIALECTE_TDD_REPORT → the run ends, nothing thrown', async () => {
		vi.stubEnv('DIALECTE_TDD_REPORT', '')
		const events = addSuiteAround(passedCase(ONE_PLACE))

		await expect(tddNodeReporter(streamOf(events)).next()).resolves.toEqual({
			done: true,
			value: undefined,
		})
	})
})
