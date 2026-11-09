/**
 * `lot wait <id>` on a simulated lot (33S section 7 and 8, G7-G9, cases 11-13, 38, 39, 56): the scenario is played
 * up to its next blocking point under an injected clock and sleep, the transitions published in order; a question
 * blocks until it is answered, a `limit` is returned once, a failure exits 1, `slow` is played as the steps fall
 * due. No test sleeps for real.
 */
import { outcomeOf } from '../../test/call-outcome.ts'
import { recordOf, snapshotOf } from '../../test/lot-start-workspace.ts'
import { LOT_NAME, START_NOW } from '../../test/lot-start.constants.ts'
import {
	CALLER_QUESTION,
	FAILURE_REASON,
	READY_SUMMARY,
	SLOW_DURATION_MS,
	WAITING_LINE_PATTERN,
} from '../../test/simulated-lot.constants.ts'
import {
	createWaitTime,
	playTwiceForced,
	runFlow,
	startSimulated,
	summaryOf,
	waitRaw,
	waitRepeatedly,
	waitSimulated,
	waitThenSummary,
	waitThenTransitions,
	waitWriting,
} from '../../test/simulated-lot.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FlowStep } from '../../test/simulated-lot.types.ts'
import type { ScenarioStep, ScenarioTable } from '../lib/store/scenarios.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const ANSWER_LINE = `dialecte lot answer ${LOT_NAME} q1 "<answer>"`
const STOP_LINE = `dialecte lot stop ${LOT_NAME} --reason <text>`
const RESULT_LINE = `dialecte lot result ${LOT_NAME}`

const BEFORE_QUESTION = [
	'1:working:start:null',
	'2:working:station:test-writer',
	'3:working:station:test-reviewer',
]

type FlowRow = {
	scenario: string
	steps: FlowStep[]
	observed: string[]
	summary: string[]
}

const FLOW_ROWS: FlowRow[] = [
	{
		scenario: 'ready',
		steps: [{ wait: [] }],
		observed: ['wait 0 ready'],
		summary: READY_SUMMARY.slice(),
	},
	{
		scenario: 'question',
		steps: [{ wait: [] }, { answer: [LOT_NAME, 'q1', 'keep'] }, { wait: [] }],
		observed: ['wait 3 input-required q1', 'answer 0', 'wait 0 ready'],
		summary: [
			...BEFORE_QUESTION,
			'4:working:question:test-reviewer',
			'5:working:answer:implementer',
			'6:working:station:reviewer',
			'7:working:station:hand-over',
			'8:ready:ready:hand-over',
		],
	},
	{
		scenario: 'person',
		steps: [
			{ wait: [] },
			{ answer: [LOT_NAME, 'q1', 'accept'] },
			{ wait: [] },
			{ answer: [LOT_NAME, 'q1', 'accept', '--by', 'a-person'] },
			{ wait: [] },
		],
		observed: [
			'wait 3 input-required q1',
			'answer 2',
			'wait 3 input-required q1',
			'answer 0',
			'wait 0 ready',
		],
		summary: [
			...BEFORE_QUESTION,
			'4:working:station:implementer',
			'5:working:station:reviewer',
			'6:working:question:reviewer',
			'7:working:answer:hand-over',
			'8:ready:ready:hand-over',
		],
	},
	{
		scenario: 'two-questions',
		steps: [
			{ wait: [] },
			{ answer: [LOT_NAME, 'q2', 'accept', '--by', 'a-person'] },
			{ wait: [] },
			{ answer: [LOT_NAME, 'q1', 'keep'] },
			{ wait: [] },
		],
		observed: [
			'wait 3 input-required q1,q2',
			'answer 0',
			'wait 3 input-required q1',
			'answer 0',
			'wait 0 ready',
		],
		summary: [
			...BEFORE_QUESTION,
			'4:working:question:test-reviewer',
			'5:working:question:test-reviewer',
			'6:working:answer:implementer',
			'7:working:station:reviewer',
			'8:working:station:hand-over',
			'9:ready:ready:hand-over',
		],
	},
	{
		scenario: 'limit',
		steps: [{ wait: [] }, { wait: [] }, { wait: [] }],
		observed: ['wait 4 working', 'wait 0 ready', 'wait 0 ready'],
		summary: [
			...BEFORE_QUESTION,
			'4:working:station:implementer',
			'5:working:limit:implementer',
			'6:working:station:reviewer',
			'7:working:station:hand-over',
			'8:ready:ready:hand-over',
		],
	},
	{
		scenario: 'failure',
		steps: [{ wait: [] }, { wait: [] }],
		observed: ['wait 1 failed', 'wait 1 failed'],
		summary: [
			...BEFORE_QUESTION,
			'4:working:station:implementer',
			'5:working:station:reviewer',
			'6:failed:fail:full-gate',
		],
	},
]

