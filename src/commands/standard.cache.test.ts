import { appendFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { deadPid } from '../../test/dead-pid.ts'
import { installTestDialecte } from '../../test/installed-test-dialecte.ts'
import {
	HASH_PATTERN,
	INDEX_FOLDER_FILES,
	INDEX_FORMAT,
	SAMPLE_WORD,
	TAGS_FILE_PATTERN,
	TAGS_FILE_VERSION_ONE,
	TAGS_FILE_VERSION_TWO,
} from '../../test/standard-workspace.constants.ts'
import {
	answeredWith,
	createStandardWorkspace,
	entriesOf,
	environmentOf,
	filesUnder,
	lineCountOf,
	manifestHashOf,
	sampleStandardText,
	sha256Of,
	standardCacheFolder,
	writeTextFile,
} from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runStandard } from './standard.ts'

import { describe, expect, it, vi } from 'vitest'

import type { StandardIndexJson, StandardWorkspace } from '../../test/standard-workspace.types.ts'

const FIRST = sampleStandardText({ word: SAMPLE_WORD })
const SECOND = sampleStandardText({ word: 'quillon' })
const ALPHA_IDS = { 'alpha/one': FIRST, 'alpha/two': SECOND }

/** `standard index --json` over the workspace, parsed; the run must exit 0. */
async function indexed(params: {
	workspace: StandardWorkspace
	extra?: string[]
	environment?: NodeJS.ProcessEnv
	afterFileRead?: (params: { path: string }) => void
}): Promise<StandardIndexJson['standards'][number]> {
	const answer = await answeredWith({
		run: runStandard({
			argv: ['index', '--json', ...(params.extra ?? [])],
			cwd: params.workspace.cwd,
			environment: params.environment ?? params.workspace.environment,
			afterFileRead: params.afterFileRead,
		}),
		exitCode: 0,
	})
	return (JSON.parse(answer.output) as StandardIndexJson).standards[0]
}

function alphaFolder(workspace: StandardWorkspace): string {
	return standardCacheFolder({ workspace, standardId: 'alpha' })
}

function twoFileWorkspace(): StandardWorkspace {
	return createStandardWorkspace({
		standards: { alpha: { 'one.md': FIRST, 'two.md': SECOND } },
	})
}

