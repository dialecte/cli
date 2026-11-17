/**
 * The bytes of a pinned URL: the copy kept in `_downloads/` when it still has the pin, else downloaded. Only bytes that
 * match their pin are kept; nothing is trusted for being cached.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { sha256Of } from './corpus-lock.ts'
import {
	CORPUS_MESSAGES,
	CORPUS_USER_AGENT,
	DOWNLOAD_TOO_LARGE,
	DOWNLOADS_FOLDER,
	IDLE_DOWNLOAD,
} from './corpus.constants.ts'

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
	maxBytes: number
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
/**
 * The response's bytes, or why there are none. The timeout is an idle one, as create's per-read timeout was: it is
 * armed before the request and again on every chunk of the body, so a slow download that keeps sending finishes and
 * one that stops sending is aborted.
 */
async function downloadOf(params: {
	url: string
	timeoutMilliseconds: number
	maxBytes: number
}): Promise<Uint8Array | string> {
	const controller = new AbortController()
	let timer: NodeJS.Timeout | undefined
	function rearm(): void {
		clearTimeout(timer)
		timer = setTimeout(function abortIdle() {
			controller.abort(
				new Error(
					fillMessage({
						template: IDLE_DOWNLOAD,
						values: { milliseconds: String(params.timeoutMilliseconds) },
					}),
				),
			)
		}, params.timeoutMilliseconds)
	}
	try {
		rearm()
		const response = await fetch(params.url, {
			headers: { 'user-agent': CORPUS_USER_AGENT },
			// a pinned URL answers itself: a redirect is refused, never followed
			redirect: 'error',
			signal: controller.signal,
		})
		if (!response.ok) return `HTTP ${response.status}`
		if (response.body === null) return new Uint8Array()
		const chunks: Uint8Array[] = []
		let received = 0
		for await (const chunk of response.body) {
			rearm()
			received += chunk.length
			// leaving the loop cancels the rest of the body
			if (received > params.maxBytes) break
			chunks.push(chunk)
		}
		if (received > params.maxBytes)
			return fillMessage({
				template: DOWNLOAD_TOO_LARGE,
				values: { bytes: String(params.maxBytes) },
			})
		return new Uint8Array(Buffer.concat(chunks))
	} catch (error) {
		const reason = controller.signal.aborted ? controller.signal.reason : error
		return reason instanceof Error
			? reason.cause instanceof Error
				? reason.cause.message
				: reason.message
			: String(reason)
	} finally {
		clearTimeout(timer)
	}
}
