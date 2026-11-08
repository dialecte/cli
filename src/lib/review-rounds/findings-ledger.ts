/**
 * The findings ledger of a lot's review rounds: a markdown table `| id | round | severity | file:line |
 * finding | state |` in the hand-over folder. A finding is appended right after the table's last row, a
 * decision rewrites one row's state cell; every other byte of the file stays as it was, so a ledger
 * written or annotated by hand stays readable.
 */
import { existsSync, readFileSync } from 'node:fs'

import { replaceWhole } from '../store/publish.ts'
import {
	CELL_SEPARATOR_PATTERN,
	DECISION_STATES,
	FINDING_ID_PATTERN,
	LEDGER_TABLE_HEAD,
	ROUND_PATTERN,
} from './review-rounds.constants.ts'

import type { TemporaryFileSeam } from '../store/store.types.ts'
import type { DecisionState, LedgerTable, MarkdownTable } from './review-rounds.types.ts'

/** A value as a ledger cell writes it: `|` escaped. */
export function escapeCell(value: string): string {
	return value.replace(/\|/g, '\\|')
}

/** A ledger cell's value as written by `escapeCell`, read back: `\|` is `|`. */
export function unescapeCell(cell: string): string {
	return cell.replace(/\\\|/g, '|')
}

/**
 * The cells of a table line (`| a | b \| c |` → `a`, `b \| c`), trimmed; undefined when the line is no
 * table line. An escaped `\|` is no separator.
 */
export function tableCells(line: string): string[] | undefined {
	const trimmed = line.replace(/\r$/, '').trim()
	if (!trimmed.startsWith('|')) return undefined
	const cells = trimmed.split(CELL_SEPARATOR_PATTERN).slice(1)
	if (/(?<!\\)\|$/.test(trimmed)) cells.pop()
	return cells.map((cell) => cell.trim())
}

/** The findings table among the ledger's lines: a header whose first cell is `id`, its separator, its rows. */
export function findLedgerTable(lines: string[]): LedgerTable | undefined {
	const table = findTable({ lines, firstCell: 'id' })
	if (!table) return undefined
	return {
		lastLine: table.lastLine,
		rows: table.rowLines.map(function ledgerRow(line) {
			const cells = tableCells(lines[line]) ?? []
			return { line, id: cells[0], round: roundOfRow(cells) }
		}),
	}
}

/**
 * The first markdown table among the lines whose header's first cell is `firstCell`: a header, its
 * separator, the row lines up to the first line that is no table line.
 */
export function findTable(params: {
	lines: string[]
	firstCell: string
}): MarkdownTable | undefined {
	const { lines } = params
	for (let index = 0; index + 1 < lines.length; index++) {
		const header = tableCells(lines[index])
		const separator = tableCells(lines[index + 1])
		if (header?.[0] !== params.firstCell || !separator?.every((cell) => /^:?-+:?$/.test(cell)))
			continue
		const rowLines: number[] = []
		let line = index + 2
		for (; line < lines.length && tableCells(lines[line]); line++) rowLines.push(line)
		return { lastLine: line - 1, rowLines }
	}
	return undefined
}

/** A row's round: its round cell, else the round its id names. */
function roundOfRow(cells: string[]): number | undefined {
	if (ROUND_PATTERN.test(cells[1] ?? '')) return Number(cells[1])
	const id = FINDING_ID_PATTERN.exec(cells[0])
	return id ? Number(id[1]) : undefined
}

/**
 * Appends the finding `| R<round>-<k> | ... | open |` to the ledger at `path` (made when absent) and
 * answers its id: k is one past the highest number of the round's ids in the id cells.
 */
