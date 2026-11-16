/** `fetchCorpora` on a server that never answers: the download ends at its timeout and refuses only its source. */
import { join } from 'node:path'

import { reviewedSource, serveStalled, sha256Of } from '../../../test/corpus-fixtures.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { fetchCorpora } from './fetch-corpora.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

/** Long enough for any timeout under test, short of the case's own. */
const GIVE_UP_AFTER_MILLISECONDS = 3_000

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
})
