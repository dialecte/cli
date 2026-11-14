/**
 * The card's `review` line (33L1 section 6, 6b; D18): the rounds are the `round-<n>/` snapshots only, the cap comes
 * from the effort, and the independent review - a `station.end` of `independent-reviewer` with a verdict after the
 * last snapshot, else (a folder without step events) a ledger row of a round above it - is required. Every case
 * writes a whole lot folder in a temporary store and asserts the whole line.
 */
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeLedger } from '../../../test/lot-report-workspace.ts'
import { STATION_LOT } from '../../../test/lot-station-workspace.constants.ts'
import { createStationLot } from '../../../test/lot-station-workspace.ts'
import { REVIEW_LINE_FIXTURE } from '../../../test/review-line-workspace.constants.ts'
import { effortLineOf, writeRiskLines } from '../../../test/risk-workspace.ts'
import { DECISION_DAY } from '../../../test/station-records-workspace.constants.ts'
import {
	playMoves,
	setIdentityEffort,
	writeLotBrief,
	writeSnapshot,
} from '../../../test/station-records-workspace.ts'
import { appendDecision } from '../review-rounds/decisions-file.ts'
import { buildReviewLine } from './card-gates.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../../test/lot-station-workspace.types.ts'
import type { Move } from '../../../test/station-records-workspace.types.ts'
import type { CardGateLine } from './gate-records.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type Effort = 'low' | 'medium' | 'high'

type Case = {
	title: string
	/** The identity's effort; none when left out as `null`. Default `medium`. */
	effort?: Effort | null
	/** The story of the lot: snapshots and station runs, in order, each at its second. */
	moves?: Move[]
	/** The worktree's cli writes no step events. */
	noStepEvents?: boolean
	/** The findings ledger rows `[round, severity, state]`; no ledger file when left out. */
	ledger?: [number, string, string][]
	/** A ledger fixture of `test/fixtures/review-line/`, copied in instead of rows. */
	ledgerFixture?: string
	/** Go-ahead rows of `decisions.md`, each with the person it names. */
	goAheads?: { decision: string; by: string }[]
	/** Snapshots written after the story, at the seconds given (`.state` at `state`, else the `.base` mtime at `baseSecond`). */
	snapshots?: { round: number; state?: number; baseSecond?: number }[]
	expected: CardGateLine
}

/** A review line as the card holds it. */
function line(params: { status: CardGateLine['status']; detail: string }): CardGateLine {
	return { name: 'review', ...params }
}

/** The lot folder of a case, written as the case says. */
function lotOf(row: Case): StationLot {
	const lot = createStationLot()
	setIdentityEffort({ lot, level: row.effort === null ? undefined : (row.effort ?? 'medium') })
	writeLotBrief({ lot, stepCount: 1 })
	if (row.moves) playMoves({ lot, moves: row.moves, noStepEvents: row.noStepEvents })
	if (row.ledger) writeLedger({ lot, findings: row.ledger })
	if (row.ledgerFixture !== undefined)
		copyFileSync(
			join(REVIEW_LINE_FIXTURE, row.ledgerFixture),
			join(lot.lotFolder, 'findings-ledger.md'),
		)
	for (const snapshot of row.snapshots ?? []) writeSnapshot({ lot, ...snapshot })
	for (const { decision, by } of row.goAheads ?? [])
		appendDecision({
			path: join(lot.lotFolder, 'decisions.md'),
			title: lot.name,
			decision,
			by,
			when: DECISION_DAY,
		})
	return lot
}

const CLOSED_TO_2: [number, string, string][] = [
	[1, 'blocking', 'fixed 2'],
	[2, 'nit', 'accepted'],
]

const ROUNDS_ONE_TWO: Move[] = [{ snapshot: 1 }, { snapshot: 2 }]

/** A station run of a worktree whose cli writes no step events: the lot's events say so. */
const OLD_CLI_STATION: Move = { station: 'test-writer', step: 1 }

/** Five station runs that put the next move's start at second 11: the independent review after them ends at second 12, after a `.base` of second 10. */
const FILLER: Move[] = [
	OLD_CLI_STATION,
	OLD_CLI_STATION,
	OLD_CLI_STATION,
	OLD_CLI_STATION,
	OLD_CLI_STATION,
]

const INDEPENDENT_APPROVES: Move = { station: 'independent-reviewer', verdict: 'approve' }

/** The failed detail of an independent review whose last end asks for fixes (row 16b). */
const INDEPENDENT_ASKS_FIXES = `independent review asks for fixes: dialecte lot station ${STATION_LOT} start fixer`

