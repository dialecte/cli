/** A source's downloads with their pins, and why a source may not be fetched (no licence review, a missing pin). */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	BAD_PIN,
	BAD_SOURCE_ID,
	BAD_VERDICT,
	CORPUS_MESSAGES,
	REQUIRED_SOURCE_FIELDS,
	RESERVED_CACHE_NAMES,
	RESERVED_CACHE_SUFFIXES,
	SHA256_PATTERN,
	SOURCE_ID_PATTERN,
	VERDICTS,
} from './corpus.constants.ts'

import type { ManifestSource } from './corpus.types.ts'

/** Every URL the source downloads, with its pinned sha256 (undefined when the manifest has none). */
export function pinnedDownloadsOf(
	source: ManifestSource,
): { url: string; sha256: string | undefined }[] {
	const fetch = source.fetch
	if (fetch.kind === 'archive') return [{ url: fetch.url, sha256: fetch.sha256 }]
	if (fetch.kind === 'files')
		return Object.values(fetch.files).map((file) => ({ url: file.url, sha256: file.sha256 }))
	return Object.entries(fetch.files).map(([url, sha256]) => ({ url, sha256 }))
}

/** Why the source is never fetched: its licence fields missing, or a download without its pin; undefined when it may be. */
export function sourceProblemOf(source: ManifestSource): string | undefined {
	if (!isSourceId(source.id))
		return fillMessage({ template: BAD_SOURCE_ID, values: { id: JSON.stringify(source.id) } })
	const missing = REQUIRED_SOURCE_FIELDS.filter((field) => !source[field])
	if (missing.length > 0)
		return fillMessage({
			template: CORPUS_MESSAGES.missingField,
			values: { id: source.id, fields: missing.join(', ') },
		})
	if (!(VERDICTS as readonly string[]).includes(source.verdict ?? ''))
		return fillMessage({
			template: BAD_VERDICT,
			values: { id: source.id, verdict: JSON.stringify(source.verdict) },
		})
	const unpinned = pinnedDownloadsOf(source).find((download) => !download.sha256)
	if (unpinned !== undefined)
		return fillMessage({
			template: CORPUS_MESSAGES.missingPin,
			values: { id: source.id, url: unpinned.url },
		})
	const malformed = pinnedDownloadsOf(source).find(
		(download) => !SHA256_PATTERN.test(download.sha256 ?? ''),
	)
	if (malformed !== undefined)
		return fillMessage({
			template: BAD_PIN,
			values: { id: source.id, url: malformed.url, pin: JSON.stringify(malformed.sha256) },
		})
	return undefined
}

/** One folder name of the cache that names none of the cache's own entries. */
function isSourceId(id: string): boolean {
	return (
		SOURCE_ID_PATTERN.test(id) &&
		!id.includes('..') &&
		!(RESERVED_CACHE_NAMES as readonly string[]).includes(id) &&
		!RESERVED_CACHE_SUFFIXES.some((suffix) => id.endsWith(suffix))
	)
}