describe(
	'lot wait on a simulated lot: every scenario to its end',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of FLOW_ROWS)
			it(`${row.scenario} -> the waits and answers exit ${row.observed.join(', ')}, the transitions published in order`, async () => {
				const lot = startSimulated({ scenario: row.scenario })

				await expect(runFlow({ lot, time: createWaitTime(), steps: row.steps })).resolves.toEqual({
					observed: row.observed,
					summary: row.summary,
				})
			})
	},
)

describe(
	'lot wait on a simulated lot: what it publishes and prints',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('ready -> exit 0 at ready: the status JSON of the simulated lot, next the result line', async () => {
			const lot = startSimulated({ scenario: 'ready' })

			await expect(waitSimulated({ lot, time: createWaitTime() })).resolves.toMatchObject({
				exitCode: 0,
				json: {
					lot: LOT_NAME,
					state: 'ready',
					simulated: true,
					scenario: 'ready',
					runner: 'simulated',
					limit: false,
					questions: [],
					next: RESULT_LINE,
				},
			})
		})

		it('ready -> each played transition is by the simulator, simulated, stamped with the clock and at its step position', async () => {
			const lot = startSimulated({ scenario: 'ready' })
			const waited = await waitThenTransitions({ lot, time: createWaitTime() }).catch(
				(error: Error) => error.message,
			)
			const steps = outcomeOf(
				() =>
					(recordOf({ folder: lot.lotFolder, name: 'scenario.json' }) as { steps: ScenarioStep[] })
						.steps,
			)

			expect(
				typeof waited === 'string'
					? waited
					: {
							positions: waited.transitions.slice(1).map((transition) => transition.position),
							by: [
								...new Set(waited.transitions.slice(1).map((transition) => transition.cause.by)),
							],
							simulated: waited.transitions.every((transition) => transition.simulated),
							at: [...new Set(waited.transitions.slice(1).map((transition) => transition.at))],
							lot: [...new Set(waited.transitions.map((transition) => transition.lot))],
						},
			).toEqual({
				positions: 'value' in steps ? steps.value.map((step) => step.position) : undefined,
				by: ['simulator'],
				simulated: true,
				at: [START_NOW.toISOString()],
				lot: [LOT_NAME],
			})
		})

		it('question -> the question transition holds q1 as the scenario asks it, raised by the simulator', async () => {
			const lot = startSimulated({ scenario: 'question' })

			await expect(
				waitThenTransitions({ lot, time: createWaitTime() }).then((waited) => ({
					exitCode: waited.exitCode,
					asked: waited.transitions.at(-1),
				})),
			).resolves.toMatchObject({
				exitCode: 3,
				asked: {
					seq: 4,
					state: 'working',
					cause: { kind: 'question', by: 'simulator' },
					question: { id: 'q1', station: 'test-reviewer', ...CALLER_QUESTION },
					simulated: true,
				},
			})
		})

		it('question -> exit 3 input-required with q1 open and the answer line as next', async () => {
			const lot = startSimulated({ scenario: 'question' })

			await expect(waitSimulated({ lot, time: createWaitTime() })).resolves.toMatchObject({
				exitCode: 3,
				json: {
					state: 'input-required',
					questions: [{ id: 'q1', audience: 'caller', text: CALLER_QUESTION.text }],
					next: ANSWER_LINE,
				},
			})
		})

		it('question -> the transition after the answer is cause answer by the answerer', async () => {
			const lot = startSimulated({ scenario: 'question' })
			await runFlow({
				lot,
				time: createWaitTime(),
				steps: [
					{ wait: [] },
					{ answer: [LOT_NAME, 'q1', 'keep', '--by', 'planner'] },
					{ wait: [] },
				],
			}).catch((error: Error) => error.message)

			await expect(
				waitThenTransitions({ lot, time: createWaitTime() }).then(
					(waited) => waited.transitions[4]?.cause,
				),
			).resolves.toMatchObject({ kind: 'answer', by: 'planner' })
		})

		it('person -> the transition after the answer is cause answer by the person who answered', async () => {
			const lot = startSimulated({ scenario: 'person' })
			await runFlow({
				lot,
				time: createWaitTime(),
				steps: [
					{ wait: [] },
					{ answer: [LOT_NAME, 'q1', 'accept', '--by', 'a-person'] },
					{ wait: [] },
				],
			}).catch((error: Error) => error.message)

			await expect(
				waitThenTransitions({ lot, time: createWaitTime() }).then(
					(waited) => waited.transitions[6]?.cause,
				),
			).resolves.toMatchObject({ kind: 'answer', by: 'a-person' })
		})

		it('two-questions, nothing answered -> exit 3 input-required with q1 (caller) and q2 (person) both open', async () => {
			const lot = startSimulated({ scenario: 'two-questions' })

			await expect(waitSimulated({ lot, time: createWaitTime() })).resolves.toMatchObject({
				exitCode: 3,
				json: {
					state: 'input-required',
					questions: [
						{ id: 'q1', audience: 'caller' },
						{ id: 'q2', audience: 'person' },
					],
				},
			})
		})

		it('two-questions, only the person answered -> a wait plays nothing (the lot is as it was), exit 3', async () => {
			const lot = startSimulated({ scenario: 'two-questions' })
			await runFlow({
				lot,
				time: createWaitTime(),
				steps: [{ wait: [] }, { answer: [LOT_NAME, 'q2', 'accept', '--by', 'a-person'] }],
			}).catch((error: Error) => error.message)
			const before = snapshotOf(lot.lotFolder)

			await expect(
				waitSimulated({ lot, time: createWaitTime() }).then((waited) => ({
					exitCode: waited.exitCode,
					unchanged: JSON.stringify(snapshotOf(lot.lotFolder)) === JSON.stringify(before),
				})),
			).resolves.toEqual({ exitCode: 3, unchanged: true })
		})

		it('two-questions after both answers -> the transition that follows is cause answer', async () => {
			const lot = startSimulated({ scenario: 'two-questions' })
			const flow = await runFlow({
				lot,
				time: createWaitTime(),
				steps: [
					{ wait: [] },
					{ answer: [LOT_NAME, 'q2', 'accept', '--by', 'a-person'] },
					{ answer: [LOT_NAME, 'q1', 'keep'] },
					{ wait: [] },
				],
			}).catch((error: Error) => error.message)

			expect(typeof flow === 'string' ? flow : summaryOf(lot.lotFolder)[5]).toBe(
				'6:working:answer:implementer',
			)
		})

		it('limit -> the first wait exits 4 with limit true on a working lot (case 38)', async () => {
			const lot = startSimulated({ scenario: 'limit' })

			await expect(waitSimulated({ lot, time: createWaitTime() })).resolves.toMatchObject({
				exitCode: 4,
				json: { state: 'working', limit: true },
			})
		})

		it('limit -> a second wait right after plays the next step and exits 0, no 4 twice for one limit', async () => {
			const lot = startSimulated({ scenario: 'limit' })
			await waitSimulated({ lot, time: createWaitTime() }).catch((error: Error) => error.message)

			await expect(waitSimulated({ lot, time: createWaitTime() })).resolves.toMatchObject({
				exitCode: 0,
				json: { state: 'ready', limit: false },
			})
		})

		it('failure -> exit 1 with state failed, the stop line as next and the reason on the failed transition', async () => {
			const lot = startSimulated({ scenario: 'failure' })
			const waited = await waitSimulated({ lot, time: createWaitTime() })
			const replayed = await waitThenTransitions({ lot, time: createWaitTime() })

			expect({ ...waited, last: replayed.transitions.at(-1) }).toMatchObject({
				exitCode: 1,
				json: { state: 'failed', next: STOP_LINE },
				last: {
					state: 'failed',
					cause: { kind: 'fail', reason: FAILURE_REASON },
					position: { station: 'full-gate' },
				},
			})
		})

		it('the text form -> prints the status text and exits as the JSON does', async () => {
			const lot = startSimulated({ scenario: 'question' })

			await expect(
				waitRaw({ cwd: lot.start.repository, argv: [LOT_NAME], time: createWaitTime() }),
			).resolves.toMatchObject({
				exitCode: 3,
				output: expect.stringContaining(`next: ${ANSWER_LINE}`),
			})
		})

		it('a wait by index -> resolves the lot from its repository', async () => {
			const lot = startSimulated({ scenario: 'ready' })

			await expect(
				waitRaw({ cwd: lot.start.repository, argv: ['1', '--json'], time: createWaitTime() }).then(
					(result) => result.exitCode,
				),
			).resolves.toBe(0)
		})
	},
)

