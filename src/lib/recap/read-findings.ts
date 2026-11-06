/**
 * The findings ledger as the recap reads it: every finding row of the file after the table's header - a row
 * whose first cell is a finding id and that has the header's cell count - wherever it stands, so rows written
 * under a note between rounds count too. Each state is read as the history orchestrators write by hand.
 * `findLedgerTable` stays the writers' reader (`lot finding`, `lot decide`): only the first block.
 */
import { existsSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { findTable, tableCells, unescapeCell } from '../review-rounds/findings-ledger.ts'
import { ROUND_PATTERN, SEVERITY_SPELLINGS } from '../review-rounds/review-rounds.constants.ts'
import {
	ABSOLUTE_PATH_PATTERN,
	ACCEPTED_WORD,
	LEFTOVER_ABSOLUTE_PATH_PATTERN,
	NO_ROUND,
	OUTSIDE_WORKSPACE,
	PARENTHESISED_REASON_PATTERN,
	REASON_LEAD_PATTERN,
	REVIEWER_TAG_PATTERN,
	ROUND_FROM_ID_PATTERN,
	STATE_SEGMENT_SEPARATOR,
	STATE_TRANSITIONS,
	STATE_WORDS,
	UNREADABLE_STATE,
	URL_PATTERN,
} from './recap.constants.ts'

import type { FindingOutcome, RecapFinding, RecapPathBases } from './recap.types.ts'

/** The ledger's finding rows, or the refusal of the first row recap cannot print; undefined when there is no ledger. */
export function readFindings(params: {
	path: string
	bases: RecapPathBases
}): RecapFinding[] | string | undefined {
	if (!existsSync(params.path)) return undefined
	const lines = readFileSync(params.path, 'utf8').split('\n')
	const table = findTable({ lines, firstCell: 'id' })
	if (!table) return []
	const headerLine = table.lastLine - table.rowLines.length - 1
	const cellCount = tableCells(lines[headerLine])?.length ?? 0
	const findings: RecapFinding[] = []
	for (const line of lines.slice(headerLine + 2)) {
		const cells = tableCells(line)?.map(unescapeCell)
		if (!cells || cells.length !== cellCount) continue
		const finding = readFinding({ cells, bases: params.bases })
		if (typeof finding === 'string') return finding
		findings.push(finding)
	}
	return findings
}

/** One finding row, or why recap cannot print it. */
function readFinding(params: { cells: string[]; bases: RecapPathBases }): RecapFinding | string {
	const { cells } = params
	const id = cells[0]
	const severity = cells[2] ?? ''
	const state = cells.at(-1) ?? ''
	const decided = decideState(state)
	if (!decided) return UNREADABLE_STATE.replace('{id}', id).replace('{state}', state)
	const round = roundOf(cells)
	if (round === undefined) return NO_ROUND.replace('{id}', id)
	const at = relativeAt({ at: cells[3] ?? '', bases: params.bases })
	if (at === undefined) return OUTSIDE_WORKSPACE.replace('{id}', id)
	return {
		id,
		round,
		severity: Object.hasOwn(SEVERITY_SPELLINGS, severity) ? SEVERITY_SPELLINGS[severity] : severity,
		at,
		finding: (cells[4] ?? '').replace(REVIEWER_TAG_PATTERN, ''),
		outcome: decided.outcome,
		...(decided.reason && { reason: decided.reason }),
	}
}

/** A row's round: its round cell, else the round its id names (`R<n>-...`); undefined when neither has one. */
function roundOf(cells: string[]): number | undefined {
	if (ROUND_PATTERN.test(cells[1] ?? '')) return Number(cells[1])
	const id = ROUND_FROM_ID_PATTERN.exec(cells[0])
	return id ? Number(id[1]) : undefined
}

/**
 * The outcome of a state, from the last segment of its history: the first segment starts with a state word,
 * each later one with a transition after a ` - ` outside parentheses (`STATE_TRANSITIONS`); any other ` - `
 * belongs to the text before it. An accepted state's reason is the rest after its last `accepted`: the text in its
 * outer parentheses, else the text after a leading `- ` or `: `. Undefined when the first segment starts with
 * no state word.
 */
function decideState(state: string): { outcome: FindingOutcome; reason?: string } | undefined {
	const first = STATE_WORDS.find((candidate) =>
		startsWithWord({ text: state, word: candidate.word }),
	)
	if (!first) return undefined
	const last = lastTransition(state) ?? { outcome: first.outcome, start: 0 }
	if (last.outcome !== 'accepted') return { outcome: last.outcome }
	const rest = state
		.slice(last.start + ACCEPTED_WORD.length)
		.replace(REASON_LEAD_PATTERN, '')
		.trim()
	const reason = PARENTHESISED_REASON_PATTERN.exec(rest)?.[1].trim() ?? rest
	return { outcome: 'accepted', reason }
}

/**
 * The last transition after a ` - ` outside parentheses: its outcome and where its text starts; undefined
 * when there is none.
 */
function lastTransition(state: string): { outcome: FindingOutcome; start: number } | undefined {
	let last: { outcome: FindingOutcome; start: number } | undefined
	let depth = 0
	for (let index = 0; index < state.length; index++) {
		if (state[index] === '(') depth++
		else if (state[index] === ')') depth = Math.max(0, depth - 1)
		else if (depth === 0 && state.startsWith(STATE_SEGMENT_SEPARATOR, index)) {
			const start = index + STATE_SEGMENT_SEPARATOR.length
			const transition = STATE_TRANSITIONS.find((candidate) =>
				candidate.pattern.test(state.slice(start)),
			)
			if (transition) last = { outcome: transition.outcome, start }
			index += STATE_SEGMENT_SEPARATOR.length - 1
		}
	}
	return last
}

/** `text` starts with `word` as a whole word: `fixed 2`, `accepted:`, not `opened`. */
function startsWithWord(params: { text: string; word: string }): boolean {
	const { text, word } = params
	return text.startsWith(word) && !/[\p{L}\p{N}_-]/u.test(text.charAt(word.length))
}

/**
 * A `file:line` cell with each absolute path made relative: to the repository when inside it, else to the
 * workspace folder; undefined when one points outside both, or when an absolute path is left that the rewrite
 * does not reach (a `/` starting a path segment after a backtick, a quote, `=`, `[`, `-`; `~/`). URLs are no
 * paths.
 */
function relativeAt(params: { at: string; bases: RecapPathBases }): string | undefined {
	let outside = false
	const at = params.at.replace(ABSOLUTE_PATH_PATTERN, function relativePath(_, before, path) {
		const base = [...params.bases.repository, ...params.bases.workspace].find(
			(candidate) => path === candidate || path.startsWith(`${candidate}/`),
		)
		if (base === undefined) outside = true
		return `${before}${base === undefined ? path : relative(base, path) || '.'}`
	})
	if (outside || LEFTOVER_ABSOLUTE_PATH_PATTERN.test(at.replace(URL_PATTERN, ''))) return undefined
	return at
}
