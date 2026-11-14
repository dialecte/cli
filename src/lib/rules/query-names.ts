/** The query read names `query-in-loop` looks for, read from the API indexes and cached in the git folder. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

import { apiIndexFilesOf, firstPerPackage, parseApiJson } from '../api/read-api-indexes.ts'
import { errorReasonOf } from '../error-reason.ts'
import { tryReadGit } from '../git.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { PERF_PATH_SEGMENT } from './check-quality-rules.constants.ts'
import {
	QUERY_IN_LOOP_NOT_RUN_LINE,
	QUERY_NAMES_CACHE_FILE,
	QUERY_NAMES_MANIFEST,
} from './query-names.constants.ts'

import type { ApiJson } from '../api/api-json.types.ts'
import type { QueryNamesCache, QueryNamesRead } from './query-names.types.ts'

/** The names of the query reads of the API indexes: the `q` entries, without `perf` ones and without names a `tx` entry also has. */
export function queryNamesOf(params: { indexes: readonly ApiJson[] }): ReadonlySet<string> {
	const methods = params.indexes.flatMap((index) => index.methods)
	const writes = new Set(
		methods.filter((method) => method.root === 'tx').map((method) => lastSegmentOf(method.path)),
	)
	return new Set(
		methods
			.filter(
				(method) =>
					method.root === 'q' && !method.path.split('.').slice(0, -1).includes(PERF_PATH_SEGMENT),
			)
			.map((method) => lastSegmentOf(method.path))
			.filter((name) => !writes.has(name)),
	)
}

/** The query read names of the API indexes reachable from `root`: none when one cannot be read (never a throw). */
export function readQueryNames(params: { root: string }): ReadonlySet<string> {
	return readQueryNamesWithNote(params).names
}

/**
 * The query read names of the API indexes reachable from `root`, cached in the git folder keyed by the index files'
 * paths and content and the cli's version; when the indexes cannot be listed or one is not an index, no name and the line saying
 * `query-in-loop` did not run, naming the file and why.
 */
export function readQueryNamesWithNote(params: { root: string }): QueryNamesRead {
	const { root } = params
	let files: string[]
	try {
		files = apiIndexFilesOf({ cwd: root })
	} catch (error) {
		// a dependency's skills that cannot be listed (a skill shipped twice, a broken manifest)
		return notRun({ file: QUERY_NAMES_MANIFEST, why: errorReasonOf(error) })
	}
	const cachePath = cachePathOf(root)
	const key = cachePath === undefined ? undefined : cacheKeyOf({ root, files })
	const cached = cachePath === undefined ? undefined : readCache(cachePath)
	if (cached !== undefined && cached.key === key) return { names: new Set(cached.names) }
	const indexes: ApiJson[] = []
	for (const file of files) {
		const read = parseApiJson(file)
		if ('problem' in read) return notRun({ file: relative(root, file), why: read.problem })
		indexes.push(read.index)
	}
	const names = queryNamesOf({ indexes: firstPerPackage(indexes) })
	if (cachePath !== undefined && key !== undefined)
		writeCache({ path: cachePath, cache: { schema: 1, key, names: [...names].sort() } })
	return { names }
}

function notRun(params: { file: string; why: string }): QueryNamesRead {
	return {
		names: new Set(),
		note: QUERY_IN_LOOP_NOT_RUN_LINE.replace('{file}', params.file).replace('{why}', params.why),
	}
}

function writeCache(params: { path: string; cache: QueryNamesCache }): void {
	try {
		writeFileSync(params.path, `${JSON.stringify(params.cache)}\n`)
	} catch {
		// a cache that cannot be written only costs the next run a read: the names stand
	}
}

function lastSegmentOf(path: string): string {
	return path.slice(path.lastIndexOf('.') + 1)
}

/** The cache file in the git folder of `root`; undefined outside a git repository. */
function cachePathOf(root: string): string | undefined {
	const folder = tryReadGit({ root, args: ['rev-parse', '--git-dir'] })?.trim()
	if (!folder) return undefined
	return join(isAbsolute(folder) ? folder : join(root, folder), QUERY_NAMES_CACHE_FILE)
}

/**
 * The sha256 of the cli's version, then of each file's path (from `root`) and bytes, in sorted path order (each part
 * its own digest, so no two lists collide): a cli upgrade that reads the names otherwise re-reads them.
 */
function cacheKeyOf(params: { root: string; files: readonly string[] }): string {
	const hash = createHash('sha256')
	hash.update(createHash('sha256').update(readCliVersion()).digest())
	for (const path of [...params.files].sort()) {
		hash.update(createHash('sha256').update(relative(params.root, path)).digest())
		hash.update(createHash('sha256').update(readFileSync(path)).digest())
	}
	return hash.digest('hex')
}

/** The cache when it is one of this schema; undefined when missing, unreadable or not one. */
function readCache(path: string): QueryNamesCache | undefined {
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return undefined
	}
	return isQueryNamesCache(value) ? value : undefined
}

function isQueryNamesCache(value: unknown): value is QueryNamesCache {
	return (
		typeof value === 'object' &&
		value !== null &&
		'schema' in value &&
		value.schema === 1 &&
		'key' in value &&
		typeof value.key === 'string' &&
		'names' in value &&
		Array.isArray(value.names) &&
		value.names.every((name) => typeof name === 'string')
	)
}
