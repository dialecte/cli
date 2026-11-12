/**
 * `dialecte lot report --feature <name> [--simulated] [--json]` (33L0 sections 7, 12; case 29): over the stores of the
 * list and the store of the cwd (the list stubbed through `XDG_STATE_HOME`), one lot simulated, one lot whose folder
 * is gone but whose final `card` line is in `cards.log`, one lot that has both its folder and a card line: two lines
 * and totals without the simulated one; with `--simulated`, three; a feature with no lot exits 1. The text is
 * checked on its lines, `--simulated` changes the text only (the JSON always carries `simulated`).
 */
import { writeStoreLot } from '../../test/brief-workspace.ts'
import { REPORT_NOW } from '../../test/lot-report-workspace.constants.ts'
import {
	appendCardsLog,
	appendLotEvents,
	cardLineOf,
	writeLedger,
} from '../../test/lot-report-workspace.ts'
import { createStationLot } from '../../test/lot-station-workspace.ts'
import { writeStoreListFile } from '../../test/lot-stores.ts'
import { stationRun, timeOf } from '../../test/report-events.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const FEATURE = 'dataflow-subscribe'
const REAL_LOT = '0171-repo-alpha'
const SIMULATED_LOT = '0172-repo-beta'
const GONE_LOT = '0300-repo-gone'
const OTHER_LOT = '0173-repo-other'

/**
 * Two workspaces: the real lot (100k tokens, two findings of one round, an agent and a skill) and a decoy of another
 * feature in the first store, the simulated lot (777k tokens) in the second; the first registry holds the gone lot's
 * final card and a card line for the real lot too. The store list names only the second store: the first is the one
 * of the cwd.
 */
function featureStores(): { cwd: string } {
	const real = createStationLot({ name: REAL_LOT, feature: FEATURE })
	const simulated = createStationLot({ name: SIMULATED_LOT, feature: FEATURE, simulated: true })
	writeStoreLot({
		workspace: real.workspace,
		name: OTHER_LOT,
		scope: ['src/'],
		repository: real.workspace.repository,
	})
	appendLotEvents({
		lot: real,
		events: stationRun({
			run: 'run-real',
			station: 'implementer',
			start: '10:00',
			end: '10:05',
			startFields: { tier: 'standard', agent: 'agent-a' },
			endFields: {
				tokens: { total: 100_000 },
				skills: [{ name: 'dialecte-lot', hash: null, how: 'seen' }],
			},
		}),
	})
	writeLedger({
		lot: real,
		findings: [
			[1, 'blocking', 'fixed 3'],
			[1, 'nit', 'open'],
		],
	})
	appendLotEvents({
		lot: simulated,
		events: stationRun({
			run: 'run-simulated',
			station: 'implementer',
			start: '10:00',
			end: '10:05',
			startFields: { tier: 'standard' },
			endFields: { tokens: { total: 777_000 } },
		}),
	})
	appendCardsLog({
		registry: real.workspace.registry,
		lines: [
			cardLineOf({
				lot: GONE_LOT,
				feature: FEATURE,
				at: timeOf('09:00'),
				records: null,
				repository: real.workspace.repository,
			}),
			cardLineOf({
				lot: REAL_LOT,
				feature: FEATURE,
				at: timeOf('09:30'),
				records: null,
				repository: real.workspace.repository,
			}),
		],
	})
	writeStoreListFile({ stores: [simulated.workspace.store] })
	return { cwd: real.cwd }
}

const GONE_USAGE_TOKENS = 250_000
const GONE_USAGE_RUNS = 3
const GONE_USAGE_AGENTS = 2
const REAL_LOT_TOKENS = 100_000

/** The usage a card froze for the gone lot: three runs, two agents, tokens not exact, 10 minutes known. */
const GONE_USAGE = {
	tokens: {
		total: { value: GONE_USAGE_TOKENS, exact: false, notExact: 1, stations: GONE_USAGE_RUNS },
		fields: {},
	},
	agents: GONE_USAGE_AGENTS,
	runs: GONE_USAGE_RUNS,
	agentTime: { known: 600, unknownRuns: 1 },
	money: [],
}

