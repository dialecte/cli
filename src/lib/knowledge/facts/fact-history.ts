/**
 * A fact's history: `F-<n>.history.jsonl`, one JSON line per event, each appended in one `O_APPEND` write under
 * the line limit (so two writers never interleave), a torn last line a crash left closed by the next append (its
 * newline written alone, before the line).
 */
import {
	closeSync,
	constants,
	fstatSync,
	openSync,
	readFileSync,
	readSync,
	writeSync,
} from 'node:fs'
import { join } from 'node:path'

import { cutValue } from '../../events/write-event.ts'
import {
	HISTORY_EXTENSION,
	HISTORY_FILE_MODE,
	HISTORY_LINE_LIMIT,
	LIST_COUNT_SUFFIX,
} from './facts.constants.ts'

import type { HistoryLine } from './facts.types.ts'

/**
 * Appends one line to a history file in one write; refuses a line over the limit (its JSON and newline, in UTF-8
 * bytes), nothing written; after a torn last line, first closes it with a newline in a write of its own, so the
 * line's write alone holds the limit. A short write is a failure.
 */
export function appendHistory(params: { file: string; line: HistoryLine }): void {
	const line = fittingBufferOf(params)
	const torn = endsTorn({ file: params.file })
	const descriptor = openSync(
		params.file,
		constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY,
		HISTORY_FILE_MODE,
	)
	try {
		if (torn) writeWhole({ descriptor, buffer: Buffer.from('\n'), file: params.file })
		writeWhole({ descriptor, buffer: line, file: params.file })
	} finally {
		closeSync(descriptor)
	}
}

/**
 * A history line made to fit before anything is written: its lists cut after `CUT_LIST_LIMIT` entries and its
 * strings after `CUT_STRING_LIMIT` code points (a cli event's cut, `cutValue`); still over the limit, each list
 * member replaced by its length, `<member>Count` (D17b); `cut: true` when anything was cut or counted. Over the
 * limit even then -> refused, naming the file. A caller builds it before the change it records.
 */
export function fittedHistoryLine(params: { file: string; line: HistoryLine }): HistoryLine {
	const { value, cut } = cutValue(params.line)
	const line = cut ? { ...(value as HistoryLine), cut: true } : params.line
	if (bufferOf({ line }).length <= HISTORY_LINE_LIMIT) return line
	const counted: HistoryLine = { ...countedLists({ line, whole: params.line }), cut: true }
	fittingBufferOf({ file: params.file, line: counted })
	return counted
}

/** The line with each list member replaced, in its place, by `<member>Count`: the length of the whole list. */
function countedLists(params: { line: HistoryLine; whole: HistoryLine }): HistoryLine {
	const counted: Record<string, unknown> = {}
	for (const [name, field] of Object.entries(params.line)) {
		const whole = params.whole[name]
		if (Array.isArray(whole)) counted[`${name}${LIST_COUNT_SUFFIX}`] = whole.length
		else counted[name] = field
	}
	return counted as HistoryLine
}

/** The line's JSON and newline in UTF-8, refused over the limit. */
function fittingBufferOf(params: { file: string; line: HistoryLine }): Buffer {
	const buffer = bufferOf(params)
	if (buffer.length > HISTORY_LINE_LIMIT)
		throw new Error(overLimitMessage({ bytes: buffer.length, file: params.file }))
	return buffer
}

/** The line's JSON and newline in UTF-8 (what the limit counts). */
function bufferOf(params: { line: HistoryLine }): Buffer {
	return Buffer.from(`${JSON.stringify(params.line)}\n`, 'utf8')
}

/** One `writeSync` of the whole buffer; a short write is a failure. */
function writeWhole(params: { descriptor: number; buffer: Buffer; file: string }): void {
	const written = writeSync(params.descriptor, params.buffer)
	if (written !== params.buffer.length)
		throw new Error(`short write: ${written} of ${params.buffer.length} bytes to ${params.file}`)
}

/** The readable lines of a fact's history, in their order, a torn or unparseable one skipped; none without a file. */
export function readHistory(params: { folder: string; id: string }): HistoryLine[] {
	let text: string
	try {
		text = readFileSync(historyPathOf(params), 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
		throw error
	}
	return text.split('\n').flatMap(parsedLine)
}

/** The path of a fact's history file in the facts folder. */
export function historyPathOf(params: { folder: string; id: string }): string {
	return join(params.folder, `${params.id}${HISTORY_EXTENSION}`)
}

/** One history line parsed, as a list of none (empty, torn or not a line object) or one. */
function parsedLine(text: string): HistoryLine[] {
	if (text === '') return []
	try {
		const value: unknown = JSON.parse(text)
		return isHistoryLine(value) ? [value] : []
	} catch {
		return []
	}
}

function isHistoryLine(value: unknown): value is HistoryLine {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { event?: unknown }).event === 'string'
	)
}

/** Why a line is refused: its size, the bound, that the cut could not fit it, and the fix. */
function overLimitMessage(params: { bytes: number; file: string }): string {
	return `history line of ${params.bytes} bytes for ${params.file} is over the limit of ${HISTORY_LINE_LIMIT.toLocaleString('en-US')} bytes (newline included) even with its strings cut and its lists counted, so nothing was written: it holds too many members to record, report it as a cli fault naming this file`
}

/** True when the file holds bytes and its last one is not `\n` (a torn line a crash left). */
function endsTorn(params: { file: string }): boolean {
	let descriptor: number
	try {
		descriptor = openSync(params.file, 'r')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
		throw error
	}
	try {
		const { size } = fstatSync(descriptor)
		if (size === 0) return false
		const last = Buffer.alloc(1)
		readSync(descriptor, last, 0, 1, size - 1)
		return last.toString('utf8') !== '\n'
	} finally {
		closeSync(descriptor)
	}
}