describe('lot wait on a simulated lot: time (case 13)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('slow, --timeout 1 right after the start -> exit 5, nothing is due: the lot is as it was', async () => {
		const lot = startSimulated({ scenario: 'slow' })

		await expect(
			waitThenSummary({ lot, time: createWaitTime(), words: ['--timeout', '1'] }),
		).resolves.toEqual({ exitCode: 5, summary: ['1:working:start:null'] })
	})

	it('slow, --timeout 1 again and again -> exit 5 until the lot is ready, every step played once and 2 s after the one before', async () => {
		const lot = startSimulated({ scenario: 'slow' })

		await expect(
			waitRepeatedly({ lot, time: createWaitTime(), minimumGap: SLOW_DURATION_MS }),
		).resolves.toEqual({
			shape: { first: 5, last: 0, onlyFivesBeforeTheLast: true, moreThanOneWait: true },
			summary: READY_SUMMARY.slice(),
			everyStepDue: true,
		})
	})

	it('slow, no timeout -> one wait sleeps until each step falls due and returns 0 at ready', async () => {
		const lot = startSimulated({ scenario: 'slow' })
		const time = createWaitTime()

		await expect(
			waitThenSummary({ lot, time }).then((waited) => ({ ...waited, sleeps: time.sleeps })),
		).resolves.toEqual({
			exitCode: 0,
			summary: READY_SUMMARY.slice(),
			sleeps: READY_SUMMARY.slice(1).map(() => SLOW_DURATION_MS),
		})
	})

	it('slow, a clock 5 s after the start, --timeout 3 -> the first step is played stamped +5 s, the next at +7 s, the third is due at +9 s: exit 5', async () => {
		const lot = startSimulated({ scenario: 'slow' })
		const time = createWaitTime({ at: new Date(START_NOW.getTime() + 5000) })

		await expect(
			waitThenTransitions({ lot, time, words: ['--timeout', '3'] }).then((waited) => ({
				exitCode: waited.exitCode,
				at: waited.transitions.map((transition) => transition.at),
			})),
		).resolves.toEqual({
			exitCode: 5,
			at: [
				START_NOW.toISOString(),
				new Date(START_NOW.getTime() + 5000).toISOString(),
				new Date(START_NOW.getTime() + 7000).toISOString(),
			],
		})
	})

	it('ready -> every step is due at once: the wait sleeps for nothing', async () => {
		const lot = startSimulated({ scenario: 'ready' })
		const time = createWaitTime()

		await expect(
			waitThenSummary({ lot, time }).then((waited) => ({ ...waited, sleeps: time.sleeps })),
		).resolves.toEqual({ exitCode: 0, summary: READY_SUMMARY.slice(), sleeps: [] })
	})
})

