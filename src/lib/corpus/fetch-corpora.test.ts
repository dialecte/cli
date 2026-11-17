/** `fetchCorpora` on a server that never answers: the download ends at its timeout and refuses only its source. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { GIVE_UP_AFTER_MILLISECONDS } from '../../../test/corpus-fixtures.constants.ts'
import {
	reviewedSource,
	serveDribbled,
	serveFiles,
	serveStalled,
	sha256Of,
} from '../../../test/corpus-fixtures.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { fetchCorpora } from './fetch-corpora.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

/** What a promise settles to, or `gave up` once `milliseconds` passed. */
function settledWithin<T>(params: {
	promise: Promise<T>
	milliseconds: number
}): Promise<T | 'gave up'> {
	return Promise.race([
		params.promise,
		new Promise<'gave up'>((resolve) =>
			setTimeout(() => resolve('gave up'), params.milliseconds).unref(),
		),
	])
}

describe('fetchCorpora', () => {
	it('refuses a source whose download stalls past the timeout', async () => {
		const server = await serveStalled()
		onTestFinished(() => server.close())
		const cache = join(temporaryFolder('dialecte-corpora-'), 'cache')
		const url = server.urlOf('/alpha/a.xsd')
		const source = reviewedSource({
			id: 'alpha',
			fetch: { kind: 'files', files: { 'a.xsd': { url, sha256: sha256Of(Buffer.from('a')) } } },
		})

		const fetched = fetchCorpora({
			manifest: { sources: [source] },
			overrides: temporaryFolder('dialecte-corpus-overrides-'),
			cache,
			ids: [],
			timeoutMilliseconds: 200,
		})

		await expect(
			settledWithin({ promise: fetched, milliseconds: GIVE_UP_AFTER_MILLISECONDS }),
		).resolves.toEqual([
			{
				id: 'alpha',
				kind: 'refused',
				reason: expect.stringContaining(`alpha: ${url} could not be downloaded`),
			},
		])
	})

	it('fetches a download that keeps sending, though it takes longer in all than the timeout', async () => {
		const bytes = Buffer.from('x'.repeat(4_000))
		const server = await serveDribbled({ bytes, chunks: 8, gapMilliseconds: 100 })
		onTestFinished(() => server.close())
		const cache = join(temporaryFolder('dialecte-corpora-'), 'cache')
		const source = reviewedSource({
			id: 'slow',
			fetch: {
				kind: 'files',
				files: { 'big.xml': { url: server.urlOf('/slow/big.xml'), sha256: sha256Of(bytes) } },
			},
		})

		const fetched = fetchCorpora({
			manifest: { sources: [source] },
			overrides: temporaryFolder('dialecte-corpus-overrides-'),
			cache,
			ids: [],
			timeoutMilliseconds: 400,
		})

		await expect(
			settledWithin({ promise: fetched, milliseconds: GIVE_UP_AFTER_MILLISECONDS }),
		).resolves.toEqual([{ id: 'slow', kind: 'fetched', files: 1, bytes: bytes.length }])
	})

	it('refuses a source whose download stalls mid-body past the timeout', async () => {
		const bytes = Buffer.from('x'.repeat(4_000))
		const server = await serveDribbled({ bytes, chunks: 8, gapMilliseconds: 50, stopAfter: 2 })
		onTestFinished(() => server.close())
		const cache = join(temporaryFolder('dialecte-corpora-'), 'cache')
		const url = server.urlOf('/half/big.xml')
		const source = reviewedSource({
			id: 'half',
			fetch: { kind: 'files', files: { 'big.xml': { url, sha256: sha256Of(bytes) } } },
		})

		const fetched = fetchCorpora({
			manifest: { sources: [source] },
			overrides: temporaryFolder('dialecte-corpus-overrides-'),
			cache,
			ids: [],
			timeoutMilliseconds: 300,
		})

		await expect(
			settledWithin({ promise: fetched, milliseconds: GIVE_UP_AFTER_MILLISECONDS }),
		).resolves.toEqual([
			{
				id: 'half',
				kind: 'refused',
				reason: expect.stringContaining(`half: ${url} could not be downloaded`),
			},
		])
	})

	it('refuses a download larger than the download limit, keeping nothing of it', async () => {
		const bytes = Buffer.from('x'.repeat(4_000))
		const server = await serveFiles({ '/big/big.xml': bytes })
		onTestFinished(() => server.close())
		const cache = join(temporaryFolder('dialecte-corpora-'), 'cache')
		const url = server.urlOf('/big/big.xml')
		const source = reviewedSource({
			id: 'big',
			fetch: { kind: 'files', files: { 'big.xml': { url, sha256: sha256Of(bytes) } } },
		})

		const fetched = await fetchCorpora({
			manifest: { sources: [source] },
			overrides: temporaryFolder('dialecte-corpus-overrides-'),
			cache,
			ids: [],
			limits: { downloadBytes: 1_000, extractedBytes: 1_000_000 },
		})

		expect(fetched).toEqual([
			{ id: 'big', kind: 'refused', reason: expect.stringContaining('more than 1000 bytes') },
		])
		expect(existsSync(join(cache, 'big'))).toBe(false)
	})
})
