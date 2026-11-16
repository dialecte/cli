/** A source's downloads with their pins, and why a source may not be fetched (no licence review, a missing pin). */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	BAD_SOURCE_ID,
	CORPUS_MESSAGES,
	REQUIRED_SOURCE_FIELDS,
	SOURCE_ID_PATTERN,
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
	if (!SOURCE_ID_PATTERN.test(source.id) || source.id.includes('..'))
		return fillMessage({ template: BAD_SOURCE_ID, values: { id: JSON.stringify(source.id) } })
	const missing = REQUIRED_SOURCE_FIELDS.filter((field) => !source[field])
	if (missing.length > 0)
		return fillMessage({
			template: CORPUS_MESSAGES.missingField,
			values: { id: source.id, fields: missing.join(', ') },
		})
	const unpinned = pinnedDownloadsOf(source).find((download) => !download.sha256)
	if (unpinned !== undefined)
		return fillMessage({
			template: CORPUS_MESSAGES.missingPin,
			values: { id: source.id, url: unpinned.url },
		})
	return undefined
}