/** One real lot (100k tokens) and the card line of the lot only `cards.log` knows, holding `usage` (or none). */
function featureWithGoneLot(params: { usage: Record<string, unknown> | null }): { cwd: string } {
	const real = createStationLot({ name: REAL_LOT, feature: FEATURE })
	appendLotEvents({
		lot: real,
		events: stationRun({
			run: 'run-real',
			station: 'implementer',
			start: '10:00',
			end: '10:05',
			endFields: { tokens: { total: REAL_LOT_TOKENS } },
		}),
	})
	appendCardsLog({
		registry: real.workspace.registry,
		lines: [
			cardLineOf({
				lot: GONE_LOT,
				feature: FEATURE,
				at: timeOf('09:00'),
				records: null,
				repository: real.workspace.repository,
				usage: params.usage,
			}),
		],
	})
	writeStoreListFile({ stores: [] })
	return { cwd: real.cwd }
}

/** The exit, the output and the JSON of a result (undefined when it is not JSON). */
function answerOf(result: CommandResult) {
	let json: any
	try {
		json = JSON.parse(result.output)
	} catch {
		json = undefined
	}
	return { exitCode: result.exitCode, output: result.output, json }
}

/** Which of the lots' names a text holds, in the order of `names`. */
function namesIn(output: string): string[] {
	return [REAL_LOT, SIMULATED_LOT, GONE_LOT, OTHER_LOT].filter((name) => output.includes(name))
}

