/**
 * The card's effort line and the effort behind its review line (33L1 sections 5-6, cases 18, 19, 20, 31; D2, D3, D20):
 * `buildEffortLine` over `risk.jsonl`, and `buildReviewLine` reading the effort through `effectiveEffort` and the cap
 * through `riskCapOf`. No passed card line has a raised cap: a raised class always puts the effort below it, so the
 * line is a warning. Every case writes a whole lot folder in a temporary store and asserts the whole line.
 */
import { readdirSync } from 'node:fs'

import { createStationLot } from '../../../test/lot-station-workspace.ts'
import { RMSYNC_REASON } from '../../../test/risk-workspace.constants.ts'
import { derivedLineOf, effortLineOf, writeRiskLines } from '../../../test/risk-workspace.ts'
import {
	playMoves,
	setIdentityEffort,
	writeLotBrief,
} from '../../../test/station-records-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { buildEffortLine, buildReviewLine } from './card-gates.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../../test/lot-station-workspace.types.ts'
import type { Move } from '../../../test/station-records-workspace.types.ts'
import type { RiskDerivedLine, RiskEffortLine } from '../risk/risk.types.ts'
import type { CardGateLine } from './gate-records.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The identity's effort (`none`: the identity holds none), the risk lines and the snapshots a lot holds. */
type Setup = {
	identity?: 'low' | 'medium' | 'high' | 'none'
	lines?: Array<RiskEffortLine | RiskDerivedLine>
	/** The brief's `effort`, which no reader looks at any more. */
	briefEffort?: 'low' | 'medium' | 'high'
	snapshots: number
}

const INDEPENDENT_APPROVES: Move = { station: 'independent-reviewer', verdict: 'approve' }

/** The snapshots 1..n then the independent review, as moves. */
function movesOf(snapshots: number): Move[] {
	const rounds: Move[] = Array.from({ length: snapshots }, (_, index): Move => ({
		snapshot: index + 1,
	}))
	return [...rounds, INDEPENDENT_APPROVES]
}

/** The lot folder of a case. */
function lotOf(setup: Setup): StationLot {
	const lot = createStationLot()
	if (setup.identity !== undefined)
		setIdentityEffort({ lot, level: setup.identity === 'none' ? undefined : setup.identity })
	if (setup.lines !== undefined) writeRiskLines({ folder: lot.lotFolder, lines: setup.lines })
	if (setup.briefEffort !== undefined)
		writeLotBrief({ lot, stepCount: 1, effort: setup.briefEffort })
	playMoves({ lot, moves: movesOf(setup.snapshots) })
	return lot
}

type EffortCase = { title: string; setup: Setup; expected: CardGateLine }

