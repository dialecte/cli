import { closeSync, constants, fstatSync, openSync, readSync, writeSync } from 'node:fs'

import {
	CUT_LIST_LIMIT,
	CUT_STRING_LIMIT,
	EVENT_FILE_MODE,
	EVENT_ID_TIME_SEPARATORS,
	EVENT_SCHEMA,
} from './events.constants.ts'

import type {
	AppendLineParams,
	LotEvent,
	MakeEnvelopeParams,
	WriteEventParams,
} from './event.types.ts'

/** The events made by this process so far: the `n` of the next id. */
let eventCount = 0

/** Appends one event as one line, in one write; refuses a line over the limit; a short write is a failure. */
export function writeEvent(params: WriteEventParams): void {
	appendLine({
		file: params.file,
		line: eventLineOf({ event: params.event }),
		limit: params.limit,
		writeBuffer: params.writeBuffer,
	})
}

/**
 * Appends one whole line (its `\n` included) to `file` in one write, after a `\n` when the file ends torn; refuses a
 * line over `limit` bytes; a short write is a failure. The single-write append of every JSON-lines file of a lot.
 */
export function appendLine(params: AppendLineParams): void {
	const { file, line, limit, writeBuffer = writeWhole } = params
	if (line.length > limit) throw new Error(overLimitMessage({ bytes: line.length, limit }))
	const buffer = endsTorn({ file }) ? Buffer.concat([Buffer.from('\n'), line]) : line
	const descriptor = openSync(
		file,
		constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY,
		EVENT_FILE_MODE,
	)
	try {
		const written = writeBuffer({ descriptor, buffer })
		if (written !== buffer.length)
			throw new Error(`short write: ${written} of ${buffer.length} bytes to ${file}`)
	} finally {
		closeSync(descriptor)
	}
}

/** The line an event is written as: its JSON and `\n`, in UTF-8 (what the limit counts). */
export function eventLineOf(params: { event: LotEvent }): Buffer {
	return Buffer.from(`${JSON.stringify(params.event)}\n`, 'utf8')
}

/** Why a line is refused: its size and the limit, in bytes. */
export function overLimitMessage(params: { bytes: number; limit: number }): string {
	return `event line of ${params.bytes} bytes is over the limit of ${params.limit} bytes`
}

/** The envelope of an event: schema, id, at, lot, kind, by, pid, cli, simulated, hostEvent (worktreeCli when given). */
export function makeEnvelope(params: MakeEnvelopeParams): LotEvent {
	const at = (params.now ?? currentTime)().toISOString()
	const pid = params.pid ?? process.pid
	eventCount += 1
	return {
		schema: EVENT_SCHEMA,
		id: `ev-${at.replace(EVENT_ID_TIME_SEPARATORS, '')}Z-${pid}-${eventCount}`,
		at,
		lot: params.lot,
		kind: params.kind,
		by: params.by,
		pid,
		cli: params.cli,
		...(params.worktreeCli === undefined ? {} : { worktreeCli: params.worktreeCli }),
		simulated: params.simulated,
		hostEvent: params.hostEvent,
	}
}

/** A cli event with its lists and strings cut (`cut: true` when anything was cut). */
export function cutEvent(params: { event: LotEvent }): LotEvent {
	const { value, cut } = cutValue(params.event)
	return cut ? { ...(value as LotEvent), cut: true } : params.event
}

/** A value with its lists after `CUT_LIST_LIMIT` entries and its strings after `CUT_STRING_LIMIT` characters cut. */
function cutValue(value: unknown): { value: unknown; cut: boolean } {
	if (typeof value === 'string') return cutString(value)
	if (Array.isArray(value)) return cutList(value)
	if (value !== null && typeof value === 'object')
		return cutObject(value as Record<string, unknown>)
	return { value, cut: false }
}

/** A string cut after `CUT_STRING_LIMIT` characters (code points: a pair is never split). */
function cutString(text: string): { value: string; cut: boolean } {
	const characters = Array.from(text)
	return characters.length > CUT_STRING_LIMIT
		? { value: characters.slice(0, CUT_STRING_LIMIT).join(''), cut: true }
		: { value: text, cut: false }
}

/** A list cut after `CUT_LIST_LIMIT` entries, each entry cut in turn. */
function cutList(list: unknown[]): { value: unknown[]; cut: boolean } {
	const entries = list.slice(0, CUT_LIST_LIMIT).map(cutValue)
	return {
		value: entries.map(valueOf),
		cut: list.length > CUT_LIST_LIMIT || entries.some(isCut),
	}
}

/** An object with each of its values cut. */
function cutObject(object: Record<string, unknown>): {
	value: Record<string, unknown>
	cut: boolean
} {
	let cut = false
	const value: Record<string, unknown> = {}
	for (const [key, field] of Object.entries(object)) {
		const result = cutValue(field)
		value[key] = result.value
		cut ||= result.cut
	}
	return { value, cut }
}

/** The value of a cut result. */
function valueOf(result: { value: unknown }): unknown {
	return result.value
}

/** Whether a cut result cut anything. */
function isCut(result: { cut: boolean }): boolean {
	return result.cut
}

/** The default write: one `writeSync` of the whole buffer, answering the bytes written. */
function writeWhole(params: { descriptor: number; buffer: Buffer }): number {
	return writeSync(params.descriptor, params.buffer)
}

/** The clock of a real event. */
function currentTime(): Date {
	return new Date()
}

/**
 * True when the file holds bytes and its last one is not `\n` (a torn line a crash left). Not atomic with the append:
 * Linux grows a file's size page by page while another process's append is still being written, so this check can
 * see that line mid-write and the `\n` it adds makes an empty line. The readers skip an empty line: it holds no record.
 */
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