const CASES: Case[] = [
	{
		title:
			'case 43: 2 rounds, no independent-review event, no ledger row above round 2 -> failed, naming round 2',
		moves: ROUNDS_ONE_TWO,
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'case 44: an independent-reviewer end BEFORE the last snapshot -> not counted: failed after round 2',
		moves: [{ snapshot: 1 }, INDEPENDENT_APPROVES, { snapshot: 2 }],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'case 45: an independent-reviewer end approve after the last snapshot, no finding (no ledger) -> passed',
		moves: [...ROUNDS_ONE_TWO, INDEPENDENT_APPROVES],
		expected: line({
			status: 'passed',
			detail: '2 review rounds of 2 · independent review approve · approved',
		}),
	},
	{
		title: 'the end after the snapshot, a closed ledger -> passed, the verdict named',
		moves: [...ROUNDS_ONE_TWO, INDEPENDENT_APPROVES],
		ledger: CLOSED_TO_2,
		expected: line({
			status: 'passed',
			detail: '2 review rounds of 2 · independent review approve · approved',
		}),
	},
	{
		title: 'an independent-reviewer end of no verdict after the snapshot -> not evidence: failed',
		moves: [...ROUNDS_ONE_TWO, { station: 'independent-reviewer' }],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'the end of another station (reviewer approve) after the snapshot -> not evidence: failed',
		moves: [...ROUNDS_ONE_TWO, { station: 'reviewer', round: 2, verdict: 'approve' }],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'step events on, no end, a ledger row of round 3 -> the ledger does not stand in: failed',
		moves: [...ROUNDS_ONE_TWO, { check: 'gate-full' }],
		ledger: [...CLOSED_TO_2, [3, 'nit', 'closed']],
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'no step events, a ledger row of round 3 above the last snapshot -> that is the independent review: passed, round 3 in the ledger',
		noStepEvents: true,
		moves: [OLD_CLI_STATION, ...ROUNDS_ONE_TWO],
		ledgerFixture: 'ledger-no-finding.md',
		expected: line({
			status: 'passed',
			detail: '2 review rounds of 2 · independent review: round 3 in the ledger · approved',
		}),
	},
	{
		title: 'no step events, ledger rows of rounds 3 and 4 -> rounds 3-4 in the ledger',
		noStepEvents: true,
		moves: [OLD_CLI_STATION, ...ROUNDS_ONE_TWO],
		ledger: [...CLOSED_TO_2, [3, 'should fix', 'fixed 4'], [4, 'nit', 'accepted']],
		expected: line({
			status: 'passed',
			detail: '2 review rounds of 2 · independent review: rounds 3-4 in the ledger · approved',
		}),
	},
	{
		title: 'no step events, no ledger row above round 2 -> failed',
		noStepEvents: true,
		moves: [OLD_CLI_STATION, ...ROUNDS_ONE_TWO],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title: 'effort low: 1 snapshot -> 1 review round of 1',
		effort: 'low',
		moves: [{ snapshot: 1 }, INDEPENDENT_APPROVES],
		expected: line({
			status: 'passed',
			detail: '1 review round of 1 · independent review approve · approved',
		}),
	},
	{
		title: 'effort high: 1 snapshot -> 1 review round of 3',
		effort: 'high',
		moves: [{ snapshot: 1 }, INDEPENDENT_APPROVES],
		expected: line({
			status: 'passed',
			detail: '1 review round of 3 · independent review approve · approved',
		}),
	},
	{
		title: 'no effort recorded: 2 snapshots -> 2 review rounds (no effort recorded)',
		effort: null,
		moves: [...ROUNDS_ONE_TWO, INDEPENDENT_APPROVES],
		expected: line({
			status: 'passed',
			detail: '2 review rounds (no effort recorded) · independent review approve · approved',
		}),
	},
	{
		title:
			'beyond the cap with its go-ahead row (round 3 by person-a) -> the cap, the round and who',
		effort: 'medium',
		moves: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }, INDEPENDENT_APPROVES],
		goAheads: [{ decision: 'round 3 beyond the cap of 2: one more pass', by: 'person-a' }],
		expected: line({
			status: 'passed',
			detail:
				'3 review rounds (cap 2, round 3 by person-a) · independent review approve · approved',
		}),
	},
	{
		title:
			'beyond the cap without a go-ahead row (an older cli made the snapshot) -> warning, not failing',
		effort: 'medium',
		moves: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }, INDEPENDENT_APPROVES],
		expected: line({
			status: 'warning',
			detail:
				'3 review rounds, cap 2, no go-ahead recorded · independent review approve · approved',
		}),
	},
	{
		title: 'a go-ahead row of another round does not cover round 3',
		effort: 'medium',
		moves: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }, INDEPENDENT_APPROVES],
		goAheads: [{ decision: 'round 4 beyond the cap of 2: another', by: 'person-a' }],
		expected: line({
			status: 'warning',
			detail:
				'3 review rounds, cap 2, no go-ahead recorded · independent review approve · approved',
		}),
	},
	{
		title: 'the independent review done, a blocking row open -> failed, the open part as today',
		moves: [...ROUNDS_ONE_TWO, INDEPENDENT_APPROVES],
		ledger: [
			[1, 'blocking', 'fixed 2'],
			[2, 'blocking', 'open'],
		],
		expected: line({
			status: 'failed',
			detail: '2 review rounds of 2 · independent review approve · 1 open: blocking or should fix',
		}),
	},
	{
		title: 'the independent review done, a nit open -> warning, the nit part as today',
		moves: [...ROUNDS_ONE_TWO, INDEPENDENT_APPROVES],
		ledger: [
			[1, 'blocking', 'fixed 2'],
			[2, 'nit', 'open'],
		],
		expected: line({
			status: 'warning',
			detail: '2 review rounds of 2 · independent review approve · 1 nit open',
		}),
	},
	{
		title:
			'D24.8: effort low (cap 1), snapshots 1-3, two go-ahead rows written out of order (round 3 by person-a, then round 2 by person-b) -> both listed, by round',
		effort: 'low',
		moves: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }, INDEPENDENT_APPROVES],
		goAheads: [
			{ decision: 'round 3 beyond the cap of 1: one more pass', by: 'person-a' },
			{ decision: 'round 2 beyond the cap of 1: a second pass', by: 'person-b' },
		],
		expected: line({
			status: 'passed',
			detail:
				'3 review rounds (cap 1, round 2 by person-b, round 3 by person-a) · independent review approve · approved',
		}),
	},
	{
		title:
			'D31 (was: passed): an independent end of verdict fix-then-repass, a closed ledger -> failed, the fixer to start',
		moves: [...ROUNDS_ONE_TWO, { station: 'independent-reviewer', verdict: 'fix-then-repass' }],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: INDEPENDENT_ASKS_FIXES }),
	},
	{
		title:
			'R3-1: an independent end of verdict failed after the last snapshot -> not an approval: failed',
		moves: [...ROUNDS_ONE_TWO, { station: 'independent-reviewer', verdict: 'failed' }],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'R3-1: an independent end of verdict limit after the last snapshot -> not an approval: failed',
		moves: [...ROUNDS_ONE_TWO, { station: 'independent-reviewer', verdict: 'limit' }],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'R3-1: an independent end of verdict approve with exit 1 after the last snapshot -> not an approval: failed',
		moves: [...ROUNDS_ONE_TWO, { station: 'independent-reviewer', verdict: 'approve', exit: 1 }],
		ledger: CLOSED_TO_2,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'R3-1: a fix-then-repass end followed by a later approve end -> the last end decides: passed',
		moves: [
			...ROUNDS_ONE_TWO,
			{ station: 'independent-reviewer', verdict: 'fix-then-repass' },
			INDEPENDENT_APPROVES,
		],
		ledger: CLOSED_TO_2,
		expected: line({
			status: 'passed',
			detail: '2 review rounds of 2 · independent review approve · approved',
		}),
	},
	{
		title: 'an independent end of verdict back, one blocking row open -> failed, the open part',
		moves: [...ROUNDS_ONE_TWO, { station: 'independent-reviewer', verdict: 'back' }],
		ledger: [
			[1, 'blocking', 'fixed 2'],
			[2, 'blocking', 'open'],
		],
		expected: line({
			status: 'failed',
			detail: '2 review rounds of 2 · independent review back · 1 open: blocking or should fix',
		}),
	},
	{
		title: 'snapshots 1-2, no ledger file, no independent end -> failed after round 2',
		moves: ROUNDS_ONE_TWO,
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'round 2 has no .state, its .base is of second 10, the independent approve ended at second 4 -> before the snapshot: failed',
		moves: [OLD_CLI_STATION, INDEPENDENT_APPROVES],
		snapshots: [
			{ round: 1, baseSecond: 1 },
			{ round: 2, baseSecond: 10 },
		],
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'round 2 has no .state, its .base is of second 10, the independent approve ended after it -> counted: passed',
		moves: [...FILLER, INDEPENDENT_APPROVES],
		snapshots: [
			{ round: 1, baseSecond: 1 },
			{ round: 2, baseSecond: 10 },
		],
		expected: line({
			status: 'passed',
			detail: '2 review rounds of 2 · independent review approve · approved',
		}),
	},
	{
		title:
			'round 2 has a .state of the very second the independent approve ended -> a tie is not after: failed',
		moves: [OLD_CLI_STATION, INDEPENDENT_APPROVES],
		snapshots: [
			{ round: 1, state: 1 },
			{ round: 2, state: 4 },
		],
		expected: line({ status: 'failed', detail: 'no independent review after round 2' }),
	},
	{
		title:
			'effort medium, snapshots 1-3, no go-ahead row, independent approve, one blocking row open -> failed, the no-go-ahead part kept before the open part',
		effort: 'medium',
		moves: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }, INDEPENDENT_APPROVES],
		ledger: [
			[1, 'blocking', 'fixed 2'],
			[3, 'blocking', 'open'],
		],
		expected: line({
			status: 'failed',
			detail:
				'3 review rounds, cap 2, no go-ahead recorded · independent review approve · 1 open: blocking or should fix',
		}),
	},
	{
		title:
			'effort medium, snapshots 1-3, no go-ahead row, no independent end -> failed, that part only',
		effort: 'medium',
		moves: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }],
		expected: line({ status: 'failed', detail: 'no independent review after round 3' }),
	},
	{
		title:
			'R1-10: two go-ahead rows of round 3 (person-a first, person-b later) -> the first row names who',
		effort: 'medium',
		moves: [{ snapshot: 1 }, { snapshot: 2 }, { snapshot: 3 }, INDEPENDENT_APPROVES],
		goAheads: [
			{ decision: 'round 3 beyond the cap of 2: one more pass', by: 'person-a' },
			{ decision: 'round 3 beyond the cap of 2: asked again', by: 'person-b' },
		],
		expected: line({
			status: 'passed',
			detail:
				'3 review rounds (cap 2, round 3 by person-a) · independent review approve · approved',
		}),
	},
	{
		title:
			'R1-11: no step events, an independent end after the last snapshot AND ledger rows of round 3 above it -> the end decides the verdict part, not the ledger',
		noStepEvents: true,
		moves: [OLD_CLI_STATION, ...ROUNDS_ONE_TWO, INDEPENDENT_APPROVES],
		ledger: [...CLOSED_TO_2, [3, 'nit', 'closed']],
		expected: line({
			status: 'passed',
			detail: '2 review rounds of 2 · independent review approve · approved',
		}),
	},
	{
		title:
			'R1-6: step events on, ledger rows 1-3 and no round snapshot -> failed: no review round snapshot, with the command of round 1',
		moves: [{ station: 'test-writer', step: 1 }],
		ledger: [
			[1, 'nit', 'closed'],
			[2, 'nit', 'closed'],
			[3, 'nit', 'closed'],
		],
		expected: line({
			status: 'failed',
			detail: `no review round snapshot: dialecte lot snapshot ${STATION_LOT} --round 1`,
		}),
	},
	{
		title:
			"R1-6, R2-2 (D30): no step events (an old folder), ledger rows 1-3 and no round snapshot -> the ledger-only line (today's line), no independent review claimed",
		noStepEvents: true,
		moves: [OLD_CLI_STATION],
		ledger: [
			[1, 'nit', 'closed'],
			[2, 'nit', 'closed'],
			[3, 'nit', 'closed'],
		],
		expected: line({
			status: 'passed',
			detail: '3 rounds · approved · findings ledger',
		}),
	},
]

describe('buildReviewLine: rounds, cap and the independent review (D18)', () => {
	for (const row of CASES)
		it(row.title, () => {
			const lot = lotOf(row)

			expect(buildReviewLine({ folder: lot.lotFolder, release: false })).toEqual(row.expected)
		})
})

describe('buildReviewLine: a real folder of 7 ledger rounds (case 17)', () => {
	it('3 empty snapshots with their base, 48 ledger rows of rounds 1-7, effort high from an effort line -> 3 review rounds of 3, the independent rows counted apart, passed', () => {
		const lot = createStationLot()
		setIdentityEffort({ lot, level: undefined })
		writeRiskLines({ folder: lot.lotFolder, lines: [effortLineOf({ effort: 'high' })] })
		for (const round of [1, 2, 3]) writeSnapshot({ lot, round, baseSecond: round })
		copyFileSync(
			join(REVIEW_LINE_FIXTURE, 'findings-ledger.md'),
			join(lot.lotFolder, 'findings-ledger.md'),
		)

		expect(buildReviewLine({ folder: lot.lotFolder, release: false })).toEqual(
			line({
				status: 'passed',
				detail: '3 review rounds of 3 · independent review: rounds 4-7 in the ledger · approved',
			}),
		)
	})
})
