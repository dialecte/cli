/**
 * The card's `review` line takes `lot verify`'s record as the independent review (FIX-review-verify): a `verify.jsonl`
 * line strictly after the last snapshot counts, in a hand-over folder that is no lot as in a lot, after a station end's
 * verdict and the ledger rows above the snapshot. Every case writes a whole folder, its verify lines by `lot verify`
 * itself, and asserts the whole line.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { writeLedger } from '../../../test/lot-report-workspace.ts'
import { createStationLot } from '../../../test/lot-station-workspace.ts'
import {
	playMoves,
	setIdentityEffort,
	timeAtSecond,
	writeSnapshot,
} from '../../../test/station-records-workspace.ts'
import { runLotVerify } from '../../commands/lot-verify.ts'
import { buildReviewLine } from './card-gates.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StationLot } from '../../../test/lot-station-workspace.types.ts'
import type { Move } from '../../../test/station-records-workspace.types.ts'
import type { CardGateLine } from './gate-records.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

type Case = {
	title: string
	/** `hand-over`: a `_commit-plan/<topic>-<date>/` folder with no lot store and no events; `lot`: the lot's own folder. */
	folder: 'hand-over' | 'lot'
	/** The review round snapshots, each `.state` at its second. */
	snapshots: { round: number; second: number }[]
	/** The `lot verify` runs, each at its second. */
	verifies?: number[]
	/** The station runs of a lot folder (its events). */
	moves?: Move[]
	/** The findings ledger rows `[round, severity, state]`; no ledger file when left out. */
	ledger?: [number, string, string][]
	expected: CardGateLine
}

/** A review line as the card holds it. */
function line(params: { status: CardGateLine['status']; detail: string }): CardGateLine {
	return { name: 'review', ...params }
}

/** The folder of a case, written as the case says: the lot's, or a plain hand-over folder beside its repository. */
function folderOf(row: Case): string {
	const lot = createStationLot({ repositoryIsWorktree: row.folder === 'lot' })
	setIdentityEffort({ lot, level: 'low' })
	const target: StationLot =
		row.folder === 'lot'
			? lot
			: { ...lot, lotFolder: join(lot.workspace.workspace, '_commit-plan', 'topic-2026-11-17') }
	mkdirSync(target.lotFolder, { recursive: true })
	if (row.moves) playMoves({ lot: target, moves: row.moves })
	for (const snapshot of row.snapshots)
		writeSnapshot({ lot: target, round: snapshot.round, state: snapshot.second })
	if (row.ledger) writeLedger({ lot: target, findings: row.ledger })
	for (const second of row.verifies ?? []) {
		const verified = runLotVerify({
			cwd: lot.cwd,
			argv: [target.lotFolder, '--by', 'reviewer', '--note', 'round 2 verified, no finding'],
			now: new Date(timeAtSecond(second)),
		})
		expect(verified.exitCode).toBe(0)
	}
	return target.lotFolder
}

const CLOSED_TO_2: [number, string, string][] = [
	[1, 'blocking', 'fixed 2'],
	[2, 'nit', 'accepted'],
]

const NO_REVIEW_AFTER_2 = line({ status: 'failed', detail: 'no independent review after round 2' })

const CASES: Case[] = [
	{
		title:
			'hand-over folder: a clean lot verify after the last snapshot -> passed, verified by its --by',
		folder: 'hand-over',
		snapshots: [
			{ round: 1, second: 2 },
			{ round: 2, second: 4 },
		],
		ledger: CLOSED_TO_2,
		verifies: [6],
		expected: line({
			status: 'passed',
			detail:
				'2 review rounds (no effort recorded) · independent review: verified by reviewer · approved',
		}),
	},
	{
		title: 'hand-over folder: a lot verify before the last snapshot -> stale: failed after round 2',
		folder: 'hand-over',
		snapshots: [
			{ round: 1, second: 2 },
			{ round: 2, second: 6 },
		],
		ledger: CLOSED_TO_2,
		verifies: [4],
		expected: NO_REVIEW_AFTER_2,
	},
	{
		title:
			"hand-over folder: a lot verify at the last snapshot's second -> a tie is not after: failed",
		folder: 'hand-over',
		snapshots: [
			{ round: 1, second: 2 },
			{ round: 2, second: 4 },
		],
		ledger: CLOSED_TO_2,
		verifies: [4],
		expected: NO_REVIEW_AFTER_2,
	},
	{
		title:
			'lot folder: an independent-reviewer end approve after the last snapshot -> passed, as today',
		folder: 'lot',
		snapshots: [],
		moves: [{ snapshot: 1 }, { station: 'independent-reviewer', verdict: 'approve' }],
		expected: line({
			status: 'passed',
			detail: '1 review round of 1 · independent review approve · approved',
		}),
	},
	{
		title:
			'lot folder: a clean lot verify after the last snapshot, no independent end -> passed, verified by its --by',
		folder: 'lot',
		snapshots: [],
		moves: [{ snapshot: 1 }],
		verifies: [10],
		expected: line({
			status: 'passed',
			detail: '1 review round of 1 · independent review: verified by reviewer · approved',
		}),
	},
	{
		title: 'hand-over folder: a findings round above the last snapshot -> passed, as today',
		folder: 'hand-over',
		snapshots: [
			{ round: 1, second: 2 },
			{ round: 2, second: 4 },
		],
		ledger: [...CLOSED_TO_2, [3, 'nit', 'accepted']],
		expected: line({
			status: 'passed',
			detail:
				'2 review rounds (no effort recorded) · independent review: round 3 in the ledger · approved',
		}),
	},
	{
		title: 'hand-over folder: nothing recorded after the last snapshot -> failed after round 2',
		folder: 'hand-over',
		snapshots: [
			{ round: 1, second: 2 },
			{ round: 2, second: 4 },
		],
		ledger: CLOSED_TO_2,
		expected: NO_REVIEW_AFTER_2,
	},
]

describe('buildReviewLine: lot verify after the last snapshot is the independent review', () => {
	for (const row of CASES)
		it(row.title, () => {
			const folder = folderOf(row)

			expect(buildReviewLine({ folder, release: false })).toEqual(row.expected)
		})
})
