/**
 * `dialecte lot report <id> [--json]` through `runLot` on scratch stores (33L0 sections 7, 12; the done-when, cases
 * 20-22 on disk, 28): the station rows with tokens, agents, skills and suites, the JSON as the spec names it (the
 * families flat under `suites`, `throwawaySuites` beside it, the token parts and the total under `totals.tokens`),
 * unknown never 0, damaged and repeated events counted, values escaped, the exits and the `--json` usage shape.
 * Times print as `formatDuration` prints them (`6 m 0 s`). Feature reports are in `lot-report-feature.test.ts`, what
 * the report never holds or touches in `lot-report-read-only.test.ts`.
 */
import { REPORT_FEATURE, REPORT_NOW } from '../../test/lot-report-workspace.constants.ts'
import {
	appendLotEvents,
	appendRawEventLines,
	createLotAwaitingStations,
	createRecordedLot,
	stationAt,
} from '../../test/lot-report-workspace.ts'
import { createStationLot } from '../../test/lot-station-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { stationRun } from '../../test/report-events.ts'
import { temporaryFolder } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

/** An index of an id's shape that names no lot. */
const UNKNOWN_ID = '9999'

const TEST_WRITER_ROW =
	/^test-writer\s+1\s+-\s+dialecte-test-writer\s+standard\s+model-a\s+182k\s+6 m 0 s\s+tdd red 1\s+dialecte-lot$/
const IMPLEMENTER_ROW =
	/^implementer\s+1\s+-\s+dialecte-implementer\s+standard\s+model-a\s+≥ 410k\s+18 m 0 s\s+tdd green 1, fast 1\s+dialecte-lot, tdd$/

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The exit, the output's lines, its JSON (undefined when it is not), the keys of that JSON and whether `suites` nests `families`. */
function answerOf(result: CommandResult) {
	let json: any
	try {
		json = JSON.parse(result.output)
	} catch {
		json = undefined
	}
	return {
		exitCode: result.exitCode,
		lines: result.output.split('\n'),
		output: result.output,
		json,
		keys: json === undefined ? [] : Object.keys(json),
		nestsFamilies: json?.suites !== undefined && 'families' in json.suites,
	}
}

describe(
	'lot report: a lot with station events and step events',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('text → the header, a full row per station with step, round, agent, tier, model, tokens, time, suites and skills; outside stations holds the full gate', () => {
			const lot = createRecordedLot({ state: 'committed', feature: REPORT_FEATURE })

			expect(
				answerOf(runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW })),
			).toMatchObject({
				exitCode: 0,
				lines: expect.arrayContaining([
					expect.stringMatching(
						new RegExp(`^lot ${lot.name}\\s+committed · feature ${REPORT_FEATURE} · effort `),
					),
					expect.stringMatching(TEST_WRITER_ROW),
					expect.stringMatching(IMPLEMENTER_ROW),
					expect.stringMatching(/^outside stations\s+full 1$/),
				]),
			})
		})

		it('--json → the spec’s names: the families flat under suites, throwawaySuites, the token parts and the total, suites by station', () => {
			const lot = createRecordedLot({ state: 'committed', feature: REPORT_FEATURE })

			expect(
				answerOf(runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW })),
			).toMatchObject({
				exitCode: 0,
				nestsFamilies: false,
				keys: expect.arrayContaining([
					'lot',
					'state',
					'feature',
					'effort',
					'steps',
					'rounds',
					'stations',
					'runs',
					'totals',
					'agents',
					'skills',
					'suites',
					'throwawaySuites',
					'reportedSuites',
					'heavy',
					'folders',
					'review',
					'events',
					'next',
				]),
				json: {
					lot: lot.name,
					state: 'committed',
					feature: REPORT_FEATURE,
					stations: [
						{
							station: 'test-writer',
							tokens: { value: 182_000, exactness: 'exact' },
							agents: [{ name: 'dialecte-test-writer', runs: 1 }],
							skills: [{ name: 'dialecte-lot', seen: 1 }],
						},
						{
							station: 'implementer',
							tokens: { value: 410_000, exactness: 'atLeast' },
							agents: [{ name: 'dialecte-implementer', runs: 1 }],
							skills: [{ name: 'dialecte-lot' }, { name: 'tdd' }],
						},
					],
					totals: {
						tokens: {
							input: { known: 300_000, unknownStations: 1 },
							output: { known: 110_000, unknownStations: 1 },
							cacheRead: { known: null, unknownStations: 2 },
							cacheWrite: { known: null, unknownStations: 2 },
							total: { value: 592_000, exact: false, notExact: 1, stations: 2 },
						},
						time: { machine: 0 },
					},
					reportedSuites: { unit: 2 },
					suites: {
						'tdd-red': { runs: 1, byStation: { 'test-writer': 1 } },
						'tdd-green': { runs: 1, byStation: { implementer: 1 } },
						'gate-fast': { runs: 1, byStation: { implementer: 1 } },
						'gate-full': { runs: 1, byStation: { outside: 1 } },
					},
					throwawaySuites: {},
					events: { count: 12, damaged: 0 },
				},
			})
		})
	},
)