export function appendFinding(params: {
	path: string
	/** The hand-over folder's name, in the title of a new ledger. */
	title: string
	round: number
	severity: string
	at: string
	finding: string
	/** Called once the ledger's temporary file is written and before it replaces the ledger. */
	afterTemporaryWritten?: TemporaryFileSeam
}): string {
	const text = existsSync(params.path) ? readFileSync(params.path, 'utf8') : ''
	const lines = text.split('\n')
	const table = findLedgerTable(lines)
	const numbers = (table?.rows ?? []).map(function numberInRound(row) {
		const id = FINDING_ID_PATTERN.exec(row.id)
		return id && Number(id[1]) === params.round ? Number(id[2]) : 0
	})
	const id = `R${params.round}-${Math.max(0, ...numbers) + 1}`
	const row = `| ${id} | ${params.round} | ${params.severity} | ${escapeCell(params.at)} | ${escapeCell(params.finding)} | open |`
	appendTableRow({
		path: params.path,
		lines,
		table,
		title: `# Findings ledger - ${params.title}`,
		head: LEDGER_TABLE_HEAD,
		row,
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
	return id
}

/**
 * Writes `row` into the file at `path` whose lines are `lines`: right after the table's last row (its line
 * end kept), every other byte as it was; a file without that table gets the header and the row at its end,
 * an empty or absent file the title first.
 */
export function appendTableRow(params: {
	path: string
	lines: string[]
	table: Pick<MarkdownTable, 'lastLine'> | undefined
	/** The title line of a new file. */
	title: string
	/** The table's header row and separator, each followed by a line feed. */
	head: string
	row: string
	/** Called once the file's temporary file is written and before it replaces the file. */
	afterTemporaryWritten?: TemporaryFileSeam
}): void {
	replaceWhole({
		path: params.path,
		text: textWithRow(params),
		afterTemporaryWritten: params.afterTemporaryWritten,
	})
}

/** The file's text with `row` written in: after the table's last row, else the header (and the title) first. */
function textWithRow(params: {
	lines: string[]
	table: Pick<MarkdownTable, 'lastLine'> | undefined
	title: string
	head: string
	row: string
}): string {
	const { lines, table, row } = params
	const text = lines.join('\n')
	if (table) {
		const lineEnd = lines[table.lastLine].endsWith('\r') ? '\r' : ''
		const written = [...lines]
		written.splice(table.lastLine + 1, 0, `${row}${lineEnd}`)
		return written.join('\n')
	}
	if (text === '') return `${params.title}\n\n${params.head}${row}\n`
	return `${text}${text.endsWith('\n') ? '' : '\n'}\n${params.head}${row}\n`
}

/**
 * The state `lot decide` writes from its words (`fixed 3 with R3-1` → `fixed 3 (with R3-1)`), or the
 * usage error when the words name no state or miss its value.
 */
export function parseDecision(words: string[]): DecisionState | string {
	const [state, ...rest] = words
	const value = rest.join(' ').trim()
	if (state === 'open' || state === 'fix-to-verify')
		return rest.length === 0
			? { written: state === 'open' ? 'open' : 'fix to verify' }
			: `${state} takes no value`
	if (state === 'fixed') {
		const [round, ...note] = rest
		if (!ROUND_PATTERN.test(round ?? ''))
			return 'fixed takes the round that verified the fix: fixed <round> [note]'
		const text = note.join(' ').trim()
		return {
			written: text ? `fixed ${round} (${escapeCell(text)})` : `fixed ${round}`,
			fixedRound: Number(round),
		}
	}
	if (state === 'accepted' || state === 'logged')
		return value
			? { written: `${state} (${escapeCell(value)})` }
			: `${state} takes a non-empty ${state === 'accepted' ? 'reason' : 'where'}`
	return `unknown state ${JSON.stringify(state ?? '')}; states: ${DECISION_STATES.join(', ')}`
}

/** Rewrites the state cell of `row` in `line`, keeping the rest of the line byte for byte. */
export function replaceStateCell(params: { line: string; written: string }): string {
	const { line } = params
	const lineEnd = line.endsWith('\r') ? '\r' : ''
	const body = lineEnd ? line.slice(0, -1) : line
	const pipes = [...body.matchAll(/(?<!\\)\|/g)].map((match) => match.index)
	const closed = body.trimEnd().endsWith('|') && pipes.length >= 2
	const start = closed ? pipes[pipes.length - 2] : pipes[pipes.length - 1]
	const end = closed ? pipes[pipes.length - 1] : body.length
	return `${body.slice(0, start + 1)} ${params.written}${closed ? ' ' : ''}${body.slice(end)}${lineEnd}`
}