describe('standard index: the index folder in the cache', () => {
	it(
		'two files, no dialecte installed → standard/alpha/<manifest hash>/ with every file of the format and a lines file each, no tags file',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })

			const alpha = await indexed({ workspace })

			expect(alpha).toMatchObject({ id: 'alpha', manifest: `sha256:${hash}`, state: 'built' })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			expect(filesUnder(join(alphaFolder(workspace), hash))).toEqual(
				[...INDEX_FOLDER_FILES, 'lines/one.jsonl', 'lines/two.jsonl'].sort(),
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a dialecte installed → the same folder plus one tags-<installed hash>.json',
		async () => {
			const workspace = twoFileWorkspace()
			installTestDialecte({ cwd: workspace.cwd })
			const hash = manifestHashOf({ files: ALPHA_IDS })

			await indexed({ workspace })

			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			expect(
				filesUnder(join(alphaFolder(workspace), hash)).filter((file) =>
					TAGS_FILE_PATTERN.test(file),
				),
			).toEqual([TAGS_FILE_VERSION_ONE])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the manifest → each file with its id, size in bytes, sha256 and line count, the format number, a build time and the cli version',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })

			await indexed({ workspace })

			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			const manifest = JSON.parse(
				readFileSync(join(alphaFolder(workspace), hash, 'manifest.json'), 'utf8'),
			)
			expect({
				files: manifest.files.map(
					(file: { id: string; name: string; size: number; sha256: string; lines: number }) => ({
						id: file.id,
						name: file.name,
						size: file.size,
						sha256: file.sha256,
						lines: file.lines,
					}),
				),
				indexFormat: manifest.indexFormat,
				built: typeof manifest.built,
				cliVersion: typeof manifest.cliVersion,
			}).toEqual({
				files: [
					{
						id: 'alpha/one',
						name: 'one.md',
						size: Buffer.byteLength(FIRST),
						sha256: sha256Of(FIRST),
						lines: lineCountOf(FIRST),
					},
					{
						id: 'alpha/two',
						name: 'two.md',
						size: Buffer.byteLength(SECOND),
						sha256: sha256Of(SECOND),
						lines: lineCountOf(SECOND),
					},
				],
				indexFormat: INDEX_FORMAT,
				built: 'string',
				cliVersion: 'string',
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'XDG_CACHE_HOME not set → the cache is HOME/.cache/dialecte',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })

			await indexed({
				workspace,
				environment: { DIALECTE_STANDARD: workspace.root, HOME: workspace.home },
			})

			expect(entriesOf(join(workspace.home, '.cache', 'dialecte', 'standard', 'alpha'))).toEqual([
				hash,
			])
			expect(entriesOf(workspace.cache)).toEqual([])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: the manifest hash', () => {
	it(
		'the same files in another root, written in another order → the same manifest hash',
		async () => {
			const first = twoFileWorkspace()
			const second = createStandardWorkspace({
				standards: { alpha: { 'two.md': SECOND, 'one.md': FIRST } },
			})

			const firstAlpha = await indexed({ workspace: first })
			const secondAlpha = await indexed({ workspace: second })

			expect(secondAlpha.manifest).toBe(firstAlpha.manifest)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'one byte of a file changed → a new manifest hash and a new folder, the old folder kept',
		async () => {
			const workspace = twoFileWorkspace()
			const oldHash = manifestHashOf({ files: ALPHA_IDS })
			const changedSecond = `${SECOND}!`
			const newHash = manifestHashOf({ files: { 'alpha/one': FIRST, 'alpha/two': changedSecond } })
			await indexed({ workspace })
			writeFileSync(join(workspace.root, 'alpha', 'two.md'), changedSecond)

			const alpha = await indexed({ workspace })

			expect(alpha).toMatchObject({ manifest: `sha256:${newHash}`, state: 'built' })
			expect(entriesOf(alphaFolder(workspace))).toEqual([oldHash, newHash].sort())
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a new amendment file added to the folder → a new manifest hash and a new folder, the old folder kept',
		async () => {
			const workspace = twoFileWorkspace()
			const oldHash = manifestHashOf({ files: ALPHA_IDS })
			const amendment = sampleStandardText({ word: 'amendment' })
			const newHash = manifestHashOf({ files: { ...ALPHA_IDS, 'alpha/three': amendment } })
			await indexed({ workspace })
			writeTextFile({ path: join(workspace.root, 'alpha', 'three.md'), text: amendment })

			const alpha = await indexed({ workspace })

			expect(alpha).toMatchObject({ manifest: `sha256:${newHash}`, state: 'built' })
			expect(entriesOf(alphaFolder(workspace))).toEqual([oldHash, newHash].sort())
			expect(
				filesUnder(join(alphaFolder(workspace), newHash)).filter((file) =>
					file.startsWith('lines/'),
				),
			).toEqual(['lines/one.jsonl', 'lines/three.jsonl', 'lines/two.jsonl'])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: reuse and rebuild', () => {
	it(
		'a second run over the same files → state reused, the folder not rebuilt',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			await indexed({ workspace })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			const marker = join(alphaFolder(workspace), hash, 'marker.txt')
			writeFileSync(marker, 'kept')

			const alpha = await indexed({ workspace })

			expect(alpha.state).toBe('reused')
			expect(readFileSync(marker, 'utf8')).toBe('kept')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--rebuild → state built again, the folder replaced, the same hash',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			await indexed({ workspace })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			writeFileSync(join(alphaFolder(workspace), hash, 'marker.txt'), 'old')

			const alpha = await indexed({ workspace, extra: ['--rebuild'] })

			expect(alpha).toMatchObject({ manifest: `sha256:${hash}`, state: 'built' })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			expect(filesUnder(join(alphaFolder(workspace), hash))).toEqual(
				[...INDEX_FOLDER_FILES, 'lines/one.jsonl', 'lines/two.jsonl'].sort(),
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a dialecte installed after the index was built → reused, its tags file written beside the rest, the manifest untouched',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			await indexed({ workspace })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			const manifestPath = join(alphaFolder(workspace), hash, 'manifest.json')
			const manifestBefore = readFileSync(manifestPath, 'utf8')
			installTestDialecte({ cwd: workspace.cwd })

			const alpha = await indexed({ workspace })

			expect(alpha.state).toBe('reused')
			expect(readFileSync(manifestPath, 'utf8')).toBe(manifestBefore)
			expect(
				filesUnder(join(alphaFolder(workspace), hash)).filter((file) =>
					TAGS_FILE_PATTERN.test(file),
				),
			).toEqual([TAGS_FILE_VERSION_ONE])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: the installed dialectes change', () => {
	it(
		'the dialecte reinstalled in another version after an index → reused, a second tags file beside the first',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			installTestDialecte({ cwd: workspace.cwd, version: '1.0.0' })
			await indexed({ workspace })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			installTestDialecte({ cwd: workspace.cwd, version: '2.0.0' })

			const alpha = await indexed({ workspace })

			expect(alpha.state).toBe('reused')
			expect(
				filesUnder(join(alphaFolder(workspace), hash)).filter((file) =>
					TAGS_FILE_PATTERN.test(file),
				),
			).toEqual([TAGS_FILE_VERSION_ONE, TAGS_FILE_VERSION_TWO].sort())
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

type StderrWrite = typeof process.stderr.write

/** Runs `standard index`, stderr being a terminal or not, and answers the text written to stderr meanwhile. */
async function stderrDuringIndex(params: { isTerminal: boolean }): Promise<string[]> {
	const workspace = twoFileWorkspace()
	const written: string[] = []
	const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((
		chunk: string | Uint8Array,
	) => {
		written.push(String(chunk))
		return true
	}) as StderrWrite)
	const descriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')
	Object.defineProperty(process.stderr, 'isTTY', { value: params.isTerminal, configurable: true })
	try {
		await indexed({ workspace })
	} finally {
		spy.mockRestore()
		if (descriptor) Object.defineProperty(process.stderr, 'isTTY', descriptor)
		else Reflect.deleteProperty(process.stderr, 'isTTY')
	}
	return written
}

describe('standard index: the running line while building', () => {
	it(
		'stderr not a terminal → nothing written to it during the build',
		async () => {
			const written = await stderrDuringIndex({ isTerminal: false })

			expect(written).toEqual([])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'stderr a terminal → a running line with the elapsed time is written during the build',
		async () => {
			const written = await stderrDuringIndex({ isTerminal: true })

			expect(written.filter((text) => /\d+(\.\d+)? ?(ms|s)\b/u.test(text)).length).toBeGreaterThan(
				0,
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'stderr a terminal, the index reused → nothing written',
		async () => {
			const workspace = twoFileWorkspace()
			await indexed({ workspace })
			const written: string[] = []
			const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
				written.push(String(chunk))
				return true
			}) as StderrWrite)
			Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
			try {
				await indexed({ workspace })
			} finally {
				spy.mockRestore()
				Reflect.deleteProperty(process.stderr, 'isTTY')
			}

			expect(written).toEqual([])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: the running line of a build that does not hold', () => {
	it(
		'stderr a terminal, a file changed during the build → the finish line says aborted',
		async () => {
			const workspace = createStandardWorkspace({
				standards: { alpha: { 'changing.md': FIRST, 'steady.md': SECOND } },
			})
			const written: string[] = []
			const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((
				chunk: string | Uint8Array,
			) => {
				written.push(String(chunk))
				return true
			}) as StderrWrite)
			Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
			let changed = false
			try {
				await answeredWith({
					run: runStandard({
						argv: ['index'],
						cwd: workspace.cwd,
						environment: workspace.environment,
						afterFileRead: ({ path }) => {
							if (changed || basename(path) !== 'changing.md') return
							changed = true
							appendFileSync(path, '\nAn extra line.')
						},
					}),
					exitCode: 1,
				})
			} finally {
				spy.mockRestore()
				Reflect.deleteProperty(process.stderr, 'isTTY')
			}

			expect(written.filter((text) => text.includes('aborted')).length).toBeGreaterThan(0)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: a rebuild next to readers', () => {
	it(
		'a find starts between the files of a --rebuild → it answers as before, no folder is left beside the index',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			await indexed({ workspace })
			const findArgv = ['find', SAMPLE_WORD, '--json']
			const before = await answeredWith({
				run: runStandard({
					argv: findArgv,
					cwd: workspace.cwd,
					environment: workspace.environment,
				}),
				exitCode: 0,
			})
			let concurrent: ReturnType<typeof runStandard> | undefined

			await indexed({
				workspace,
				extra: ['--rebuild'],
				afterFileRead: () => {
					concurrent ??= runStandard({
						argv: findArgv,
						cwd: workspace.cwd,
						environment: workspace.environment,
					})
				},
			})

			await expect(concurrent).resolves.toEqual(before)
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a folder renamed aside by a rebuild whose process is gone → removed at the next build, never read as an index',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			const stale = join(alphaFolder(workspace), `${hash}.old-${deadPid()}`)
			mkdirSync(stale, { recursive: true })
			writeFileSync(join(stale, 'manifest.json'), 'not an index')

			const alpha = await indexed({ workspace })

			expect(alpha.state).toBe('built')
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a folder renamed aside by a process that is alive → left where it is',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			// the parent process is alive and is not the one building
			const live = `other.old-${process.ppid}`
			mkdirSync(join(alphaFolder(workspace), live), { recursive: true })

			await indexed({ workspace })

			expect(entriesOf(alphaFolder(workspace))).toEqual([hash, live].sort())
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard index: a build that does not hold', () => {
	it(
		'a file changed while the build reads the files → exit 1 naming the file, no index folder, no tmp folder left',
		async () => {
			const workspace = createStandardWorkspace({
				standards: { alpha: { 'changing.md': FIRST, 'steady.md': SECOND } },
			})
			let changed = false

			const answer = await answeredWith({
				run: runStandard({
					argv: ['index'],
					cwd: workspace.cwd,
					environment: workspace.environment,
					afterFileRead: ({ path }) => {
						if (changed || basename(path) !== 'changing.md') return
						changed = true
						appendFileSync(path, '\nAn extra line.')
					},
				}),
				exitCode: 1,
			})

			expect(answer.output).toContain('changing.md')
			expect(answer.output).toContain('alpha/changing')
			expect(entriesOf(alphaFolder(workspace))).toEqual([])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'another builder puts the complete folder in place during the build → the own tmp folder removed, the winner reused untouched',
		async () => {
			const winnerWorkspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			await indexed({ workspace: winnerWorkspace })
			expect(entriesOf(alphaFolder(winnerWorkspace))).toEqual([hash])
			const winnerFolder = join(alphaFolder(winnerWorkspace), hash)
			const winnerManifest = readFileSync(join(winnerFolder, 'manifest.json'), 'utf8')
			const workspace = twoFileWorkspace()
			let arrived = false

			const alpha = await indexed({
				workspace,
				afterFileRead: () => {
					if (arrived) return
					arrived = true
					cpSync(winnerFolder, join(alphaFolder(workspace), hash), { recursive: true })
				},
			})

			expect(alpha).toMatchObject({ manifest: `sha256:${hash}`, state: 'reused' })
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			expect(readFileSync(join(alphaFolder(workspace), hash, 'manifest.json'), 'utf8')).toBe(
				winnerManifest,
			)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a tmp folder left by a process that is gone → removed at the next build, never read as an index',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			const stale = join(alphaFolder(workspace), `${hash}.tmp-${deadPid()}`)
			mkdirSync(stale, { recursive: true })
			writeFileSync(join(stale, 'manifest.json'), 'not an index')

			const alpha = await indexed({ workspace })

			expect(alpha.state).toBe('built')
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash])
			expect(filesUnder(join(alphaFolder(workspace), hash))).toEqual(
				[...INDEX_FOLDER_FILES, 'lines/one.jsonl', 'lines/two.jsonl'].sort(),
			)
			expect(
				JSON.parse(readFileSync(join(alphaFolder(workspace), hash, 'manifest.json'), 'utf8')).files,
			).toHaveLength(2)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a tmp folder of a process that is alive → left where it is, never read as an index',
		async () => {
			const workspace = twoFileWorkspace()
			const hash = manifestHashOf({ files: ALPHA_IDS })
			// the parent process is alive and is not the one building
			const live = `other.tmp-${process.ppid}`
			mkdirSync(join(alphaFolder(workspace), live), { recursive: true })

			const alpha = await indexed({ workspace })

			expect(alpha.state).toBe('built')
			expect(entriesOf(alphaFolder(workspace))).toEqual([hash, live].sort())
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('standard: the cache is the only place the standard goes', () => {
	it(
		'index, find, show and eval → nothing written under the working folder, the root unchanged',
		async () => {
			const workspace = twoFileWorkspace()
			const gold = join(workspace.base, 'gold.jsonl')
			writeFileSync(gold, `${JSON.stringify({ question: SAMPLE_WORD, expected: [] })}\n`)
			const rootBefore = filesUnder(workspace.root)
			const environment = environmentOf({ workspace })
			const runs = [['index'], ['find', SAMPLE_WORD], ['show', 'alpha/one:1-5'], ['eval', gold]]

			for (const argv of runs)
				await expect(runStandard({ argv, cwd: workspace.cwd, environment })).resolves.toMatchObject(
					{ output: expect.any(String) },
				)

			expect(entriesOf(workspace.cwd)).toEqual(['package.json'])
			expect(filesUnder(workspace.root)).toEqual(rootBefore)
			expect(HASH_PATTERN.test(entriesOf(alphaFolder(workspace))[0])).toBe(true)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