describe(
	'lot report: the done-when, stations recorded through lot station',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('two stations recorded by the host, the gate and tdd steps in the worktree → tokens, agents, skills and suites per station, in the rows and in runs[]', () => {
			const lot = createLotAwaitingStations()

			expect(
				((recorded, text, json) => ({
					recordedExits: recorded.map((result) => result.exitCode),
					text: answerOf(text),
					json: answerOf(json),
				}))(
					[
						stationAt({
							lot,
							clock: '10:00',
							words: [
								'start',
								'test-writer',
								'--step',
								'1',
								'--attempt',
								'1',
								'--agent',
								'dialecte-test-writer',
								'--tier',
								'standard',
								'--model',
								'model-a',
								'--vendor',
								'vendor-a',
								'--effort',
								'high',
								'--session',
								'session-1',
							],
						}),
						stationAt({
							lot,
							clock: '10:06',
							words: [
								'end',
								'test-writer',
								'--tokens-total',
								'182000',
								'--skill',
								'dialecte-lot',
								'--verdict',
								'approve',
								'--exit',
								'0',
							],
						}),
						stationAt({
							lot,
							clock: '10:07',
							words: [
								'start',
								'implementer',
								'--step',
								'1',
								'--agent',
								'dialecte-implementer',
								'--tier',
								'standard',
								'--model',
								'model-a',
							],
						}),
						stationAt({
							lot,
							clock: '10:25',
							words: [
								'end',
								'implementer',
								'--tokens-in',
								'300000',
								'--tokens-out',
								'110000',
								'--skill',
								'dialecte-lot',
								'--skill',
								'tdd',
							],
						}),
					],
					runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW }),
					runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW }),
				),
			).toMatchObject({
				recordedExits: [0, 0, 0, 0],
				text: {
					exitCode: 0,
					lines: expect.arrayContaining([
						expect.stringMatching(TEST_WRITER_ROW),
						expect.stringMatching(IMPLEMENTER_ROW),
					]),
				},
				json: {
					json: {
						runs: [
							{
								station: 'test-writer',
								step: 1,
								round: null,
								attempt: 1,
								agent: 'dialecte-test-writer',
								vendor: 'vendor-a',
								model: 'model-a',
								tier: 'standard',
								effort: 'high',
								session: 'session-1',
								tokens: { value: 182_000, exactness: 'exact' },
								verdict: 'approve',
								exit: 0,
								status: 'ended',
							},
							{ station: 'implementer', verdict: null, exit: null, status: 'ended' },
						],
					},
				},
			})
		})
	},
)

describe('lot report: unknown is never 0', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a station that reported no tokens → unknown in its row, in the agents line (no 0 there), null in JSON', () => {
		const lot = createStationLot()
		appendLotEvents({
			lot,
			events: stationRun({
				run: 'run-only',
				station: 'reviewer',
				start: '10:00',
				end: '10:05',
				startFields: { agent: 'agent-a' },
			}),
		})

		expect(
			((text, json) => ({ text: answerOf(text), json: answerOf(json) }))(
				runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW }),
				runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW }),
			),
		).toMatchObject({
			text: {
				lines: expect.arrayContaining([
					expect.stringMatching(/^reviewer\s+-\s+-\s+agent-a\s+-\s+-\s+unknown\s+5 m 0 s\s+-\s+-$/),
					'agents   1 run · 1 agent · tokens unknown · money unknown',
				]),
			},
			json: {
				json: {
					stations: [{ station: 'reviewer', tokens: { value: null, exactness: 'unknown' } }],
					totals: { tokens: { total: { value: null } } },
				},
			},
		})
	})

	it('a lot without any event → exit 0, stations none recorded, suites unknown in the text; no station, suites unknown in JSON', () => {
		const lot = createStationLot()

		expect(
			((text, json) => ({ text: answerOf(text), json: answerOf(json) }))(
				runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW }),
				runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW }),
			),
		).toMatchObject({
			text: {
				exitCode: 0,
				lines: expect.arrayContaining(['stations: none recorded', 'suites   unknown']),
			},
			json: {
				exitCode: 0,
				json: { stations: [], suites: { 'gate-fast': { known: false, runs: null } } },
			},
		})
	})
})

describe('lot report: the events file', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('two damaged lines, two of an unknown kind and a second end of a run → counted in JSON and in the events line', () => {
		const lot = createRecordedLot({ state: 'committed' })
		appendRawEventLines({
			lot,
			lines: [
				'this is not json',
				'{"broken":',
				JSON.stringify({
					schema: 1,
					id: 'x-1',
					at: '2026-11-09T10:30:00.000Z',
					kind: 'mystery.one',
				}),
				JSON.stringify({
					schema: 1,
					id: 'x-2',
					at: '2026-11-09T10:31:00.000Z',
					kind: 'mystery.two',
				}),
			],
		})
		appendLotEvents({
			lot,
			events: stationRun({
				run: 'run-first',
				station: 'test-writer',
				start: null,
				end: '10:06',
				endFields: { tokens: { total: 5 } },
			}),
		})

		expect(
			((text, json) => ({ text: answerOf(text), json: answerOf(json) }))(
				runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW }),
				runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW }),
			),
		).toMatchObject({
			text: {
				lines: expect.arrayContaining([
					expect.stringMatching(/^events\s+12 .*1 duplicate · 2 damaged · 2 unknown kinds$/),
				]),
			},
			json: { json: { events: { count: 12, damaged: 2, duplicates: 1, unknownKinds: 2 } } },
		})
	})
})

