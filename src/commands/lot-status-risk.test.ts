/**
 * `lot status` and the risk records (33L1 sections 4-5, case 31; D2, D3): the rounds block and the station walk read
 * the effort through `effectiveEffort` and the cap through `riskCapOf`; `effort` gains the last derived line as
 * `riskClass` and `below`; the text names an effort below the class. Scratch store lots with hand-written records.
 */
import { createStationLot } from '../../test/lot-station-workspace.ts'
import { RMSYNC_REASON, RISK_TEST_AT } from '../../test/risk-workspace.constants.ts'
import { derivedLineOf, effortLineOf, writeRiskLines } from '../../test/risk-workspace.ts'
import {
	playMoves,
	setIdentityEffort,
	writeLotBrief,
} from '../../test/station-records-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../test/lot-station-workspace.types.ts'
import type { Move } from '../../test/station-records-workspace.types.ts'
import type { RiskDerivedLine, RiskEffortLine } from '../lib/risk/risk.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type Level = 'low' | 'medium' | 'high'

/** What a lot holds: the identity's effort (`none`: none), the brief's `effort`, the risk lines, the story. */
type Setup = {
	identity: Level | 'none'
	briefEffort?: Level
	lines?: Array<RiskEffortLine | RiskDerivedLine>
	moves?: Move[]
}

/** One step at low effort, the reviewer asking for a fix of round 1, the fixer done, the fast gate passed. */
const FIXED_AT_ROUND_ONE: Move[] = [
	{ station: 'test-writer', step: 1 },
	{ check: 'tdd-red' },
	{ station: 'implementer', step: 1 },
	{ check: 'tdd-green' },
	{ check: 'gate-fast' },
	{ snapshot: 1 },
	{ station: 'reviewer', round: 1, verdict: 'fix-then-repass' },
	{ station: 'fixer', round: 1 },
	{ check: 'gate-fast' },
]

function lotOf(setup: Setup): StationLot {
	const lot = createStationLot()
	setIdentityEffort({ lot, level: setup.identity === 'none' ? undefined : setup.identity })
	if (setup.briefEffort !== undefined)
		writeLotBrief({ lot, stepCount: 1, effort: setup.briefEffort })
	if (setup.lines !== undefined) writeRiskLines({ folder: lot.lotFolder, lines: setup.lines })
	if (setup.moves !== undefined) playMoves({ lot, moves: setup.moves })
	return lot
}

function statusJsonOf(lot: StationLot): Record<string, unknown> {
	return JSON.parse(runLot({ cwd: lot.cwd, argv: ['status', lot.name, '--json'] }).output)
}

type JsonCase = {
	title: string
	setup: Setup
	/** The rounds block's fields compared. */
	rounds: Record<string, unknown>
	/** The whole `effort` block. */
	effort: Record<string, unknown>
}

type RoundsCase = { title: string; setup: Setup; rounds: Record<string, unknown> }

/** No effort is known: only the rounds block is compared. */
const ROUNDS_CASES: RoundsCase[] = [
	{
		title: 'a brief.json effort high and nothing else -> no cap, no effort',
		setup: { identity: 'none', briefEffort: 'high' },
		rounds: { cap: null, effort: null },
	},
]

const HIGH_CLASS = { class: 'high', at: RISK_TEST_AT, reasons: [RMSYNC_REASON] }

const JSON_CASES: JsonCase[] = [
	{
		title:
			'an effort line high over an identity low -> effort high from the risk line, cap 3, not below',
		setup: { identity: 'low', lines: [effortLineOf({ effort: 'high' })] },
		rounds: { cap: 3, effort: 'high' },
		effort: { level: 'high', source: 'risk-line', riskClass: null, below: false },
	},
	{
		title:
			'a derived line high over an identity effort medium -> cap 3, the identity source, the class with its reasons, below',
		setup: {
			identity: 'medium',
			lines: [derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] })],
		},
		rounds: { cap: 3, effort: 'medium' },
		effort: { level: 'medium', source: 'brief', riskClass: HIGH_CLASS, below: true },
	},
	{
		title: 'the last derived line wins by file order -> class light, not below, cap 1',
		setup: {
			identity: 'low',
			lines: [
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] }),
				derivedLineOf({
					class: 'light',
					reasons: [{ kind: 'docs', detail: 'docs only: 0 files' }],
				}),
			],
		},
		rounds: { cap: 1, effort: 'low' },
		effort: {
			level: 'low',
			source: 'brief',
			riskClass: {
				class: 'light',
				at: RISK_TEST_AT,
				reasons: [{ kind: 'docs', detail: 'docs only: 0 files' }],
			},
			below: false,
		},
	},
	{
		title:
			'an effort medium, a derived class medium, the effort line holding class high -> below true, riskClass stays the derived line',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'medium', class: 'high' }),
				derivedLineOf({ class: 'medium', reasons: [RMSYNC_REASON] }),
			],
		},
		rounds: { cap: 3, effort: 'medium' },
		effort: {
			level: 'medium',
			source: 'risk-line',
			riskClass: { class: 'medium', at: RISK_TEST_AT, reasons: [RMSYNC_REASON] },
			below: true,
		},
	},
	{
		title:
			'an identity low, an effort line high, a derived line high -> below follows the effective effort: false',
		setup: {
			identity: 'low',
			lines: [
				effortLineOf({ effort: 'high' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] }),
			],
		},
		rounds: { cap: 3, effort: 'high' },
		effort: { level: 'high', source: 'risk-line', riskClass: HIGH_CLASS, below: false },
	},
]

describe('lot status --json - the effort and the class', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of ROUNDS_CASES)
		it(row.title, () => {
			const lot = lotOf(row.setup)

			expect(statusJsonOf(lot)).toMatchObject({ rounds: row.rounds })
		})

	for (const row of JSON_CASES)
		it(row.title, () => {
			const lot = lotOf(row.setup)

			const json = statusJsonOf(lot)

			expect(json).toMatchObject({ rounds: row.rounds })
			expect(json.effort).toEqual(row.effort)
		})

	it('an effort low whose derived class is high, the cap of 1 reached in the walk -> the next station is the snapshot of the second round, not the question', () => {
		const lot = lotOf({
			identity: 'low',
			lines: [derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] })],
			moves: FIXED_AT_ROUND_ONE,
		})

		expect(statusJsonOf(lot)).toMatchObject({
			station: { kind: 'snapshot', round: 2 },
			rounds: { cap: 3, effort: 'low' },
		})
	})
})

describe('lot status - the text form', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an effort medium below a derived class high -> the identity effort names no go-ahead recorded', () => {
		const lot = lotOf({
			identity: 'medium',
			lines: [derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] })],
		})

		expect(runLot({ cwd: lot.cwd, argv: ['status', lot.name] }).output.split('\n')).toContain(
			'! effort medium below risk class high (no go-ahead recorded)',
		)
	})

	it('an effort line medium without a reason below a derived class high -> the line names no go-ahead', () => {
		const lot = lotOf({
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'medium' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] }),
			],
		})

		expect(runLot({ cwd: lot.cwd, argv: ['status', lot.name] }).output.split('\n')).toContain(
			'! effort medium below risk class high (no go-ahead recorded)',
		)
	})
})
