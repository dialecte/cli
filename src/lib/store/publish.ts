/**
 * The two ways the store writes a file: published once under a name nobody holds (a hard link, refused when the name
 * exists), or replaced whole (a rename). Both write a temporary file `<final name>.tmp-<pid>-<n>` first, so a reader
 * of the final name never sees half a text, and both remove the temporaries a dead writer left in the folder.
 */
import {
	chmodSync,
	closeSync,
	existsSync,
	fsyncSync,
	linkSync,
	openSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { isProcessAlive } from '../process-alive.ts'
import {
	READ_ONLY_MODE,
	STORE_REFUSAL,
	TEMPORARY_FILE_PATTERN,
	TEMPORARY_INFIX,
	WRITABLE_MODE,
} from './store.constants.ts'

import type { RecordContent, TemporaryFileSeam } from './store.types.ts'

/** The number of the next temporary file of this process. */
let temporaryCounter = 0

/**
 * Publishes `text` under `path` whole or not at all, never over an existing name: false when it exists
 * (its bytes kept). Read-only (0444) when `readOnly`, else 0644.
 */
export function publishOnce(params: {
	path: string
	/** A text, or bytes published as they are. */
	text: RecordContent
	readOnly: boolean
	/** Called once the temporary file is written and before it is published. */
	afterTemporaryWritten?: TemporaryFileSeam
}): boolean {
	const temporary = writeTemporary({
		path: params.path,
		text: params.text,
		mode: params.readOnly ? READ_ONLY_MODE : WRITABLE_MODE,
	})
	params.afterTemporaryWritten?.(temporary)
	try {
		linkSync(temporary, params.path)
	} catch (error) {
		if (isErrorCode({ error, code: 'EEXIST' })) {
			rmSync(temporary, { force: true })
			return false
		}
		throw vanishedOr({ error, temporary })
	}
	rmSync(temporary, { force: true })
	return true
}

/** Replaces the whole file at `path` with `text` (a temporary file renamed over it). */
export function replaceWhole(params: {
	path: string
	text: string
	/** Called once the temporary file is written and before it replaces the file. */
	afterTemporaryWritten?: TemporaryFileSeam
}): void {
	const temporary = writeTemporary({ path: params.path, text: params.text, mode: WRITABLE_MODE })
	params.afterTemporaryWritten?.(temporary)
	try {
		renameSync(temporary, params.path)
	} catch (error) {
		throw vanishedOr({ error, temporary })
	}
}

/**
 * Removes the entries of `folder` whose name matches `pattern` (its first group a pid) and whose pid no process
 * holds: what a writer killed before its publish left. An entry of a live pid is left alone.
 */
export function removeDeadLeftovers(params: { folder: string; pattern: RegExp }): void {
	if (!existsSync(params.folder)) return
	for (const name of readdirSync(params.folder)) {
		const pid = params.pattern.exec(name)?.[1]
		if (pid === undefined || isProcessAlive(Number(pid))) continue
		rmSync(join(params.folder, name), { recursive: true, force: true })
	}
}

/** The text of a record: its JSON, indented, with a final newline. */
export function recordText(record: unknown): string {
	return `${JSON.stringify(record, null, 2)}\n`
}

/** An error a command turns into exit 2: a store write refused (the next transition number past the ceiling). */
export function storeRefusal(message: string): Error {
	const refusal = new Error(message)
	refusal.name = STORE_REFUSAL
	return refusal
}

/** Writes `text` to a new temporary of `path`, flushed, with `mode`, after removing the dead writers' temporaries. */
function writeTemporary(params: { path: string; text: RecordContent; mode: number }): string {
	removeDeadLeftovers({ folder: dirname(params.path), pattern: TEMPORARY_FILE_PATTERN })
	temporaryCounter += 1
	const temporary = `${params.path}${TEMPORARY_INFIX}${process.pid}-${temporaryCounter}`
	const descriptor = openSync(temporary, 'w')
	try {
		writeFileSync(descriptor, params.text)
		fsyncSync(descriptor)
	} finally {
		closeSync(descriptor)
	}
	chmodSync(temporary, params.mode)
	return temporary
}

/**
 * The error to throw when publishing `temporary` failed: one naming it when it vanished under the writer (removed
 * as a leftover by another process), else `error` itself, the temporary removed.
 */
function vanishedOr(params: { error: unknown; temporary: string }): unknown {
	if (isErrorCode({ error: params.error, code: 'ENOENT' }) && !existsSync(params.temporary))
		return new Error(`the temporary file ${params.temporary} vanished before it was published`)
	rmSync(params.temporary, { force: true })
	return params.error
}

function isErrorCode(params: { error: unknown; code: string }): boolean {
	return (params.error as NodeJS.ErrnoException | undefined)?.code === params.code
}
