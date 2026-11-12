/**
 * The card's `usage` row as `handover show` prints it (33L0 section 8, D7; cases 30 and 36, the row's half): one
 * line when the hand-over folder is a lot folder holding a station event, nothing else; never the verdict; no process
 * of its own (the import graph of the usage module: handover-usage.test.ts); nothing of the lot's `asks/`. The 40-line cut of the card's tdd list is case 35, in cards-log.test.ts
 * through `writeCard`; case 32's other half (an older installed cli writes no line) is out of reach here.
 */
import { isDeepStrictEqual } from 'node:util'

import { LOT_USAGE } from '../../test/handover-usage.constants.ts'
import {
	recordStations,
	recordStepsOnly,
	showArguments,
	usageLineOf,
	writeAsk,
} from '../../test/handover-usage.ts'
import { ASK_SENTINEL } from '../../test/lot-report-workspace.constants.ts'
import { recordingProbe } from '../../test/repository-cli-probe.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { readFolder } from '../../test/scratch-checks.ts'
import { HANDOVER_WRITER_CLI } from '../../test/step-events-handover.constants.ts'
import { createHandoverLot } from '../../test/step-events-handover.ts'
import { runHandoverShow, shownHandoverCard } from './handover.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandoverLot } from '../../test/step-events-handover.types.ts'

const USAGE_LINE_IN_A_BOX = /^│ usage\s/m

/** What the card says about the verdict: it is what the usage row must leave alone. */
function verdictShape(card: Record<string, any>) {
	return {
		verdict: card.verdict,
		failedGates: card.failedGates,
		otherTreeGates: card.otherTreeGates,
		gates: card.gates,
	}
}

/** A lot recording four station runs. */
function recordedLot(): HandoverLot {
	const lot = createHandoverLot()
	recordStations(lot)
	return lot
}

/** A lot recording step events and no station. */
function stepsOnlyLot(): HandoverLot {
	const lot = createHandoverLot()
	recordStepsOnly(lot)
	return lot
}

/** A lot of the store recording four station runs, its hand-over written outside the store. */
function outsideLot(): HandoverLot {
	const lot = createHandoverLot({ outside: true })
	recordStations(lot)
	return lot
}

// `temporaryFolder` removes its folder when the test ends, so no lot can be shared between cases: `show` writes
// nothing, and a lot is a few seconds (no run, no commit).
afterEach(function restoreEnvironment() {
	vi.restoreAllMocks()
	vi.unstubAllEnvs()
})

describe('handover show: the usage row', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the lot folder holds four station runs → the card has the usage line: tokens as a lower bound, agents, runs and agent time, the report command naming the lot', () => {
		const recorded = recordedLot()

		expect(
			runHandoverShow(showArguments({ lot: recorded }))
				.output.split('\n')
				.some((line) => line.includes(usageLineOf({ lotName: recorded.lotName }))),
		).toBe(true)
	})

	it('--json → the card data holds usage as { tokens, agents, runs, agentTime, money }', () => {
		const recorded = recordedLot()

		expect(
			JSON.parse(runHandoverShow(showArguments({ lot: recorded, json: true })).output).usage,
		).toEqual(LOT_USAGE)
	})

	it('the lot folder holds no station event, beside the lot that holds four → only the second shows the usage line', () => {
		const recorded = recordedLot()
		const plain = createHandoverLot()

		expect({
			recordedLine: USAGE_LINE_IN_A_BOX.test(
				runHandoverShow(showArguments({ lot: recorded })).output,
			),
			line: USAGE_LINE_IN_A_BOX.test(runHandoverShow(showArguments({ lot: plain })).output),
			keys: Object.keys(
				JSON.parse(runHandoverShow(showArguments({ lot: plain, json: true })).output),
			),
		}).toEqual({
			recordedLine: true,
			line: false,
			keys: expect.not.arrayContaining(['usage']),
		})
	})

	it('the lot folder holds step events and no station event → no usage line and no usage key, the lot with four station runs does show it', () => {
		const recorded = recordedLot()
		const stepsOnly = stepsOnlyLot()

		expect({
			recordedLine: USAGE_LINE_IN_A_BOX.test(
				runHandoverShow(showArguments({ lot: recorded })).output,
			),
			line: USAGE_LINE_IN_A_BOX.test(runHandoverShow(showArguments({ lot: stepsOnly })).output),
			keys: Object.keys(
				JSON.parse(runHandoverShow(showArguments({ lot: stepsOnly, json: true })).output),
			),
		}).toEqual({
			recordedLine: true,
			line: false,
			keys: expect.not.arrayContaining(['usage']),
		})
	})

	it('a hand-over folder outside the store, its lot of the store holding station events → no usage line and no usage key', () => {
		const recorded = recordedLot()
		const outside = outsideLot()

		expect({
			recordedLine: USAGE_LINE_IN_A_BOX.test(
				runHandoverShow(showArguments({ lot: recorded })).output,
			),
			line: USAGE_LINE_IN_A_BOX.test(runHandoverShow(showArguments({ lot: outside })).output),
			keys: Object.keys(
				JSON.parse(runHandoverShow(showArguments({ lot: outside, json: true })).output),
			),
		}).toEqual({
			recordedLine: true,
			line: false,
			keys: expect.not.arrayContaining(['usage']),
		})
	})

	it('the usage row never changes the verdict → the lot with station events and the one without show the same verdict, failed gates and gate lines', () => {
		const recorded = recordedLot()
		const plain = createHandoverLot()

		expect({
			rowShown:
				JSON.parse(runHandoverShow(showArguments({ lot: recorded, json: true })).output).usage !==
				undefined,
			sameVerdict: isDeepStrictEqual(
				verdictShape(
					JSON.parse(runHandoverShow(showArguments({ lot: recorded, json: true })).output),
				),
				verdictShape(JSON.parse(runHandoverShow(showArguments({ lot: plain, json: true })).output)),
			),
		}).toEqual({ rowShown: true, sameVerdict: true })
	})

	it('building the card with the row → the repository-cli probe is asked once, as for a card without the row', () => {
		const recorded = recordedLot()
		const plain = createHandoverLot()
		const withRow = recordingProbe({ answer: false })
		const withoutRow = recordingProbe({ answer: false })

		expect(
			shownHandoverCard({
				handover: readFolder(recorded.folder),
				probe: withRow.probe,
				cliPath: HANDOVER_WRITER_CLI,
			}).usage?.runs,
		).toBe(4)
		expect(
			shownHandoverCard({
				handover: readFolder(plain.folder),
				probe: withoutRow.probe,
				cliPath: HANDOVER_WRITER_CLI,
			}).usage,
		).toBeUndefined()
		expect({ withRow: withRow.calls.length, withoutRow: withoutRow.calls.length }).toEqual({
			withRow: 1,
			withoutRow: 1,
		})
	})

	it('a file of the lot asks holds the sentinel → the usage row and the card data never contain it', () => {
		const recorded = recordedLot()
		writeAsk({ lot: recorded, text: ASK_SENTINEL })

		expect({
			rowShown: runHandoverShow(showArguments({ lot: recorded })).output.includes(
				usageLineOf({ lotName: recorded.lotName }),
			),
			text: runHandoverShow(showArguments({ lot: recorded })).output.includes(ASK_SENTINEL),
			json: runHandoverShow(showArguments({ lot: recorded, json: true })).output.includes(
				ASK_SENTINEL,
			),
		}).toEqual({ rowShown: true, text: false, json: false })
	})
})
