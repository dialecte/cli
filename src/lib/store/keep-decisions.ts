/**
 * A lot kept on purpose (KEEP): `keep.jsonl` in the lot folder, append-only, its last line the decision; every read
 * that cannot be trusted reads kept (fail closed).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { appendLine } from '../events/write-event.ts'
import { KEEP_KEYS, KEEP_LINE_LIMIT, KEEP_OPS, KEEP_SCHEMA } from './keep-decisions.constants.ts'
import { STORE_FILES } from './store.constants.ts'

import type { KeepDecision, KeepJson, KeepLine, KeepOp } from './keep-decisions.types.ts'

/**
 * The keep decision of the lot folder: kept by its last line, or kept because a line does not read or the file cannot
 * be read (any error but "no file"); undefined only when the lot is not kept.
 */
export function readKeepDecision(params: { lotFolder: string }): KeepDecision | undefined {
	const read = readKeepText(params)
	if (read === undefined) return undefined
	if ('code' in read) return { unreadableFile: read.code }
	const lines = read.text.split('\n')
	// the text after the last line feed is a line without its end: never trusted, even when it parses
	const torn = lines.pop()
	const parsed = lines.filter((text) => text !== '').map((text) => parseKeepLine({ text }))
	const unreadable =
		(torn === undefined || torn === '' ? 0 : 1) + parsed.filter((line) => line === undefined).length
	if (unreadable > 0) return { unreadable }
	const last = parsed.at(-1)
	return last === undefined || last.op === 'unkeep' ? undefined : { kept: last }
}

/** Appends one line to the lot folder's `keep.jsonl` in one write; refused over the line limit. */
export function appendKeepLine(params: { lotFolder: string; line: KeepLine }): void {
	appendLine({
		file: keepFileOf(params),
		line: Buffer.from(`${JSON.stringify(params.line)}\n`, 'utf8'),
		limit: KEEP_LINE_LIMIT,
	})
}

/** The keep as every JSON output carries it: `{ reason, by, at }`, the unreadable count or code, or `null`. */
export function keepJsonOf(params: { keep: KeepDecision | undefined }): KeepJson {
	const { keep } = params
	if (keep === undefined) return null
	if ('kept' in keep) return { reason: keep.kept.reason, by: keep.kept.by, at: keep.kept.at }
	return keep
}

/** The lot folder's `keep.jsonl`. */
export function keepFileOf(params: { lotFolder: string }): string {
	return join(params.lotFolder, STORE_FILES.keep)
}

/** The text of the lot folder's `keep.jsonl`, or the code of the error its read met; undefined when there is no file. */
function readKeepText(params: {
	lotFolder: string
}): { text: string } | { code: string } | undefined {
	try {
		return { text: readFileSync(keepFileOf(params), 'utf8') }
	} catch (error) {
		const code = errorCodeOf(error)
		// only "no file" reads not kept: every other error fails closed
		return code === 'ENOENT' ? undefined : { code }
	}
}

/** The code of a read error (`EACCES`, `EISDIR`...); `unknown` when it carries none. */
function errorCodeOf(error: unknown): string {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		const { code } = error as { code: unknown }
		if (typeof code === 'string') return code
	}
	return 'unknown'
}

/** The keep line a text holds (`keep-decision.schema.json`); undefined when it does not read as one. */
function parseKeepLine(params: { text: string }): KeepLine | undefined {
	let value: unknown
	try {
		value = JSON.parse(params.text)
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	const keys = Object.keys(value)
	if (!keys.every((key) => (KEEP_KEYS as readonly string[]).includes(key))) return undefined
	const { schema, at, op, by, reason } = value as Record<string, unknown>
	if (schema !== KEEP_SCHEMA || typeof at !== 'string' || !isKeepOp(op)) return undefined
	if (!isSignedText(by) || !isSignedText(reason)) return undefined
	return { schema: KEEP_SCHEMA, at, op, by, reason }
}

/** Whether a value is a text holding a non-blank character (the schema's `pattern: "\\S"`). */
function isSignedText(value: unknown): value is string {
	return typeof value === 'string' && value.trim() !== ''
}

/** Whether a value is an op of a keep line. */
function isKeepOp(value: unknown): value is KeepOp {
	return typeof value === 'string' && (KEEP_OPS as readonly string[]).includes(value)
}