describe('lot report --feature: case 29', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('text → one line for the real lot (folder and card line both), one for the lot only cards.log knows (from cards.log), the totals by station and tier, agents and skills, nothing of the simulated lot', () => {
		const { cwd } = featureStores()

		expect(
			((result) => ({
				exitCode: result.exitCode,
				names: namesIn(result.output),
				realLines: result.output.split('\n').filter((line) => line.includes(REAL_LOT)).length,
				goneLine: result.output.split('\n').find((line) => line.includes(GONE_LOT)),
				byStation: result.output
					.split('\n')
					.some((line) => /^by station\b.*implementer.*100k/.test(line)),
				byTier: result.output.split('\n').some((line) => /^by tier\b.*standard.*100k/.test(line)),
				agents: result.output.split('\n').some((line) => /^agents\b.*agent-a/.test(line)),
				skills: result.output.split('\n').some((line) => /^skills\b.*dialecte-lot/.test(line)),
				simulatedTokens: result.output.includes('777k'),
			}))(runLot({ cwd, argv: ['report', '--feature', FEATURE], now: REPORT_NOW })),
		).toMatchObject({
			exitCode: 0,
			names: [REAL_LOT, GONE_LOT],
			realLines: 1,
			goneLine: expect.stringContaining('from cards.log'),
			byStation: true,
			byTier: true,
			agents: true,
			skills: true,
			simulatedTokens: false,
		})
	})

	it('--json → two lots with their rounds and findings, the gone lot’s tokens unknown and the feature total not exact, the totals by station and tier, the simulated lot apart with its own totals', () => {
		const { cwd } = featureStores()

		expect(
			answerOf(runLot({ cwd, argv: ['report', '--feature', FEATURE, '--json'], now: REPORT_NOW })),
		).toMatchObject({
			exitCode: 0,
			json: {
				feature: FEATURE,
				lots: [
					{ lot: REAL_LOT, fromCardsLog: false, simulated: false, rounds: 1, findings: 2 },
					{
						lot: GONE_LOT,
						fromCardsLog: true,
						simulated: false,
						tokens: { value: null, exact: false },
						rounds: null,
						findings: null,
					},
				],
				totals: {
					tokens: { value: 100_000, exact: false },
					byStation: { implementer: { value: 100_000 } },
					byTier: { standard: { value: 100_000 } },
					agents: [{ name: 'agent-a', runs: 1 }],
					skills: [{ name: 'dialecte-lot' }],
				},
				simulated: {
					count: 1,
					lots: [{ lot: SIMULATED_LOT, simulated: true }],
					totals: {
						tokens: { value: 777_000 },
						byStation: { implementer: { value: 777_000 } },
					},
				},
			},
		})
	})

	it('--simulated → the simulated lot is listed too, with its own tokens, the totals line of the real lots unchanged', () => {
		const { cwd } = featureStores()

		expect(
			((result) => ({
				exitCode: result.exitCode,
				names: namesIn(result.output),
				simulatedTokens: result.output.includes('777k'),
			}))(runLot({ cwd, argv: ['report', '--feature', FEATURE, '--simulated'], now: REPORT_NOW })),
		).toEqual({ exitCode: 0, names: [REAL_LOT, SIMULATED_LOT, GONE_LOT], simulatedTokens: true })
	})

	it('--simulated --json → the same JSON as without the flag', () => {
		const { cwd } = featureStores()

		expect(
			((plain, simulated) => ({
				exits: [plain.exitCode, simulated.exitCode],
				same: plain.output === simulated.output,
			}))(
				runLot({ cwd, argv: ['report', '--feature', FEATURE, '--json'], now: REPORT_NOW }),
				runLot({
					cwd,
					argv: ['report', '--feature', FEATURE, '--simulated', '--json'],
					now: REPORT_NOW,
				}),
			),
		).toEqual({ exits: [0, 0], same: true })
	})

	it('a feature no lot holds → exit 1, the text names the feature; with --json the error and next: null', () => {
		const { cwd } = featureStores()

		expect(
			((text, json) => ({ text: answerOf(text), json: answerOf(json) }))(
				runLot({ cwd, argv: ['report', '--feature', 'no-such-feature'], now: REPORT_NOW }),
				runLot({
					cwd,
					argv: ['report', '--feature', 'no-such-feature', '--json'],
					now: REPORT_NOW,
				}),
			),
		).toMatchObject({
			text: { exitCode: 1, output: expect.stringContaining('no-such-feature') },
			json: { exitCode: 1, json: { next: null } },
		})
	})

	it('a gone lot whose card line holds a usage → its line shows the usage runs, agents and tokens, and the feature total adds them', () => {
		const { cwd } = featureWithGoneLot({ usage: GONE_USAGE })

		expect(
			answerOf(runLot({ cwd, argv: ['report', '--feature', FEATURE, '--json'], now: REPORT_NOW })),
		).toMatchObject({
			json: {
				lots: [
					{ lot: REAL_LOT },
					{
						lot: GONE_LOT,
						fromCardsLog: true,
						runs: GONE_USAGE_RUNS,
						agents: GONE_USAGE_AGENTS,
						tokens: { value: GONE_USAGE_TOKENS, exact: false },
					},
				],
				totals: { tokens: { value: REAL_LOT_TOKENS + GONE_USAGE_TOKENS, exact: false } },
			},
		})
	})

	it('a gone lot whose card line holds no usage → its runs and agents are unknown, never 0, and the feature total counts it not exact', () => {
		const { cwd } = featureWithGoneLot({ usage: null })

		expect(
			answerOf(runLot({ cwd, argv: ['report', '--feature', FEATURE, '--json'], now: REPORT_NOW })),
		).toMatchObject({
			json: {
				lots: [
					{ lot: REAL_LOT },
					{ lot: GONE_LOT, runs: null, agents: null, tokens: { value: null, exact: false } },
				],
				totals: { tokens: { value: REAL_LOT_TOKENS, exact: false, notExact: 1 } },
			},
		})
	})

	it('a gone lot whose card line holds no usage → its text line says runs unknown, not 0 runs', () => {
		const { cwd } = featureWithGoneLot({ usage: null })

		expect(
			runLot({ cwd, argv: ['report', '--feature', FEATURE], now: REPORT_NOW })
				.output.split('\n')
				.find((line) => line.includes(GONE_LOT)),
		).toMatch(/runs unknown/)
	})

	it('R4-5: a feature total that is not exact → its line says how many of its stations are not exact: ≥ 100k tokens (1 of 2 not exact)', () => {
		const { cwd } = featureWithGoneLot({ usage: null })

		expect(
			runLot({ cwd, argv: ['report', '--feature', FEATURE], now: REPORT_NOW })
				.output.split('\n')
				.find((line) => line.startsWith('total ')),
		).toBe('total    ≥ 100k tokens (1 of 2 not exact)')
	})

	it('R4-5: a lot read from cards.log → its suites are unknown in the text (not -) and null in the JSON, the lot read from its folder keeps its counts', () => {
		const { cwd } = featureWithGoneLot({ usage: GONE_USAGE })

		expect(
			((text, json) => ({
				text: text.output.split('\n').find((line) => line.includes(GONE_LOT)),
				suites: json.json.lots.map((lot: { suites: unknown }) => lot.suites),
			}))(
				runLot({ cwd, argv: ['report', '--feature', FEATURE], now: REPORT_NOW }),
				answerOf(
					runLot({ cwd, argv: ['report', '--feature', FEATURE, '--json'], now: REPORT_NOW }),
				),
			),
		).toEqual({
			text: expect.stringMatching(/suites unknown/),
			suites: [expect.any(Object), null],
		})
	})

	it('--feature with a lot id as well → exit 2, a usage error', () => {
		const { cwd } = featureStores()

		expect(
			runLot({ cwd, argv: ['report', REAL_LOT, '--feature', FEATURE], now: REPORT_NOW }).exitCode,
		).toBe(2)
	})
})
