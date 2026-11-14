import { createHash } from 'node:crypto'
import {
	chmodSync,
	existsSync,
	readFileSync,
	readdirSync,
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
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { gitFolderOf } from '../git.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { parseSourceFile } from './source-file-functions.ts'
import { SOURCE_INDEX_FILE, SOURCE_INDEX_SCHEMA } from './source-functions.constants.ts'
import { indexSourceFiles } from './source-index.ts'

import { describe, expect, it, vi } from 'vitest'

import type { ParseSourceFile, SourceIndexCache } from './source-functions.types.ts'

function exporting(name: string): string {
	return `/** The ${name} function. */\nexport function ${name}(): void {}\n`
}

const THREE_FILES = {
	'src/a.ts': exporting('alpha'),
	'src/b.ts': exporting('beta'),
	'src/c.ts': exporting('gamma'),
}

/** The real parser, recording the file of each call (the order of calls is not specified: compare sorted). */
function countingParser(): { parse: ParseSourceFile; parsed: string[] } {
	const parsed: string[] = []
	return {
		parsed,
		parse: function countedParse(params) {
			parsed.push(params.file)
			return parseSourceFile(params)
		},
	}
}

function sorted(list: readonly string[]): string[] {
	return [...list].sort()
}

function cacheFileOf(root: string): string {
	return join(gitFolderOf(root), SOURCE_INDEX_FILE)
}

function readCache(root: string): SourceIndexCache {
	return JSON.parse(readFileSync(cacheFileOf(root), 'utf8')) as SourceIndexCache
}

function sha256Of(root: string, file: string): string {
	return createHash('sha256')
		.update(readFileSync(join(root, file)))
		.digest('hex')
}

/** A cache file as a reuse would trust it: each file's real hash, no entries. */
function writeCacheOf(params: { root: string; files: readonly string[]; schema: number }): void {
	const { root } = params
	const cache: SourceIndexCache = {
		schema: params.schema,
		files: Object.fromEntries(
			params.files.map((file) => [file, { hash: sha256Of(root, file), entries: [] }]),
		),
	}
	writeFileSync(cacheFileOf(root), JSON.stringify(cache))
}

/** A cache file of the current schema naming `reader`, each file's real hash; `entries` fills every file (default none). */
function writeCacheOfReader(params: {
	root: string
	files: readonly string[]
	reader: string
	entries?: readonly object[]
}): void {
	const { root } = params
	const cache = {
		schema: SOURCE_INDEX_SCHEMA,
		reader: params.reader,
		files: Object.fromEntries(
			params.files.map((file) => [
				file,
				{ hash: sha256Of(root, file), entries: params.entries ?? [] },
			]),
		),
	}
	writeFileSync(cacheFileOf(root), JSON.stringify(cache))
}

function readCacheReader(root: string): unknown {
	return (JSON.parse(readFileSync(cacheFileOf(root), 'utf8')) as { reader?: unknown }).reader
}

function pathsOf(answer: ReturnType<typeof indexSourceFiles>): string[][] {
	return answer.map((one) => one.entries.map((entry) => entry.path))
}

/** What a run with no cache answers: a fresh repository holding the same files. */
function answerWithoutCache(files: Record<string, string>) {
	const root = createScratchRepository(files)
	return indexSourceFiles({ root, files: Object.keys(files), parse: parseSourceFile })
}

describe('indexSourceFiles', () => {
	it(
		'a first run in a git work tree → every file parsed, the cache written with schema 1 and the hash of each file',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files, parse })

			expect(sorted(parsed)).toEqual(files)
			expect(pathsOf(answer)).toEqual([['src/a.ts#alpha'], ['src/b.ts#beta'], ['src/c.ts#gamma']])
			const cache = readCache(root)
			expect(cache.schema).toBe(1)
			expect(Object.keys(cache.files).sort()).toEqual(files)
			expect(cache.files['src/a.ts']?.hash).toBe(sha256Of(root, 'src/a.ts'))
			expect(cache.files['src/b.ts']?.hash).toBe(sha256Of(root, 'src/b.ts'))
			expect(cache.files['src/c.ts']?.entries).toEqual(answer[2]?.entries)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a second run on the same tree → no file parsed, the cache neither rewritten nor replaced, the same answer',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			const first = indexSourceFiles({ root, files, parse: parseSourceFile })
			const cacheFile = cacheFileOf(root)
			expect(existsSync(cacheFile)).toBe(true)
			const contentBefore = readFileSync(cacheFile, 'utf8')
			const statBefore = statSync(cacheFile)
			const { parse, parsed } = countingParser()

			const second = indexSourceFiles({ root, files, parse })

			expect(parsed).toEqual([])
			expect(second).toEqual(first)
			expect(readFileSync(cacheFile, 'utf8')).toBe(contentBefore)
			expect(statSync(cacheFile).mtimeMs).toBe(statBefore.mtimeMs)
			expect(statSync(cacheFile).ino).toBe(statBefore.ino)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a file rewritten with the same bytes and a later mtime → not parsed, the cache not replaced',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			indexSourceFiles({ root, files, parse: parseSourceFile })
			const cacheFile = cacheFileOf(root)
			expect(existsSync(cacheFile)).toBe(true)
			const inodeBefore = statSync(cacheFile).ino
			writeFileSync(join(root, 'src/a.ts'), THREE_FILES['src/a.ts'])
			const later = new Date(Date.now() + 60_000)
			utimesSync(join(root, 'src/a.ts'), later, later)
			const { parse, parsed } = countingParser()

			indexSourceFiles({ root, files, parse })

			expect(parsed).toEqual([])
			expect(statSync(cacheFile).ino).toBe(inodeBefore)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a same-length edit with the old mtime put back → parsed (the hash decides, not the stat)',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			indexSourceFiles({ root, files, parse: parseSourceFile })
			const before = statSync(join(root, 'src/a.ts'))
			writeFileSync(join(root, 'src/a.ts'), exporting('alphx'))
			utimesSync(join(root, 'src/a.ts'), before.atime, before.mtime)
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files, parse })

			expect(parsed).toEqual(['src/a.ts'])
			expect(pathsOf(answer)[0]).toEqual(['src/a.ts#alphx'])
			expect(readCache(root).files['src/a.ts']?.hash).toBe(sha256Of(root, 'src/a.ts'))
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'one file edited, one added, one deleted → exactly the edited and the added parsed, the deleted gone from answer and cache, one write',
		() => {
			const root = createScratchRepository(THREE_FILES)
			indexSourceFiles({ root, files: Object.keys(THREE_FILES), parse: parseSourceFile })
			const cacheFile = cacheFileOf(root)
			expect(existsSync(cacheFile)).toBe(true)
			const inodeBefore = statSync(cacheFile).ino
			writeFiles({
				root,
				files: { 'src/a.ts': exporting('alphaEdited'), 'src/d.ts': exporting('delta') },
			})
			const { parse, parsed } = countingParser()
			const files = ['src/a.ts', 'src/b.ts', 'src/d.ts']

			const answer = indexSourceFiles({ root, files, parse })

			expect(sorted(parsed)).toEqual(['src/a.ts', 'src/d.ts'])
			expect(pathsOf(answer)).toEqual([
				['src/a.ts#alphaEdited'],
				['src/b.ts#beta'],
				['src/d.ts#delta'],
			])
			const cache = readCache(root)
			expect(Object.keys(cache.files).sort()).toEqual(files)
			expect(cache.files['src/c.ts']).toBeUndefined()
			expect(cache.files['src/a.ts']?.hash).toBe(sha256Of(root, 'src/a.ts'))
			expect(cache.files['src/d.ts']?.hash).toBe(sha256Of(root, 'src/d.ts'))
			// written once, as a whole new file (`replaceWhole`)
			expect(statSync(cacheFile).ino).not.toBe(inodeBefore)
			const again = countingParser()
			indexSourceFiles({ root, files, parse: again.parse })
			expect(again.parsed).toEqual([])
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'`files` out of order, parsed and cached mixed → the answer follows the order given',
		() => {
			const root = createScratchRepository(THREE_FILES)
			indexSourceFiles({ root, files: Object.keys(THREE_FILES), parse: parseSourceFile })
			writeFiles({
				root,
				files: { 'src/a.ts': exporting('alphaEdited'), 'src/d.ts': exporting('delta') },
			})
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({
				root,
				files: ['src/d.ts', 'src/b.ts', 'src/a.ts'],
				parse,
			})

			expect(sorted(parsed)).toEqual(['src/a.ts', 'src/d.ts'])
			expect(pathsOf(answer)).toEqual([
				['src/d.ts#delta'],
				['src/b.ts#beta'],
				['src/a.ts#alphaEdited'],
			])
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a file removed from `files`, nothing else changed → nothing parsed, the cache rewritten without it',
		() => {
			const root = createScratchRepository(THREE_FILES)
			indexSourceFiles({ root, files: Object.keys(THREE_FILES), parse: parseSourceFile })
			const cacheFile = cacheFileOf(root)
			expect(existsSync(cacheFile)).toBe(true)
			const inodeBefore = statSync(cacheFile).ino
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files: ['src/a.ts', 'src/c.ts'], parse })

			expect(parsed).toEqual([])
			expect(pathsOf(answer)).toEqual([['src/a.ts#alpha'], ['src/c.ts#gamma']])
			expect(Object.keys(readCache(root).files).sort()).toEqual(['src/a.ts', 'src/c.ts'])
			expect(statSync(cacheFile).ino).not.toBe(inodeBefore)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a file that does not parse, second run → not parsed again, the same note',
		() => {
			const files = {
				'src/good.ts': exporting('good'),
				'src/bad.ts': 'export function broken( {\n',
			}
			const root = createScratchRepository(files)
			const list = ['src/bad.ts', 'src/good.ts']
			const first = indexSourceFiles({ root, files: list, parse: parseSourceFile })
			const { parse, parsed } = countingParser()

			const second = indexSourceFiles({ root, files: list, parse })

			expect(parsed).toEqual([])
			expect(second).toEqual(first)
			expect(second.map((one) => one.note)).toEqual([
				expect.stringMatching(/^src\/bad\.ts: not parsed \(.+\)$/),
				undefined,
			])
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it.each([
		{ name: 'another schema', prepare: prepareOtherSchema },
		{ name: 'not JSON', prepare: prepareNotJson },
	])(
		'a cache with $name → rebuilt: every file parsed, the answer of a run without a cache, schema 1 written',
		({ prepare }) => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			prepare({ root, files })
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files, parse })

			expect(sorted(parsed)).toEqual(files)
			expect(answer).toEqual(answerWithoutCache(THREE_FILES))
			expect(readCache(root).schema).toBe(1)
			expect(Object.keys(readCache(root).files).sort()).toEqual(files)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a cache written by another cli version, every hash right → rebuilt: every file parsed, the current reader written',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			writeCacheOfReader({ root, files, reader: `${readCliVersion()}-other` })
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files, parse })

			expect(sorted(parsed)).toEqual(files)
			expect(answer).toEqual(answerWithoutCache(THREE_FILES))
			expect(readCacheReader(root)).toBe(readCliVersion())
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a cache of the current cli version but the next schema, every hash right → rebuilt: every file parsed, schema 1 written',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			const nextSchema = {
				schema: SOURCE_INDEX_SCHEMA + 1,
				reader: readCliVersion(),
				files: Object.fromEntries(
					files.map((file) => [file, { hash: sha256Of(root, file), entries: [] }]),
				),
			}
			writeFileSync(cacheFileOf(root), JSON.stringify(nextSchema))
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files, parse })

			expect(sorted(parsed)).toEqual(files)
			expect(answer).toEqual(answerWithoutCache(THREE_FILES))
			expect(readCache(root).schema).toBe(SOURCE_INDEX_SCHEMA)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a cache entry without a path → rebuilt: every file parsed, the answer of a run without a cache',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			writeCacheOfReader({
				root,
				files,
				reader: readCliVersion(),
				entries: [{ root: 'source', signature: '(): void' }],
			})
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files, parse })

			expect(sorted(parsed)).toEqual(files)
			expect(answer).toEqual(answerWithoutCache(THREE_FILES))
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'two packages of one repository, run a, b, a → the third run parses nothing',
		() => {
			const root = createScratchRepository({
				'pkg-a/src/index.ts': exporting('alpha'),
				'pkg-b/src/index.ts': exporting('beta'),
			})
			const files = ['src/index.ts']
			const packageA = join(root, 'pkg-a')
			const packageB = join(root, 'pkg-b')
			indexSourceFiles({ root: packageA, files, parse: parseSourceFile })
			indexSourceFiles({ root: packageB, files, parse: parseSourceFile })
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root: packageA, files, parse })

			expect(parsed).toEqual([])
			expect(pathsOf(answer)).toEqual([['src/index.ts#alpha']])
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'two worktrees of one repository → each writes the cache in its own git folder, no cross-talk',
		() => {
			const first = createScratchRepository(THREE_FILES)
			const second = temporaryFolder('dialecte-source-second-')
			git({ root: first, args: ['worktree', 'add', '-q', '-b', 'second', second] })
			const files = Object.keys(THREE_FILES)

			indexSourceFiles({ root: first, files, parse: parseSourceFile })
			expect(gitFolderOf(first)).not.toBe(gitFolderOf(second))
			expect(existsSync(cacheFileOf(first))).toBe(true)
			expect(existsSync(cacheFileOf(second))).toBe(false)
			const { parse, parsed } = countingParser()
			indexSourceFiles({ root: second, files, parse })

			expect(sorted(parsed)).toEqual(files)
			expect(existsSync(cacheFileOf(second))).toBe(true)
			expect(readCache(second).schema).toBe(1)
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a folder outside a git work tree → every file parsed, no cache file anywhere, no throw',
		() => {
			const root = temporaryFolder('dialecte-source-nogit-')
			writeFiles({ root, files: THREE_FILES })
			const files = Object.keys(THREE_FILES)
			const { parse, parsed } = countingParser()

			const answer = indexSourceFiles({ root, files, parse })
			const second = countingParser()
			indexSourceFiles({ root, files, parse: second.parse })

			expect(sorted(parsed)).toEqual(files)
			expect(sorted(second.parsed)).toEqual(files)
			expect(pathsOf(answer)).toEqual([['src/a.ts#alpha'], ['src/b.ts#beta'], ['src/c.ts#gamma']])
			const everyFile = readdirSync(root, { recursive: true }).map(String)
			expect(everyFile.filter((file) => file.includes(SOURCE_INDEX_FILE))).toEqual([])
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)

	it(
		'a git folder that cannot be written → the answer unchanged, nothing thrown, nothing printed',
		() => {
			const root = createScratchRepository(THREE_FILES)
			const files = Object.keys(THREE_FILES)
			const expected = answerWithoutCache(THREE_FILES)
			const folder = gitFolderOf(root)
			const stdout = vi.spyOn(process.stdout, 'write')
			const stderr = vi.spyOn(process.stderr, 'write')
			chmodSync(folder, 0o555)
			try {
				const { parse, parsed } = countingParser()
				let answer: ReturnType<typeof indexSourceFiles> = []
				expect(() => {
					answer = indexSourceFiles({ root, files, parse })
				}).not.toThrow()

				expect(answer).toEqual(expected)
				expect(sorted(parsed)).toEqual(files)
				expect(stdout).not.toHaveBeenCalled()
				expect(stderr).not.toHaveBeenCalled()
				// running as root makes the folder writable anyway: then only the answer is asserted
				if (process.getuid?.() !== 0) expect(existsSync(cacheFileOf(root))).toBe(false)
			} finally {
				chmodSync(folder, 0o755)
				stdout.mockRestore()
				stderr.mockRestore()
			}
		},
		SCRATCH_GIT_CASE_TIMEOUT,
	)
})

/** A cache of another schema whose files all look unchanged: only a rebuild gives the right answer. */
function prepareOtherSchema(params: { root: string; files: readonly string[] }): void {
	writeCacheOf({ ...params, schema: 2 })
}

function prepareNotJson(params: { root: string }): void {
	writeFileSync(cacheFileOf(params.root), 'this is not json {')
}
