import { readFileSync, writeFileSync } from 'node:fs'

import { createScratchRepository, git } from '../../../test/scratch-repository.ts'
import { QUERY_NAMES_CACHE_FILE } from './query-names.constants.ts'
import { readQueryNames } from './query-names.ts'

import { describe, expect, it, vi } from 'vitest'

import type { ApiRootMethod } from '../api/api-json.types.ts'
import type { QueryNamesCache } from './query-names.types.ts'

const served = vi.hoisted(() => ({ version: '1.0.0' }))

vi.mock('../read-cli-version.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('../read-cli-version.ts')>()
	return { ...original, readCliVersion: () => served.version }
})

const API_PATH = 'skills/dialecte-things/references/api.json'

function readerIndex(names: string[]): string {
	const methods: ApiRootMethod[] = names.map((name) => ({
		root: 'q',
		path: `doc.query.${name}`,
		otherRoutes: [],
		signature: '() => void',
		summary: undefined,
		intents: [],
		declaredAt: undefined,
		example: undefined,
	}))
	return JSON.stringify({ package: '@dialecte/things', methods })
}

function cachePathOf(root: string): string {
	return `${root}/${git({ root, args: ['rev-parse', '--git-path', QUERY_NAMES_CACHE_FILE] }).trim()}`
}

function planted(params: { root: string }): void {
	const path = cachePathOf(params.root)
	const cache = JSON.parse(readFileSync(path, 'utf8')) as QueryNamesCache
	writeFileSync(path, JSON.stringify({ ...cache, names: ['fromCache'] }))
}

describe('readQueryNames cache and the cli version', () => {
	it('the same index files: the same cli version keeps the cache, another one re-reads the names and rewrites it', () => {
		served.version = '1.0.0'
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord']) })
		readQueryNames({ root })
		planted({ root })
		expect([...readQueryNames({ root })]).toEqual(['fromCache'])
		served.version = '2.0.0'

		expect([...readQueryNames({ root })]).toEqual(['getRecord'])
		const cache = JSON.parse(readFileSync(cachePathOf(root), 'utf8')) as QueryNamesCache
		expect(cache.names).toEqual(['getRecord'])
	})
})