const EFFORT_CASES: EffortCase[] = [
	{
		title:
			'effort high, risk class high from a snapshot, 2 rounds -> passed, class, place and first reason',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'high' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] }),
			],
			snapshots: 2,
		},
		expected: {
			name: 'effort',
			status: 'passed',
			detail:
				'high · risk class high at snapshot (src/cleanup.ts:2: rmSync) · 2 review rounds of 3',
		},
	},
	{
		title:
			'effort medium below a derived class high, the effort line by reviewer with a reason -> warning naming by and reason',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'medium', reason: 'a rerun is cheap' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] }),
			],
			snapshots: 2,
		},
		expected: {
			name: 'effort',
			status: 'warning',
			detail: 'medium below risk class high (by reviewer: a rerun is cheap)',
		},
	},
	{
		title:
			'effort medium below a derived class high, the effort line without a reason -> warning naming no go-ahead',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'medium' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] }),
			],
			snapshots: 2,
		},
		expected: {
			name: 'effort',
			status: 'warning',
			detail: 'medium below risk class high (no go-ahead recorded)',
		},
	},
	{
		title: 'a derived line from the handover write -> the place reads "handover write"',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'high' }),
				derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON], from: 'handover-write' }),
			],
			snapshots: 2,
		},
		expected: {
			name: 'effort',
			status: 'passed',
			detail:
				'high · risk class high at handover write (src/cleanup.ts:2: rmSync) · 2 review rounds of 3',
		},
	},
	{
		title: 'a declared reason -> "<file>: declared <glob>"',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'high' }),
				derivedLineOf({
					class: 'high',
					reasons: [
						{ kind: 'declared', file: 'src/lib/store/publish.ts', detail: 'src/lib/store/**' },
					],
					from: 'start',
				}),
			],
			snapshots: 2,
		},
		expected: {
			name: 'effort',
			status: 'passed',
			detail:
				'high · risk class high at start (src/lib/store/publish.ts: declared src/lib/store/**) · 2 review rounds of 3',
		},
	},
	{
		title: 'a declared reason whose glob is the file -> "<file>: declared"',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'high' }),
				derivedLineOf({
					class: 'high',
					reasons: [
						{
							kind: 'declared',
							file: 'src/lib/store/publish.ts',
							detail: 'src/lib/store/publish.ts',
						},
					],
					from: 'start',
				}),
			],
			snapshots: 2,
		},
		expected: {
			name: 'effort',
			status: 'passed',
			detail:
				'high · risk class high at start (src/lib/store/publish.ts: declared) · 2 review rounds of 3',
		},
	},
	{
		title: 'a docs reason with no file -> "<detail>" alone',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'low' }),
				derivedLineOf({
					class: 'light',
					reasons: [{ kind: 'docs', detail: 'docs only: 0 files' }],
				}),
			],
			snapshots: 1,
		},
		expected: {
			name: 'effort',
			status: 'passed',
			detail: 'low · risk class light at snapshot (docs only: 0 files) · 1 review round of 1',
		},
	},
	{
		title:
			'effort medium, derived medium, the effort line holding class high -> warning naming risk class high',
		setup: {
			identity: 'none',
			lines: [
				effortLineOf({ effort: 'medium', class: 'high', reason: 'kept as is' }),
				derivedLineOf({ class: 'medium', reasons: [RMSYNC_REASON] }),
			],
			snapshots: 2,
		},
		expected: {
			name: 'effort',
			status: 'warning',
			detail: 'medium below risk class high (by reviewer: kept as is)',
		},
	},
	{
		title: 'an effort line and no derived line -> the class unknown',
		setup: { identity: 'none', lines: [effortLineOf({ effort: 'high' })], snapshots: 2 },
		expected: {
			name: 'effort',
			status: 'passed',
			detail: 'high · risk class unknown · 2 review rounds of 3',
		},
	},
	{
		title: 'no effort anywhere, a derived line -> no effort recorded',
		setup: {
			identity: 'none',
			lines: [derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] })],
			snapshots: 2,
		},
		expected: { name: 'effort', status: 'passed', detail: 'no effort recorded' },
	},
	{
		title: 'a brief.json effort and nothing else -> no effort recorded',
		setup: { identity: 'none', briefEffort: 'high', snapshots: 1 },
		expected: { name: 'effort', status: 'passed', detail: 'no effort recorded' },
	},
]

describe('buildEffortLine', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of EFFORT_CASES)
		it(row.title, () => {
			const lot = lotOf(row.setup)

			expect(buildEffortLine({ folder: lot.lotFolder })).toEqual(row.expected)
		})
})

type ReviewCase = { title: string; setup: Setup; expected: CardGateLine }

const REVIEW_CASES: ReviewCase[] = [
	{
		title: 'an effort line low after two snapshots (case 19) -> warning over the cap of 1',
		setup: { identity: 'high', lines: [effortLineOf({ effort: 'low' })], snapshots: 2 },
		expected: {
			name: 'review',
			status: 'warning',
			detail:
				'2 review rounds, cap 1, no go-ahead recorded · independent review approve · approved',
		},
	},
	{
		title: 'an effort line high over an identity low, 3 snapshots (case 18) -> 3 of 3',
		setup: { identity: 'low', lines: [effortLineOf({ effort: 'high' })], snapshots: 3 },
		expected: {
			name: 'review',
			status: 'passed',
			detail: '3 review rounds of 3 · independent review approve · approved',
		},
	},
	{
		title: 'a derived line high over an effort medium, 3 snapshots -> the cap 3 holds',
		setup: {
			identity: 'medium',
			lines: [derivedLineOf({ class: 'high', reasons: [RMSYNC_REASON] })],
			snapshots: 3,
		},
		expected: {
			name: 'review',
			status: 'passed',
			detail: '3 review rounds of 3 · independent review approve · approved',
		},
	},
	{
		title: 'a brief.json effort high and no other effort -> no effort recorded',
		setup: { identity: 'none', briefEffort: 'high', snapshots: 2 },
		expected: {
			name: 'review',
			status: 'passed',
			detail: '2 review rounds (no effort recorded) · independent review approve · approved',
		},
	},
]

describe(
	'buildReviewLine - the effort through effectiveEffort',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of REVIEW_CASES)
			it(row.title, () => {
				const lot = lotOf(row.setup)
				const before = readdirSync(lot.lotFolder).sort()

				expect(buildReviewLine({ folder: lot.lotFolder, release: false })).toEqual(row.expected)
				expect(readdirSync(lot.lotFolder).sort()).toEqual(before)
			})
	},
)
