import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../../test/scratch-repository.ts'
import { apiIndexFilesOf } from '../api/read-api-indexes.ts'
import { QUERY_NAMES_CACHE_FILE } from './query-names.constants.ts'
import { queryNamesOf, readQueryNames } from './query-names.ts'

import { describe, expect, it } from 'vitest'

import type { ApiJson, ApiRootMethod } from '../api/api-json.types.ts'
import type { QueryNamesCache } from './query-names.types.ts'

const API_PATH = 'skills/dialecte-things/references/api.json'

function methodOf(params: { root: ApiRootMethod['root']; path: string }): ApiRootMethod {
	return {
		root: params.root,
		path: params.path,
		otherRoutes: [],
		signature: '() => void',
		summary: undefined,
		intents: [],
		declaredAt: undefined,
		example: undefined,
	}
}

function indexJson(params: { packageName: string; methods: ApiRootMethod[] }): string {
	return JSON.stringify({ package: params.packageName, methods: params.methods })
}

function readerIndex(names: string[]): string {
	return indexJson({
		packageName: '@dialecte/things',
		methods: names.map((name) => methodOf({ root: 'q', path: `doc.query.${name}` })),
	})
}

function cachePathOf(root: string): string {
	return join(root, git({ root, args: ['rev-parse', '--git-path', QUERY_NAMES_CACHE_FILE] }).trim())
}

function readCache(root: string): QueryNamesCache {
	return JSON.parse(readFileSync(cachePathOf(root), 'utf8')) as QueryNamesCache
}

/** Every file under `root`, relative, sorted. */
function listFilesOf(root: string): string[] {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
		.sort()
}

function sortedOf(names: ReadonlySet<string>): string[] {
	return [...names].sort()
}

describe('queryNamesOf', () => {
	it('q entries of two packages, perf and tx names and other roots → the read names only', () => {
		const first: ApiJson = {
			package: '@dialecte/first',
			methods: [
				methodOf({ root: 'q', path: 'doc.query.getRecord' }),
				methodOf({ root: 'q', path: 'doc.query.ns.findThings' }),
				methodOf({ root: 'q', path: 'doc.query.perf.count' }),
				methodOf({ root: 'q', path: 'doc.query.perf.log' }),
				methodOf({ root: 'q', path: 'doc.query.perf.flushEverything' }),
				methodOf({ root: 'q', path: 'doc.query.delete' }),
			],
		}
		const second: ApiJson = {
			package: '@dialecte/second',
			methods: [
				methodOf({ root: 'tx', path: 'doc.tx.delete' }),
				methodOf({ root: 'doc', path: 'doc.prepare' }),
			],
		}

		expect(sortedOf(queryNamesOf({ indexes: [first, second] }))).toEqual([
			'findThings',
			'getRecord',
		])
	})
})

describe('readQueryNames', () => {
	it('an index with q entries → their names, and a cache file in the git folder', () => {
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord', 'getRecords']) })

		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord', 'getRecords'])
		expect(existsSync(cachePathOf(root))).toBe(true)
		const cache = readCache(root)
		expect(cache.schema).toBe(1)
		expect(cache.key).not.toBe('')
		expect(cache.names.slice().sort()).toEqual(['getRecord', 'getRecords'])
	})

	it('the cache present and the index unchanged → the cached names come back', () => {
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord']) })
		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord'])
		const cache = readCache(root)
		writeFileSync(cachePathOf(root), JSON.stringify({ ...cache, names: ['fromCache'] }))

		expect(sortedOf(readQueryNames({ root }))).toEqual(['fromCache'])
	})

	it('the index file changed → the new names, and the cache rewritten', () => {
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord']) })
		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord'])
		const before = readCache(root)
		writeFileSync(join(root, API_PATH), readerIndex(['getDefinition']))

		expect(sortedOf(readQueryNames({ root }))).toEqual(['getDefinition'])
		const after = readCache(root)
		expect(after.key).not.toBe(before.key)
		expect(after.names).toEqual(['getDefinition'])
	})

	it('the index changed by a same-length edit with its old modification time → the new names, another key', () => {
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord']) })
		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord'])
		const before = readCache(root)
		const { atime, mtime, size } = statSync(join(root, API_PATH))
		writeFileSync(join(root, API_PATH), readerIndex(['getRecorx']))
		expect(statSync(join(root, API_PATH)).size).toBe(size)
		utimesSync(join(root, API_PATH), atime, mtime)

		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecorx'])
		expect(readCache(root).key).not.toBe(before.key)
	})

	it('outside a git repository → the names, no throw, no cache file written', () => {
		const root = temporaryFolder('dialecte-no-git-')
		writeFiles({ root, files: { [API_PATH]: readerIndex(['getRecord']) } })

		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord'])
		expect(listFilesOf(root)).toEqual([API_PATH])
	})

	it('a cache that is not JSON → the names, and the cache rebuilt', () => {
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord']) })
		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord'])
		writeFileSync(cachePathOf(root), 'not json {')

		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord'])
		expect(readCache(root).names).toEqual(['getRecord'])
	})

	it('an own index that is not JSON → no throw, no names', () => {
		const root = createScratchRepository({ 'skills/broken/references/api.json': '{not json' })

		expect(sortedOf(readQueryNames({ root }))).toEqual([])
	})

	it('a cache path that cannot be written → the names are returned', () => {
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord', 'getRecords']) })
		mkdirSync(cachePathOf(root))

		expect(sortedOf(readQueryNames({ root }))).toEqual(['getRecord', 'getRecords'])
	})

	it('two index files whose bytes are swapped between their paths → another cache key', () => {
		const firstPath = 'skills/first/references/api.json'
		const secondPath = 'skills/second/references/api.json'
		const firstIndex = indexJson({
			packageName: '@dialecte/first',
			methods: [methodOf({ root: 'q', path: 'doc.query.getRecord' })],
		})
		const secondIndex = indexJson({
			packageName: '@dialecte/second',
			methods: [methodOf({ root: 'q', path: 'doc.query.getDefinition' })],
		})
		const root = createScratchRepository({ [firstPath]: firstIndex, [secondPath]: secondIndex })
		expect(sortedOf(readQueryNames({ root }))).toEqual(['getDefinition', 'getRecord'])
		const before = readCache(root)
		writeFileSync(join(root, firstPath), secondIndex)
		writeFileSync(join(root, secondPath), firstIndex)

		expect(sortedOf(readQueryNames({ root }))).toEqual(['getDefinition', 'getRecord'])
		expect(readCache(root).key).not.toBe(before.key)
	})
})

describe('apiIndexFilesOf', () => {
	it('a repository with one skill index → its absolute path', () => {
		const root = createScratchRepository({ [API_PATH]: readerIndex(['getRecord']) })

		expect(apiIndexFilesOf({ cwd: root })).toEqual([join(root, API_PATH)])
	})

	it('a folder without skills and without node_modules → no file', () => {
		expect(apiIndexFilesOf({ cwd: temporaryFolder('dialecte-no-skills-') })).toEqual([])
	})
})
