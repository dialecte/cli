import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitFolderOf, isInWorkTree, readGit } from '../git.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { replaceWhole } from '../store/publish.ts'
import {
	SOURCE_INDEX_FILE,
	SOURCE_INDEX_SCHEMA,
	SOURCE_TEXT_MISSING,
} from './source-functions.constants.ts'

import type { ApiSourceFunction } from './api-json.types.ts'
import type {
	ParseSourceFile,
	ParsedSourceFile,
	SourceIndexCache,
} from './source-functions.types.ts'

/**
 * Parses the given source files of `root`, one result per file in the same order, reading and writing the cache
 * in the git folder so only the files whose bytes changed are parsed again; outside a git work tree every file is parsed.
 * The cache is keyed by path from the work tree top: the packages of one repository keep their files side by side.
 * Each file's text is read from the disk, or from `texts` when given (a commit's, read through git): the cache is then
 * read only, never written or pruned, and a file it lacks throws.
 */
export function indexSourceFiles(params: {
	root: string
	files: readonly string[]
	parse: ParseSourceFile
	/** The text of each file, by path from `root`, in place of the disk's (a file it lacks reads as empty). */
	texts?: ReadonlyMap<string, string>
}): ParsedSourceFile[] {
	const { root, files, parse, texts } = params
	function bytesOf(file: string): Buffer {
		if (texts === undefined) return readFileSync(join(root, file))
		const text = texts.get(file)
		// a file the caller lists without its text is never read as empty
		if (text === undefined) throw new Error(SOURCE_TEXT_MISSING.replace('{file}', () => file))
		return Buffer.from(text, 'utf8')
	}
	if (!isInWorkTree(root))
		return files.map(function parseFile(file) {
			return parse({ file, text: bytesOf(file).toString('utf8') })
		})
	const cacheFile = join(gitFolderOf(root), SOURCE_INDEX_FILE)
	const reader = readCliVersion()
	const prefix = readGit({ root, args: ['rev-parse', '--show-prefix'] }).trim()
	const cached = readCache({ cacheFile, reader })
	let changed = cached === undefined
	const next: SourceIndexCache = {
		schema: SOURCE_INDEX_SCHEMA,
		reader,
		files: othersFiles({ cached, prefix, files }),
	}
	const answer = files.map(function parseChangedFile(file) {
		const key = `${prefix}${file}`
		const bytes = bytesOf(file)
		const hash = createHash('sha256').update(bytes).digest('hex')
		const known = cached?.files[key]
		if (known !== undefined && known.hash === hash) {
			next.files[key] = known
			return parsedOf(known)
		}
		changed = true
		const parsed = parse({ file, text: bytes.toString('utf8') })
		next.files[key] = { hash, ...parsed }
		return parsed
	})
	if (cached !== undefined && Object.keys(cached.files).length !== Object.keys(next.files).length)
		changed = true
	// a commit's texts never stand for the worktree's files: the cache is read, never written
	if (changed && texts === undefined) writeCache({ cacheFile, cache: next })
	return answer
}

/**
 * The cached files this run keeps without reading them: the ones out of its reach, another package's. A file under
 * `prefix` in one of the top folders of `files` (`src/`) is this run's: kept only when `files` still names it.
 */
function othersFiles(params: {
	cached: SourceIndexCache | undefined
	prefix: string
	files: readonly string[]
}): SourceIndexCache['files'] {
	const { prefix } = params
	const folders = new Set(params.files.map(topFolderOf))
	return Object.fromEntries(
		Object.entries(params.cached?.files ?? {}).filter(function isOthers([key]) {
			return !(key.startsWith(prefix) && folders.has(topFolderOf(key.slice(prefix.length))))
		}),
	)
}

/** The first segment of a `/` path: `src` of `src/lib/git.ts`. */
function topFolderOf(path: string): string {
	return path.split('/', 1)[0]
}

/**
 * The cache at `cacheFile`; undefined when it is missing, not JSON, of another schema, written by another `reader`
 * (cli version) or of another shape.
 */
function readCache(params: { cacheFile: string; reader: string }): SourceIndexCache | undefined {
	let value: unknown
	try {
		value = JSON.parse(readFileSync(params.cacheFile, 'utf8'))
	} catch {
		return undefined
	}
	return isCache(value) && value.reader === params.reader ? value : undefined
}

/** `value` is a cache of the current schema whose every file has a hash and a list of well-formed entries. */
function isCache(value: unknown): value is SourceIndexCache {
	if (typeof value !== 'object' || value === null) return false
	const { schema, files } = value as Partial<SourceIndexCache>
	if (schema !== SOURCE_INDEX_SCHEMA || typeof files !== 'object' || files === null) return false
	return Object.values(files).every(function isCachedFile(file: unknown) {
		if (typeof file !== 'object' || file === null) return false
		const { hash, entries, note, facts } = file as Partial<SourceIndexCache['files'][string]>
		return (
			typeof hash === 'string' &&
			Array.isArray(entries) &&
			entries.every(isCachedEntry) &&
			(note === undefined || typeof note === 'string') &&
			(facts === undefined || isCachedFacts(facts))
		)
	})
}

/** `value` has the shape of a source function as the parser answers it (an `undefined` key is absent in JSON). */
function isCachedEntry(value: unknown): value is ApiSourceFunction {
	if (typeof value !== 'object' || value === null) return false
	const entry = value as Partial<Record<keyof ApiSourceFunction, unknown>>
	return (
		typeof entry.path === 'string' &&
		entry.root === 'source' &&
		typeof entry.signature === 'string' &&
		typeof entry.declaredAt === 'string' &&
		isStringList(entry.otherRoutes) &&
		isStringList(entry.intents) &&
		(entry.summary === undefined || typeof entry.summary === 'string')
	)
}

function isStringList(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every(function isString(item) {
			return typeof item === 'string'
		})
	)
}

/** `value` has the shape of a file's facts: its three lists (their rows are the parser's, written by this reader). */
function isCachedFacts(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false
	const { functions, imports, types } = value as Partial<Record<string, unknown>>
	return Array.isArray(functions) && Array.isArray(imports) && Array.isArray(types)
}

/** What a cached file answers: its entries, its facts and its note, each when it had one. */
function parsedOf(known: SourceIndexCache['files'][string]): ParsedSourceFile {
	return {
		entries: known.entries,
		...(known.facts !== undefined && { facts: known.facts }),
		...(known.note !== undefined && { note: known.note }),
	}
}

/** Writes the whole cache; a write that fails (a read-only git folder) is left unsaid: the answer does not need it. */
function writeCache(params: { cacheFile: string; cache: SourceIndexCache }): void {
	try {
		replaceWhole({ path: params.cacheFile, text: JSON.stringify(params.cache) })
	} catch {
		// the next run parses again
	}
}
