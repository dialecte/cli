/**
 * `decisions.md` in a lot's hand-over folder: the decisions made outside the findings ledger (the user's
 * above all), one row `| decision | by | when |` each. `lot choice` appends a row the way `lot finding`
 * appends a finding; `recap` reads the rows back.
 */
import { existsSync, readFileSync } from 'node:fs'

import {
	appendTableRow,
	escapeCell,
	findTable,
	tableCells,
	unescapeCell,
} from './findings-ledger.ts'
import { DECISIONS_FIRST_CELL, DECISIONS_TABLE_HEAD } from './review-rounds.constants.ts'

import type { DecisionRow } from './review-rounds.types.ts'

/** Appends `| <decision> | <by> | <when> |` to the decisions file at `path` (made when absent). */
export function appendDecision(params: {
	path: string
	/** The hand-over folder's name, in the title of a new file. */
	title: string
	decision: string
	by: string
	/** The day, `yyyy-mm-dd`. */
	when: string
}): void {
	const lines = (existsSync(params.path) ? readFileSync(params.path, 'utf8') : '').split('\n')
	appendTableRow({
		path: params.path,
		lines,
		table: findTable({ lines, firstCell: DECISIONS_FIRST_CELL }),
		title: `# Decisions - ${params.title}`,
		head: DECISIONS_TABLE_HEAD,
		row: `| ${escapeCell(params.decision)} | ${escapeCell(params.by)} | ${params.when} |`,
	})
}

/** The rows of the decisions file at `path`, their pipes unescaped; none when the file is absent. */
export function readDecisions(path: string): DecisionRow[] {
	if (!existsSync(path)) return []
	const lines = readFileSync(path, 'utf8').split('\n')
	const table = findTable({ lines, firstCell: DECISIONS_FIRST_CELL })
	return (table?.rowLines ?? []).map(function decisionOf(line) {
		const [decision = '', by = '', when = ''] = (tableCells(lines[line]) ?? []).map(unescapeCell)
		return { decision, by, when }
	})
}

/** The local calendar day of `date`: `yyyy-mm-dd`. */
export function dayOf(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${date.getFullYear()}-${month}-${day}`
}
