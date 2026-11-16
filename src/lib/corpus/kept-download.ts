/**
 * The bytes of a pinned URL: the copy kept in `_downloads/` when it still has the pin, else downloaded. Only bytes that
 * match their pin are kept; nothing is trusted for being cached.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { sha256Of } from './corpus-lock.ts'
import { CORPUS_MESSAGES, CORPUS_USER_AGENT, DOWNLOADS_FOLDER } from './corpus.constants.ts'

import type { KeptDownload } from './corpus.types.ts'

/** The kept file of a URL: named by the sha256 of the URL, as create named it. */
export function keptFileOf(params: { cache: string; url: string }): string {
	return join(params.cache, DOWNLOADS_FOLDER, sha256Of(params.url))
}

export async function keptDownloadOf(params: {
	id: string
	cache: string
	url: string
	sha256: string
	timeoutMilliseconds: number
}): Promise<KeptDownload> {
	const kept = keptFileOf(params)
	if (existsSync(kept)) {
		const bytes = new Uint8Array(readFileSync(kept))
		if (sha256Of(bytes) === params.sha256) return { kind: 'bytes', bytes }
	}
	const downloaded = await downloadOf(params)
	if (typeof downloaded === 'string')
		return {
			kind: 'refused',
			reason: fillMessage({
				template: CORPUS_MESSAGES.downloadFailed,
				values: { id: params.id, url: params.url, reason: downloaded },
			}),
		}
	const actual = sha256Of(downloaded)
	if (actual !== params.sha256)
		return {
			kind: 'refused',
			reason: fillMessage({
				template: CORPUS_MESSAGES.shaMismatch,
				values: { id: params.id, url: params.url, actual, expected: params.sha256 },
			}),
		}
	mkdirSync(join(params.cache, DOWNLOADS_FOLDER), { recursive: true })
	writeFileSync(kept, downloaded)
	return { kind: 'bytes', bytes: downloaded }
}

/** The response's bytes, or why there are none. */
async function downloadOf(params: {
	url: string
	timeoutMilliseconds: number
}): Promise<Uint8Array | string> {
	try {
		const response = await fetch(params.url, {
			headers: { 'user-agent': CORPUS_USER_AGENT },
			signal: AbortSignal.timeout(params.timeoutMilliseconds),
		})
		if (!response.ok) return `HTTP ${response.status}`
		const body = await response.arrayBuffer()
		return new Uint8Array(body)
	} catch (error) {
		return error instanceof Error
			? error.cause instanceof Error
				? error.cause.message
				: error.message
			: String(error)
	}
}
