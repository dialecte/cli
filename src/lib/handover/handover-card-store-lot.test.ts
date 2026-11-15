/**
 * The card's `lot` line (33L1 6b, D1, D28): a hand-over folder that is not a store lot, without the go-ahead row,
 * fails the line and blocks a card still to run; with the row the line is a warning and the verdict stays (READY or
 * DONE), a simulated or damaged store lot blocks it. The cards that show no line (a healthy store lot, a release, a
 * DONE card without the row) pass without the wiring: the unit describe of `readStoreLotLine` holds them.
 */
import { basename, join } from 'node:path'

import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import { createBranchRepository, storeLotFolder } from '../../../test/handover-store-scenario.ts'
import { startSimulatedLot } from '../../../test/lot-handover-workspace.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import {
	GO_AHEAD_DAY,
	GO_AHEAD_LINE,
	REFUSING_LINE,
} from '../../../test/store-lot-guard-workspace.constants.ts'
import { cardOf } from '../../../test/store-lot-guard-workspace.ts'
import { appendDecision } from '../review-rounds/decisions-file.ts'
import { DECISIONS_FILE } from '../review-rounds/review-rounds.constants.ts'
import { RECORD_DAMAGE_REASONS } from '../store/store.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandoverCard } from './handover.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A plain temporary folder (never a lot of the store), with the go-ahead row when asked. */
function folderOf(params: { row?: boolean }): string {
	const folder = temporaryFolder('dialecte-lot-card-')
	if (params.row)
		appendDecision({
			path: join(folder, DECISIONS_FILE),
			title: 'plain',
			decision: 'not a store lot: r',
			by: 'reviewer',
			when: GO_AHEAD_DAY,
		})
	return folder
}

/** What the card says about the lot line: its verdict, failed gates and the `lot` lines. */
function lotSummaryOf(card: HandoverCard): {
	verdict: string
	failedGates: string[]
	lotLines: unknown[]
} {
	return {
		verdict: card.verdict,
		failedGates: card.failedGates,
		lotLines: card.gates
			.filter((gate) => gate.name === 'lot')
			.map((gate) => ({ name: gate.name, status: gate.status, detail: gate.detail })),
	}
}

describe('the lot line of the card', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	type Case = {
		title: string
		row?: boolean
		done?: boolean
		abandoned?: boolean
		/** The folder of a lot of the store (default: a plain folder). */
		storeLot?: () => string
		expected: (folder: string) => { verdict: string; failedGates: string[]; lotLines: unknown[] }
	}

	const CASES: Case[] = [
		{
			title: 'not a store lot, no go-ahead row -> the failed line, the card BLOCKED on lot',
			expected: () => ({ verdict: 'BLOCKED', failedGates: ['lot'], lotLines: [REFUSING_LINE] }),
		},
		{
			title: 'not a store lot, the go-ahead row -> the warning line, the card READY',
			row: true,
			expected: () => ({ verdict: 'READY', failedGates: [], lotLines: [GO_AHEAD_LINE] }),
		},
		{
			title: 'a DONE card with the go-ahead row -> the same warning, the verdict DONE',
			row: true,
			done: true,
			expected: () => ({ verdict: 'DONE', failedGates: [], lotLines: [GO_AHEAD_LINE] }),
		},
		{
			title: 'an ABANDONED card without the go-ahead row -> no lot line, the verdict ABANDONED',
			abandoned: true,
			expected: () => ({ verdict: 'ABANDONED', failedGates: [], lotLines: [] }),
		},
		{
			title: 'an ABANDONED card with the go-ahead row -> the warning line, the verdict ABANDONED',
			row: true,
			abandoned: true,
			expected: () => ({ verdict: 'ABANDONED', failedGates: [], lotLines: [GO_AHEAD_LINE] }),
		},
		{
			title:
				'a simulated store lot -> the failed line with the guard refusal, the card BLOCKED (D20)',
			storeLot: () => startSimulatedLot().lotFolder,
			expected: (folder) => ({
				verdict: 'BLOCKED',
				failedGates: ['lot'],
				lotLines: [
					{
						name: 'lot',
						status: 'failed',
						detail: `${basename(folder)} is a simulated lot: a simulated lot never commits`,
					},
				],
			}),
		},
		{
			title:
				'a store lot whose identity does not read -> the failed line naming the damage, BLOCKED (D20)',
			storeLot: () => {
				const folder = storeLotFolder({ root: createBranchRepository(), name: 'card' })
				replaceRecord({ folder, name: 'identity.json', text: 'not json' })
				return folder
			},
			expected: (folder) => ({
				verdict: 'BLOCKED',
				failedGates: ['lot'],
				lotLines: [
					{
						name: 'lot',
						status: 'failed',
						detail: `${basename(folder)} is a damaged lot of the store: ${RECORD_DAMAGE_REASONS.identityUnreadable}`,
					},
				],
			}),
		},
	]

	for (const { title, row, done, abandoned, storeLot, expected } of CASES)
		it(title, () => {
			const folder = storeLot?.() ?? folderOf({ row })

			expect(lotSummaryOf(cardOf({ folder, done, abandoned }))).toEqual(expected(folder))
		})
})
