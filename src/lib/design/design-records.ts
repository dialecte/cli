/**
 * A lot folder's design records (DESIGN-GATE section 2): `design.jsonl`, append-only, and the copy of each recorded
 * content under `design/<sha256>.md`, so the text approved survives its source's move or deletion.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendLine } from '../events/write-event.ts'
import { replaceWhole } from '../store/publish.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { DESIGN_COPY_EXTENSION, DESIGN_LINE_SCHEMA } from './design.constants.ts'

import type { DesignLine, DesignSourceHash } from './design.types.ts'

/**
 * The lines of the folder's `design.jsonl`, in file order; a line that is no design line (torn, another schema or
 * kind, a field missing) is skipped. None without the file.
 *
 * @intent read what a lot recorded about its design
 * @internal
 */
export function readDesignLines(params: { lotFolder: string }): DesignLine[] {
	const file = join(params.lotFolder, STORE_FILES.design)
	if (!existsSync(file)) return []
	return readFileSync(file, 'utf8').split('\n').flatMap(designLineOf)
}

/**
 * Appends one line to the folder's `design.jsonl` in one write.
 *
 * @intent record a lot's design, its approval or its waiver
 * @internal
 */
export function appendDesignLine(params: { lotFolder: string; line: DesignLine }): void {
	appendLine({
		file: join(params.lotFolder, STORE_FILES.design),
		line: Buffer.from(`${JSON.stringify(params.line)}\n`, 'utf8'),
		limit: EVENT_LINE_LIMIT,
	})
}

/**
 * Writes the recorded content's copy, `design/<hash>.md`, whole.
 *
 * @intent keep the exact text a design approval covers
 * @internal
 */
export function writeDesignCopy(params: { lotFolder: string; hash: string; text: string }): void {
	const folder = join(params.lotFolder, STORE_FILES.designCopies)
	mkdirSync(folder, { recursive: true })
	replaceWhole({ path: join(folder, `${params.hash}${DESIGN_COPY_EXTENSION}`), text: params.text })
}

/**
 * Whether the lot folder holds the copy of the content `hash` names.
 *
 * @intent tell whether the text a design approval would cover is still kept
 * @internal
 */
export function hasDesignCopy(params: { lotFolder: string; hash: string }): boolean {
	return existsSync(
		join(params.lotFolder, STORE_FILES.designCopies, `${params.hash}${DESIGN_COPY_EXTENSION}`),
	)
}

/**
 * The sha256 hex of bytes.
 *
 * @intent key a design's approval by its content
 * @internal
 */
export function designHashOf(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/**
 * The sha256 hex of the file now; undefined when it is gone or cannot be read.
 *
 * @intent tell whether a recorded design changed since
 * @internal
 */
export function sourceHashOf(file: string): DesignSourceHash {
	try {
		return designHashOf(readFileSync(file))
	} catch {
		return undefined
	}
}

/** One `design.jsonl` line as a design line; none for anything else. */
function designLineOf(text: string): DesignLine[] {
	if (text.trim() === '') return []
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		return []
	}
	if (typeof value !== 'object' || value === null) return []
	const line = value as Record<string, unknown>
	if (line.schema !== DESIGN_LINE_SCHEMA || typeof line.at !== 'string') return []
	if (line.kind === 'recorded')
		return typeof line.file === 'string' && typeof line.hash === 'string'
			? [value as DesignLine]
			: []
	if (line.kind === 'approved')
		return typeof line.by === 'string' && typeof line.hash === 'string' && Array.isArray(line.need)
			? [value as DesignLine]
			: []
	if (line.kind === 'waived')
		return typeof line.by === 'string' && Array.isArray(line.need) ? [value as DesignLine] : []
	return []
}