describe(
	'lot wait on a simulated lot: nothing to do, two players, a changed table',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const scenario of ['ready', 'question'])
			it(`${scenario}, played to where it stops -> a second wait returns at once: no sleep, not a byte written (case 12)`, async () => {
				const lot = startSimulated({ scenario })
				const first = await waitSimulated({ lot, time: createWaitTime() }).catch(
					(error: Error) => error.message,
				)
				const before = snapshotOf(lot.lotFolder)
				const time = createWaitTime()

				await expect(
					waitSimulated({ lot, time }).then((waited) => ({
						exitCode: waited.exitCode,
						sleeps: time.sleeps,
						unchanged: JSON.stringify(snapshotOf(lot.lotFolder)) === JSON.stringify(before),
						firstExitCode: typeof first === 'string' ? first : first.exitCode,
					})),
				).resolves.toEqual({
					exitCode: scenario === 'ready' ? 0 : 3,
					sleeps: [],
					unchanged: true,
					firstExitCode: scenario === 'ready' ? 0 : 3,
				})
			})

		it('question, two players, the second plays the whole lot before the first publishes -> one q1, the transitions as one wait makes them (case 11)', () => {
			const lot = startSimulated({ scenario: 'question' })

			expect(playTwiceForced({ lotFolder: lot.lotFolder })).toEqual({
				uniqueNumbers: true,
				contiguous: true,
				matchesDisk: true,
				summary: [...BEFORE_QUESTION, '4:working:question:test-reviewer'],
				questionIds: ['q1'],
			})
		})

		it('ready, two players in the same order -> every number held once, the same final state as one wait (case 11)', () => {
			const lot = startSimulated({ scenario: 'ready' })

			expect(playTwiceForced({ lotFolder: lot.lotFolder })).toEqual({
				uniqueNumbers: true,
				contiguous: true,
				matchesDisk: true,
				summary: READY_SUMMARY.slice(),
				questionIds: [],
			})
		})
	},
)

