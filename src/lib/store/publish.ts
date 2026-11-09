/**
 * The two ways the store writes a file: published once under a name nobody holds (a hard link, refused when the name
 * exists), or replaced whole (a rename). Both write a temporary file `<final name>.tmp-<pid>-<n>` first, so a reader
 * of the final name never sees half a text, and both remove the temporary files a dead writer left of that same
 * final name (files only, never another name's).
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
import { basename, dirname, join } from 'node:path'

import { isProcessAlive } from '../process-alive.ts'
import {
	READ_ONLY_MODE,
	STORE_REFUSAL,
	TEMPORARY_FILE_SUFFIX_PATTERN,
	TEMPORARY_INFIX,
	WRITABLE_MODE,
} from './store.constants.ts'

import type { LeftoverKind, LinkFunction, RecordContent, TemporaryFileSeam } from './store.types.ts'

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
	/** The hard link that publishes the temporary file. Default: `linkSync`. */
	link?: LinkFunction
}): boolean {
	const temporary = writeTemporary({
		path: params.path,
		text: params.text,
		mode: params.readOnly ? READ_ONLY_MODE : WRITABLE_MODE,
	})
	params.afterTemporaryWritten?.(temporary)
	try {
		const link = params.link ?? linkSync
		link(temporary, params.path)
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
 * Removes the entries of `folder` whose name `pidOf` reads a pid from and whose pid no process holds: what a writer
 * killed before its publish left. An entry of a live pid is left alone. `kind`: `files` removes matching files
 * only, a folder of a matching name left alone; `folders` removes matching folders with what they hold, a file of
 * a matching name left alone. Never anything else below `folder`.
 */
export function removeDeadLeftovers(params: {
	folder: string
	/** The pid a leftover's name holds; undefined for a name that is no leftover. */
	pidOf: (name: string) => string | undefined
	kind: LeftoverKind
}): void {
	if (!existsSync(params.folder)) return
	const folders = params.kind === 'folders'
	for (const entry of readdirSync(params.folder, { withFileTypes: true })) {
		const pid = params.pidOf(entry.name)
		if (pid === undefined || isProcessAlive(Number(pid))) continue
		if (entry.isDirectory() !== folders) continue
		rmSync(join(params.folder, entry.name), { recursive: folders, force: true })
	}
}

/**
 * The pid of a writer's temporary file of `finalName` (`<final name>.tmp-<pid>-<n>`, the name anchored at both
 * ends); undefined for any other name.
 */
export function temporaryPidOf(params: { name: string; finalName: string }): string | undefined {
	if (!params.name.startsWith(params.finalName)) return undefined
	return TEMPORARY_FILE_SUFFIX_PATTERN.exec(params.name.slice(params.finalName.length))?.[1]
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

/**
 * Writes `text` to a new temporary of `path`, flushed, with `mode`, after removing the temporary files dead writers
 * left of that same path (files only).
 */
function writeTemporary(params: { path: string; text: RecordContent; mode: number }): string {
	const finalName = basename(params.path)
	removeDeadLeftovers({
		folder: dirname(params.path),
		pidOf: (name) => temporaryPidOf({ name, finalName }),
		kind: 'files',
	})
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
