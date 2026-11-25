/**
 * The one send of a lot's change request text: the change request read again just before the host call, the text
 * rendered over that body (`renderChangeRequest`), the new body's lines added to the lot's append-only sent record
 * (`sent-body.jsonl`) before the host call, the text sent only when it reads otherwise.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendLine } from '../events/write-event.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { CHANGE_REQUEST_LINES, SENT_HASH_PATTERN } from './change-request.constants.ts'
import { linesOf } from './compose-change-request.ts'
import {
	aboveKeptLines,
	lineHashOf,
	renderChangeRequest,
	sentRowsOf,
	sentSetOf,
} from './sent-body.ts'

import type { ChangeRequest, HostAdapter } from '../host/host.types.ts'
import type { ChangeRequestText, PreparedChangeRequest, SentRow } from './change-request.types.ts'

/**
 * The lines the lot's record holds for `changeRequest` (undefined with none), or the refusal of a record unread: a line
 * that is no row of schema 1; a line that does not parse (a torn append, wherever the next append left it) is skipped, a subset at worst.
 *
 * @intent read what the cli sent to a change request, failing closed on a record it cannot read
 * @internal
 */
export function readSentBody(params: {
	lotFolder: string
	changeRequest: number
}): { sent: ReadonlySet<string> | undefined } | { refusal: string } {
	const file = join(params.lotFolder, STORE_FILES.sentBody)
	if (!existsSync(file)) return { sent: undefined }
	let text: string
	try {
		text = readFileSync(file, 'utf8')
	} catch (error) {
		return { refusal: unreadLine({ file, reason: (error as Error).message }) }
	}
	// a line that does not parse is a torn append (a crash mid-write, moved inside the file by the next append):
	// skipped, a subset at worst; a line that parses into no row of schema 1 is a record this cli cannot read
	const parsed = text
		.split('\n')
		.map((line, index) => ({ index, value: parsedLine(line) }))
		.filter((line): line is { index: number; value: { json: unknown } } => line.value !== undefined)
	const wrong = parsed.find((line) => !isSentRow(line.value.json))
	if (wrong !== undefined)
		return {
			refusal: unreadLine({ file, reason: `line ${wrong.index + 1} is no row of schema 1` }),
		}
	const rows = parsed.map((line) => line.value.json as SentRow)
	return { sent: sentSetOf({ rows, changeRequest: params.changeRequest }) }
}

/**
 * Adds the lines `body` holds above its kept heading to the lot's sent record of `changeRequest`; the refusal of a
 * record that cannot be written.
 *
 * @intent record what the cli sends to a change request before it sends it
 * @internal
 */
export function recordSent(params: {
	lotFolder: string
	template: string
	body: string
	changeRequest: number
	/** The set the record holds for it already: only lines it lacks are appended; undefined with no record yet. */
	sent?: ReadonlySet<string>
	now?: Date
}): { refusal: string } | undefined {
	const file = join(params.lotFolder, STORE_FILES.sentBody)
	const { sent } = params
	const lines = aboveKeptLines({ template: params.template, body: params.body }).filter(
		(line) => sent === undefined || !sent.has(lineHashOf(line)),
	)
	if (sent !== undefined && lines.length === 0) return undefined
	const rows = sentRowsOf({
		changeRequest: params.changeRequest,
		at: (params.now ?? new Date()).toISOString(),
		lines,
	})
	try {
		for (const row of rows)
			appendLine({ file, line: Buffer.from(`${JSON.stringify(row)}\n`), limit: EVENT_LINE_LIMIT })
		return undefined
	} catch (error) {
		return {
			refusal: fillMessage({
				template: CHANGE_REQUEST_LINES.sentUnwritten,
				values: { file, reason: (error as Error).message },
			}),
		}
	}
}

/**
 * The lot's text sent to `changeRequest` as the records render it over its body read again now; whether it was sent,
 * or the refusal of the read, the render, the record or the host.
 *
 * @intent never send a change request body that drops a line a person wrote
 * @internal
 */
export function sendWithRecord(params: {
	host: HostAdapter
	worktree: string
	lotFolder: string
	prepared: PreparedChangeRequest
	changeRequest: ChangeRequest
}): { text: ChangeRequestText; sent: boolean } | { refusal: string } {
	const { host, prepared } = params
	const { number } = params.changeRequest
	const now = host.readChangeRequest({ root: params.worktree, ref: String(number) })
	if (now !== undefined && 'refusal' in now) return now
	if (now === undefined)
		return {
			refusal: fillMessage({
				template: CHANGE_REQUEST_LINES.rereadGone,
				values: { ...prepared.nouns, number: String(number) },
			}),
		}
	if (now.state !== 'open')
		return {
			refusal: fillMessage({
				template: CHANGE_REQUEST_LINES.rereadClosed,
				values: { ...prepared.nouns, number: String(number), state: now.state },
			}),
		}
	const record = readSentBody({ lotFolder: params.lotFolder, changeRequest: number })
	if ('refusal' in record) return record
	const text = renderChangeRequest({ ...prepared, current: now.body, sent: record.sent })
	if ('refusal' in text) return text
	const unwritten = recordSent({
		lotFolder: params.lotFolder,
		template: prepared.template,
		body: text.body,
		changeRequest: number,
		sent: record.sent,
	})
	if (unwritten !== undefined) return unwritten
	if (now.title === text.title && linesOf(now.body).join('\n') === text.body)
		return { text, sent: false }
	const edited = host.editChangeRequest({ root: params.worktree, number, ...text })
	return edited ?? { text, sent: true }
}

/** The JSON a record line holds; undefined for a blank line or one that does not parse (a torn append). */
function parsedLine(line: string): { json: unknown } | undefined {
	if (line.trim() === '') return undefined
	try {
		return { json: JSON.parse(line) as unknown }
	} catch {
		return undefined
	}
}

/** Whether a parsed record line is a row of schema 1: its number, its time and its hashes. */
function isSentRow(value: unknown): value is SentRow {
	if (typeof value !== 'object' || value === null) return false
	const row = value as Record<string, unknown>
	const lines = row.lines
	return (
		row.schema === 1 &&
		Number.isSafeInteger(row.changeRequest) &&
		typeof row.at === 'string' &&
		Array.isArray(lines) &&
		lines.every((hash) => typeof hash === 'string' && SENT_HASH_PATTERN.test(hash))
	)
}

/** The refusal line of a record that cannot be read. */
function unreadLine(params: { file: string; reason: string }): string {
	return fillMessage({ template: CHANGE_REQUEST_LINES.sentUnread, values: params })
}
