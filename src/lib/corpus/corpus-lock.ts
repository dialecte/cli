/** `manifest.lock.json`: what the cache holds, each source with the manifest entry it was built from and its files' sha256. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { LOCK_FILE } from './corpus.constants.ts'

import type { CorpusLockEntry, CorpusLockRead, ManifestSource } from './corpus.types.ts'

export function sha256Of(bytes: Uint8Array | string): string {
	return createHash('sha256').update(bytes).digest('hex')
}

/** The sha256 of a manifest entry, its keys sorted: another entry, the same fields reordered aside, reads stale. */
export function manifestEntryHashOf(source: ManifestSource): string {
	return sha256Of(JSON.stringify(sortedValue(source)))
}

function sortedValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortedValue)
	if (value !== null && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, inner]) => inner !== undefined)
				.sort(([left], [right]) => (left < right ? -1 : 1))
				.map(([key, inner]) => [key, sortedValue(inner)]),
		)
	return value
}

/**
 * The lock of the cache: nothing when nothing was fetched or the file does not read as JSON; an entry another writer
 * left in another shape (create's `{ files, bytes, verdict }`) is kept in `raw` only, never trusted.
 */
export function readCorpusLock(params: { cache: string }): CorpusLockRead {
	const file = join(params.cache, LOCK_FILE)
	const parsed = existsSync(file) ? parsedOrUndefined(readFileSync(file, 'utf8')) : undefined
	const raw = isRecord(parsed) ? parsed : {}
	const entries = Object.fromEntries(
		Object.entries(raw).filter((entry): entry is [string, CorpusLockEntry] =>
			isLockEntry(entry[1]),
		),
	)
	return { entries, raw }
}

function parsedOrUndefined(text: string): unknown {
	try {
		return JSON.parse(text)
	} catch {
		return undefined
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isLockEntry(value: unknown): value is CorpusLockEntry {
	return (
		isRecord(value) &&
		typeof value.files === 'number' &&
		typeof value.bytes === 'number' &&
		typeof value.verdict === 'string' &&
		typeof value.manifest === 'string' &&
		isRecord(value.sha256) &&
		Object.values(value.sha256).every((hash) => typeof hash === 'string')
	)
}

/** Writes the lock, its sources sorted by id. */
export function writeCorpusLock(params: {
	cache: string
	lock: Readonly<Record<string, unknown>>
}): void {
	const sorted = Object.fromEntries(
		Object.entries(params.lock).sort(([left], [right]) => (left < right ? -1 : 1)),
	)
	writeFileSync(join(params.cache, LOCK_FILE), `${JSON.stringify(sorted, null, '\t')}\n`)
}