/** A two-step scenario whose steps are none of the built-in ones. */
const CUSTOM_STEPS: ScenarioStep[] = [
	{
		kind: 'station',
		station: 'test-writer',
		position: { step: 1, of: 1, station: 'test-writer', round: null },
		durationMs: 0,
	},
	{
		kind: 'ready',
		station: 'hand-over',
		position: { step: 1, of: 1, station: 'hand-over', round: null },
		durationMs: 0,
	},
]

const CUSTOM_SUMMARY = [
	'1:working:start:null',
	'2:working:station:test-writer',
	'3:ready:ready:hand-over',
]

describe(
	"lot wait plays the lot's own scenario.json (case 56)",
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a lot started under a table whose "ready" has two steps, waited on with the built-in table -> the two copied steps are played, none skipped or repeated', async () => {
			const scenarios: ScenarioTable = { ready: CUSTOM_STEPS }
			const lot = startSimulated({ scenario: 'ready', seams: { scenarios } })

			await expect(waitThenSummary({ lot, time: createWaitTime() })).resolves.toEqual({
				exitCode: 0,
				summary: CUSTOM_SUMMARY,
			})
		})

		it('a lot started under a scenario the built-in table lacks -> its copied steps are played', async () => {
			const scenarios: ScenarioTable = { custom: CUSTOM_STEPS }
			const lot = startSimulated({ scenario: 'custom', seams: { scenarios } })

			await expect(waitThenSummary({ lot, time: createWaitTime() })).resolves.toEqual({
				exitCode: 0,
				summary: CUSTOM_SUMMARY,
			})
		})
	},
)

describe('lot wait: the line on a terminal', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a terminal, text form, a wait that sleeps -> the \\r line waiting <name> (working, <elapsed>) is written', async () => {
		const lot = startSimulated({ scenario: 'slow' })

		await expect(
			waitWriting({
				lot,
				time: createWaitTime(),
				words: ['--timeout', '1'],
				isTerminal: true,
				json: false,
			}).then((waited) => ({
				exitCode: waited.exitCode,
				lines: WAITING_LINE_PATTERN.test(waited.written),
			})),
		).resolves.toEqual({ exitCode: 5, lines: true })
	})

	it('a terminal with --json -> nothing is written', async () => {
		const lot = startSimulated({ scenario: 'slow' })

		await expect(
			waitWriting({
				lot,
				time: createWaitTime(),
				words: ['--timeout', '1'],
				isTerminal: true,
				json: true,
			}),
		).resolves.toEqual({ exitCode: 5, written: '' })
	})

	it('no terminal, text form -> nothing is written', async () => {
		const lot = startSimulated({ scenario: 'slow' })

		await expect(
			waitWriting({
				lot,
				time: createWaitTime(),
				words: ['--timeout', '1'],
				isTerminal: false,
				json: false,
			}),
		).resolves.toEqual({ exitCode: 5, written: '' })
	})
})

type UsageRow = { title: string; argv: string[] }

const USAGE_ROWS: UsageRow[] = [
	{ title: 'no id', argv: ['--json'] },
	{ title: 'an unknown id', argv: ['9999', '--json'] },
	{ title: 'a timeout that is no number', argv: [LOT_NAME, '--timeout', 'abc', '--json'] },
	{ title: 'a negative timeout', argv: [LOT_NAME, '--timeout', '-1', '--json'] },
	{ title: 'a second id', argv: [LOT_NAME, '0002', '--json'] },
]

describe(
	'lot wait: usage and unknown ids exit 2 (section 6)',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of USAGE_ROWS)
			it(`${row.title} -> exit 2, JSON with next null, no sleep`, async () => {
				const lot = startSimulated({ scenario: 'ready' })
				const time = createWaitTime()

				await expect(
					waitRaw({ cwd: lot.start.repository, argv: row.argv, time }).then((result) => ({
						exitCode: result.exitCode,
						next: (JSON.parse(result.output) as { next?: unknown }).next,
						sleeps: time.sleeps,
					})),
				).resolves.toEqual({ exitCode: 2, next: null, sleeps: [] })
			})
	},
)