describe('lot report: text values are escaped', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a station agent holding an escape sequence in a hand-written event → printed as \\u{1b}, never the raw character', () => {
		const lot = createStationLot()
		appendLotEvents({
			lot,
			events: stationRun({
				run: 'run-escape',
				station: 'reviewer',
				start: '10:00',
				end: '10:05',
				startFields: { agent: 'agent-a\u001B[31mred' },
			}),
		})

		expect(
			((result) => ({
				escaped: result.output.includes('agent-a\\u{1b}[31mred'),
				raw: result.output.includes('\u001B'),
			}))(runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW })),
		).toEqual({ escaped: true, raw: false })
	})
})

describe('lot report: money and its unknown stations', { timeout: STORE_CASE_TIMEOUT }, () => {
	/** Three station runs, only the first reported money. */
	function lotWithOneMoneyOfThree() {
		const lot = createStationLot()
		appendLotEvents({
			lot,
			events: ['a', 'b', 'c'].flatMap((run, index) =>
				stationRun({
					run,
					station: 'reviewer',
					start: `10:${index}0`,
					end: `10:${index}5`,
					startFields: { agent: `agent-${run}` },
					...(run === 'a' && { endFields: { money: { amount: 1.5, currency: 'EUR' } } }),
				}),
			),
		})
		return lot
	}

	it('R4-5: two of three stations reported no money → --json: the sum with unknownStations 2 beside it', () => {
		const lot = lotWithOneMoneyOfThree()

		expect(
			answerOf(runLot({ cwd: lot.cwd, argv: ['report', lot.name, '--json'], now: REPORT_NOW })),
		).toMatchObject({
			json: { totals: { money: [{ currency: 'EUR', amount: 1.5, unknownStations: 2 }] } },
		})
	})

	it('R4-5: the same lot in text → the agents line says money 1.5 EUR (2 of 3 unknown)', () => {
		const lot = lotWithOneMoneyOfThree()

		expect(
			answerOf(runLot({ cwd: lot.cwd, argv: ['report', lot.name], now: REPORT_NOW })).lines.find(
				(line) => line.startsWith('agents '),
			),
		).toMatch(/money 1\.5 EUR \(2 of 3 unknown\)$/)
	})
})

describe('lot report: the exits', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an id that names no lot → exit 2, no lot <id>', () => {
		const lot = createStationLot()

		expect(
			answerOf(runLot({ cwd: lot.cwd, argv: ['report', UNKNOWN_ID], now: REPORT_NOW })),
		).toMatchObject({ exitCode: 2, output: `no lot ${UNKNOWN_ID}` })
	})

	it('an index two stores of the list hold, read from a folder in neither → exit 2 listing both lots', () => {
		const first = createStationLot({ name: '0171-repo-one' })
		const second = createStationLot({ name: '0171-repo-two' })
		writeStoreListFile({ stores: [first.workspace.store, second.workspace.store] })

		expect(
			answerOf(
				runLot({
					cwd: temporaryFolder('report-third-'),
					argv: ['report', '0171'],
					now: REPORT_NOW,
				}),
			),
		).toMatchObject({
			exitCode: 2,
			output: expect.stringMatching(/0171-repo-one[\s\S]*0171-repo-two/),
		})
	})

	it('no id → exit 2 and the lot usage', () => {
		const lot = createStationLot()

		expect(answerOf(runLot({ cwd: lot.cwd, argv: ['report'], now: REPORT_NOW }))).toMatchObject({
			exitCode: 2,
			output: renderLotUsage(),
		})
	})

	it('an unknown option and a second id → each exit 2', () => {
		const lot = createStationLot()

		expect(
			[
				['report', lot.name, '--bogus'],
				['report', lot.name, 'other'],
			].map((argv) => runLot({ cwd: lot.cwd, argv, now: REPORT_NOW }).exitCode),
		).toEqual([2, 2])
	})

	it('--json with no id → exit 2, { error, usage: the lot usage, next: null }', () => {
		const lot = createStationLot()

		expect(
			answerOf(runLot({ cwd: lot.cwd, argv: ['report', '--json'], now: REPORT_NOW })),
		).toMatchObject({
			exitCode: 2,
			json: { error: expect.any(String), usage: renderLotUsage(), next: null },
		})
	})

	it('--json with an unknown id → exit 2, { error: no lot <id>, next: null }', () => {
		const lot = createStationLot()

		expect(
			answerOf(runLot({ cwd: lot.cwd, argv: ['report', UNKNOWN_ID, '--json'], now: REPORT_NOW })),
		).toMatchObject({ exitCode: 2, json: { error: `no lot ${UNKNOWN_ID}`, next: null } })
	})
})
