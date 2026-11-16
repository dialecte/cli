/** `manifest.lock.json`: what the cache holds, each source with the manifest entry it was built from and its files' sha256. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { LOCK_FILE } from './corpus.constants.ts'

import type { CorpusLock, ManifestSource } from './corpus.types.ts'

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

/** The lock of the cache, `{}` when nothing was fetched. */
export function readCorpusLock(params: { cache: string }): CorpusLock {
	const file = join(params.cache, LOCK_FILE)
	if (!existsSync(file)) return {}
	const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
	return parsed !== null && typeof parsed === 'object' ? (parsed as CorpusLock) : {}
}

/** Writes the lock, its sources sorted by id. */
export function writeCorpusLock(params: { cache: string; lock: CorpusLock }): void {
	const sorted = Object.fromEntries(
		Object.entries(params.lock).sort(([left], [right]) => (left < right ? -1 : 1)),
	)
	writeFileSync(join(params.cache, LOCK_FILE), `${JSON.stringify(sorted, null, '\t')}\n`)
}
