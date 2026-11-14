/**
 * The findings ledger as the review rounds read it: each row's round and, while open, its severity, and the rounds of
 * the rows above the last snapshot (the independent review's rows, 33L1 section 6). One reader for the card's review
 * line and `lot status`. Files only: no git, no process.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { OPEN_LEDGER_STATES } from '../gate-records/gate-records.constants.ts'
import { findLedgerTable, tableCells } from './findings-ledger.ts'
import { LEDGER_FILE, SEVERITY_SPELLINGS } from './review-rounds.constants.ts'

import type { ReviewLedger } from './review-rounds.types.ts'

/** The rows of the folder's findings ledger with their round and, while open, their severity; `exists` false without a readable file. */
export function readReviewLedger(params: { folder: string }): ReviewLedger {
	let text: string
	try {
		text = readFileSync(join(params.folder, LEDGER_FILE), 'utf8')
	} catch {
		return { exists: false, rows: [] }
	}
	const lines = text.split('\n')
	const rows = (findLedgerTable(lines)?.rows ?? []).map(function reviewRowOf(row) {
		const cells = tableCells(lines[row.line]) ?? []
		const state = cells.at(-1) ?? ''
		const openSeverity = OPEN_LEDGER_STATES.includes(state)
			? (SEVERITY_SPELLINGS[cells[2] ?? ''] ?? cells[2] ?? '')
			: undefined
		return { round: row.round, openSeverity }
	})
	return { exists: true, rows }
}

/** The distinct rounds of the ledger's rows above the last snapshot's round, ascending (none at or below it). */
export function independentLedgerRounds(params: {
	ledger: ReviewLedger
	lastRound: number
}): number[] {
	const rounds = new Set(
		params.ledger.rows.flatMap((row) =>
			row.round !== undefined && row.round > params.lastRound ? [row.round] : [],
		),
	)
	return [...rounds].sort((left, right) => left - right)
}
