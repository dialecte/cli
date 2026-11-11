/**
 * The readers of the hand-over registry (`<git-common-dir>/dialecte-handover/`), git-free: file reads only, so the
 * store's read verbs reach no child process through them. The writers stay in `handover-store.ts`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

import { isFolder, realPathOf } from '../file-system.ts'
import { HANDOVER_STORE_FOLDER, STORE_ENTRY_EXTENSION } from './handover.constants.ts'

import type { HandoverStoreEntry, StoreEntry } from './handover.types.ts'

/** Every entry of the store, by name; an entry that does not parse is left out. */
export function readStoreEntries(store: string): StoreEntry[] {
	if (!isFolder(store)) return []
	return readdirSync(store)
		.filter((file) => file.endsWith(STORE_ENTRY_EXTENSION))
		.sort()
		.flatMap(function entryOf(file): StoreEntry[] {
			const entry = readStoreEntry({ store, name: file.slice(0, -STORE_ENTRY_EXTENSION.length) })
			return entry ? [entry] : []
		})
}

/** The entry `name` of `store`, or undefined when there is none or it does not parse. */
export function readStoreEntry(params: { store: string; name: string }): StoreEntry | undefined {
	const path = entryPathOf(params)
	if (!existsSync(path)) return undefined
	try {
		const entry = JSON.parse(readFileSync(path, 'utf8')) as Partial<HandoverStoreEntry>
		if (typeof entry.folder !== 'string' || typeof entry.branch !== 'string') return undefined
		return {
			name: params.name,
			folder: entry.folder,
			branch: entry.branch,
			worktree: String(entry.worktree ?? ''),
			...(typeof entry.index === 'string' && { index: entry.index }),
			written: String(entry.written ?? ''),
			state: entry.state ?? 'pending',
			...(typeof entry.closed === 'string' && { closed: entry.closed }),
		}
	} catch {
		return undefined
	}
}

/**
 * The hand-over registry of the repository whose git common folder is `commonFolder`: the one place its path is
 * written (the writers, the lot store and its readers all ask here).
 */
export function registryOfCommonFolder(commonFolder: string): string {
	return join(commonFolder, HANDOVER_STORE_FOLDER)
}

/** The entry registering `folder` (compared by real path), or undefined when it has none. */
export function registeredEntryOf(params: {
	store: string
	folder: string
}): StoreEntry | undefined {
	return entryOfFolder({ entries: readStoreEntries(params.store), folder: params.folder })
}

/** The entry among `entries` (a registry read once) registering `folder`, compared by real path; undefined for none. */
export function entryOfFolder(params: {
	entries: readonly StoreEntry[]
	folder: string
}): StoreEntry | undefined {
	const folder = realPathOf(params.folder)
	return params.entries.find((entry) => realPathOf(entry.folder) === folder)
}

/**
 * An argument is a path, not a word: it holds a path separator, or is `.` or `..` (a dotted name such as
 * `0180-scl-release-0.6` is a word).
 */
export function isPathArgument(argument: string): boolean {
	return argument.includes('/') || argument.includes(sep) || argument === '.' || argument === '..'
}

/** The file of the entry `name` of `store`. */
export function entryPathOf(params: { store: string; name: string }): string {
	return join(params.store, `${params.name}${STORE_ENTRY_EXTENSION}`)
}
