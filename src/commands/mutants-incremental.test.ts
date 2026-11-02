import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	KEY_INPUT_FILES,
	LEGACY_INCREMENTAL_FILE,
	STORED_FILE_NAME,
} from '../../test/mutation-incremental.constants.ts'
import { incrementalStryker, storedIncrementalFiles } from '../../test/mutation-incremental.ts'
import {
	EDITED_SCOPE_SOURCE,
	PACKAGE_NAME,
	SCOPE_FILE,
} from '../../test/mutation-package.constants.ts'
import { mutationPackage, reportOf, storedLedger, storedRuns } from '../../test/mutation-package.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { commonGitDirOf } from '../../test/scratch-tree.ts'
import { computeIncrementalKey, packageHashOf } from '../lib/mutation/cache-key.ts'
import { INCREMENTAL_STORE_FOLDER } from '../lib/mutation/incremental-cache.constants.ts'
import { MUTATION_STORE_FOLDER } from '../lib/mutation/mutation.constants.ts'
import { packageRootOf } from '../lib/package-root.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { ignorerPluginPath, runMutants } from './mutants.ts'

import { describe, expect, it, vi } from 'vitest'

import type { IncrementalCall, TierFailure } from '../../test/mutation-incremental.types.ts'
import type { StrykerCall } from '../../test/mutation-package.types.ts'
import type {
	MutationReport,
	MutationTier,
	StrykerOptions,
} from '../lib/mutation/mutation.types.ts'

const WORK_FILE_PATTERN = /^\.tmp\/mutants\/[^/]+\/incremental\.json$/
const LEGACY_FILE = LEGACY_INCREMENTAL_FILE

const ALL_KILLED = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'false' }] })
const TIMED_OUT = reportOf({
	mutants: [
		{ id: '1', status: 'Timeout', replacement: 'true' },
		{ id: '2', status: 'Survived', replacement: 'false' },
	],
})
const TIMEOUT_ALONE = reportOf({ mutants: [{ id: '1', status: 'Killed', replacement: 'true' }] })
const SURVIVING = reportOf({ mutants: [{ id: '2', status: 'Survived', replacement: 'false' }] })

/** What the fake wrote at the fast tier's incremental file in its n-th call. */
function written(callNumber: number): string {
	return `{"incremental":"inc-${callNumber}"}\n`
}

/** The package, its key inputs committed, with an uncommitted edit of its scope file: a lot in progress. */
function editedPackage(params: { full?: boolean } = {}): string {
	const root = mutationPackage({ ...params, files: KEY_INPUT_FILES })
	writeFiles({ root, files: { [SCOPE_FILE]: EDITED_SCOPE_SOURCE } })
	return root
}

/** One `mutants run` with the fake; what each Stryker call saw of its incremental file, and the run's exit code. */
async function runOnce(params: {
	root: string
	reports?: Partial<Record<MutationTier, MutationReport>>
	failures?: Partial<Record<MutationTier, TierFailure>>
	/** How many fast calls the fake has seen before this run: its writes carry on the count. */
	before?: number
}): Promise<{ seen: IncrementalCall[]; calls: StrykerCall[]; exitCode: number }> {
	const { root, reports = { fast: ALL_KILLED }, failures, before = 0 } = params
	const calls: StrykerCall[] = []
	const seen: IncrementalCall[] = []
	const result = await runMutants({
		cwd: root,
		argv: ['run'],
		dependencies: {
			runStryker: incrementalStryker({
				root,
				reports,
				calls,
				seen,
				written: (callNumber) => written(before + callNumber),
				...(failures === undefined ? {} : { failures }),
			}),
		},
	})
	return { seen, calls, exitCode: result.exitCode }
}

describe('mutants run: the incremental cache', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("the first run of a package → the fast tier's incrementalFile is in the run's work folder, no file there when Stryker is called; afterwards the store holds the fake's file under one key", async () => {
		const root = editedPackage()

		const { seen, exitCode } = await runOnce({ root })

		expect(exitCode).toBe(0)
		expect(seen.map(({ tier, incrementalFile }) => [tier, incrementalFile])).toEqual([
			['fast', expect.stringMatching(WORK_FILE_PATTERN)],
		])
		expect(seen[0]?.incrementalFile).toBe(
			`.tmp/mutants/${storedRuns(root)[0]?.runId}/incremental.json`,
		)
		expect(seen[0]?.existed).toBe(false)
		const stored = storedIncrementalFiles(root)
		expect(Object.keys(stored)).toEqual([expect.stringMatching(STORED_FILE_NAME)])
		expect(Object.values(stored)).toEqual([written(1)])
	})

	it('a second run, nothing changed → the fast tier finds the stored bytes when called; the timeouts and full tiers are never seeded', async () => {
		const root = editedPackage({ full: true })
		const reports = { fast: TIMED_OUT, timeouts: TIMEOUT_ALONE, full: SURVIVING }
		const first = await runOnce({ root, reports })
		expect(first.seen.map(({ tier }) => tier)).toEqual(['fast', 'timeouts', 'full'])

		const second = await runOnce({ root, reports, before: 1 })

		expect(second.seen.map(({ tier }) => tier)).toEqual(['fast', 'timeouts', 'full'])
		expect(second.seen[0]).toMatchObject({ existed: true, content: written(1) })
		expect(
			second.seen
				.slice(1)
				.map(({ tier, incrementalFile, existed }) => [tier, incrementalFile, existed]),
		).toEqual([
			['timeouts', undefined, false],
			['full', undefined, false],
		])
		expect(Object.values(storedIncrementalFiles(root))).toEqual([written(2)])
	})

	it('nothing at .tmp/mutants/incremental.json is read or written by a run', async () => {
		const root = editedPackage()
		mkdirSync(join(root, '.tmp/mutants'), { recursive: true })
		writeFileSync(join(root, LEGACY_FILE), '{"legacy":true}\n')

		const { seen } = await runOnce({ root })

		expect(seen[0]).toMatchObject({ existed: false, content: undefined })
		expect(seen[0]?.incrementalFile).not.toBe(LEGACY_FILE)
		expect(readFileSync(join(root, LEGACY_FILE), 'utf8')).toBe('{"legacy":true}\n')
		expect(Object.values(storedIncrementalFiles(root))).toEqual([written(1)])
	})

	it('a run with no legacy file → none appears', async () => {
		const root = editedPackage()

		await runOnce({ root })

		expect(existsSync(join(root, LEGACY_FILE))).toBe(false)
	})
})

describe(
	'mutants run: a failing fast tier leaves the store alone (interleaving 3)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const FAILURES = ['throws', 'exit', 'no-report'] as const

		it.each(FAILURES)(
			'warm, the fake writing a new file then failing (%s) → the store byte-for-byte as before the run',
			async (failure) => {
				const root = editedPackage()
				await runOnce({ root })
				const before = storedIncrementalFiles(root)
				expect(Object.values(before)).toEqual([written(1)])

				const failed = await runOnce({ root, failures: { fast: failure }, before: 1 })

				expect(failed.seen[0]).toMatchObject({ existed: true, content: written(1) })
				expect(failed.exitCode).toBe(1)
				expect(storedIncrementalFiles(root)).toEqual(before)
			},
		)

		it.each(FAILURES)(
			'cold, the fake writing a file then failing (%s) → no store file',
			async (failure) => {
				const root = editedPackage()

				const failed = await runOnce({ root, failures: { fast: failure } })

				expect(failed.exitCode).toBe(1)
				expect(failed.seen[0]).toMatchObject({ existed: false })
				// the fake wrote its file in the run's work folder: the empty store is not for want of a write
				expect(failed.seen[0]?.incrementalFile).toMatch(WORK_FILE_PATTERN)
				expect(storedIncrementalFiles(root)).toEqual({})
			},
		)
	},
)

describe(
	'mutants run: a key input changing between two runs, the tree or the lock (interleaving 4)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const CHANGES: [string, (root: string) => void][] = [
			[
				'a test fixture file',
				(root) => writeFiles({ root, files: { 'test/fixtures/data.txt': 'fixture\n' } }),
			],
			[
				'a helper the config does not import',
				(root) => writeFiles({ root, files: { 'unused-helper.ts': 'export const unused = 1\n' } }),
			],
			[
				'a scope file',
				(root) =>
					writeFiles({ root, files: { [SCOPE_FILE]: `${EDITED_SCOPE_SOURCE}// edited again\n` } }),
			],
			[
				'the installed lock',
				(root) =>
					writeFiles({ root, files: { 'node_modules/.package-lock.json': '{"changed":true}\n' } }),
			],
			[
				'the declared vitest config',
				(root) =>
					writeFiles({
						root,
						files: { 'v.config.ts': `${KEY_INPUT_FILES['v.config.ts']}// edited\n` },
					}),
			],
			[
				'a file the config imports',
				(root) => writeFiles({ root, files: { 'helper.ts': 'export default "another helper"\n' } }),
			],
			[
				'a setup file the config names',
				(root) => writeFiles({ root, files: { 'test/setup.ts': 'export const ready = true\n' } }),
			],
			[
				'the declaration in package.json',
				(root) =>
					writeFiles({
						root,
						files: {
							'package.json': `${JSON.stringify({
								name: PACKAGE_NAME,
								dialecte: {
									mutation: {
										scope: ['src/engine/*.ts'],
										errorFactories: ['createOtherError'],
										fast: { vitestConfig: 'v.config.ts' },
									},
								},
							})}\n`,
						},
					}),
			],
		]

		it.each(CHANGES)(
			"%s edited → the second run is cold, its write-back is under a new key, the first key's file is intact",
			async (_name, change) => {
				const root = editedPackage()
				await runOnce({ root })
				const first = Object.entries(storedIncrementalFiles(root))
				expect(first).toEqual([[expect.stringMatching(STORED_FILE_NAME), written(1)]])
				const firstKey = first[0]?.[0] as string

				change(root)
				const second = await runOnce({ root, before: 1 })

				expect(second.seen[0]).toMatchObject({ existed: false, content: undefined })
				const stored = storedIncrementalFiles(root)
				expect(Object.keys(stored)).toHaveLength(2)
				expect(stored[firstKey]).toBe(written(1))
				expect(Object.values(stored).sort()).toEqual([written(1), written(2)])
			},
		)

		it('a change under .dialecte/ only (the records) → the second run is warm, the same key', async () => {
			const root = editedPackage()
			await runOnce({ root })
			const first = Object.entries(storedIncrementalFiles(root))
			expect(first).toEqual([[expect.stringMatching(STORED_FILE_NAME), written(1)]])

			writeFiles({ root, files: { '.dialecte/mutation-records.json': '{}\n' } })
			const second = await runOnce({ root, before: 1 })

			expect(second.seen[0]).toMatchObject({ existed: true, content: written(1) })
			expect(Object.keys(storedIncrementalFiles(root))).toEqual([first[0]?.[0]])
		})
	},
)

describe('mutants run: the key of the stored file', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("the first run stores under computeIncrementalKey of the fast options the call recorded, the cli version and the ignorer in the cli's dist folder", async () => {
		const root = editedPackage()
		const { calls } = await runOnce({ root })
		// the cli's dist folder (`dist/` beside the cli's package.json): mutants.ts does not export its own helper
		const distFolder = join(
			packageRootOf(dirname(fileURLToPath(import.meta.url))) as string,
			'dist',
		)

		const storedNames = Object.keys(storedIncrementalFiles(root)).map((key) => `${key}.json`)
		expect(storedNames).toHaveLength(1)
		expect(
			`${packageHashOf({ root })}-${computeIncrementalKey({
				root,
				tree: storedRuns(root)[0]?.tree as string,
				options: calls[0]?.options as StrykerOptions,
				cliVersion: readCliVersion(),
				ignorerPlugin: ignorerPluginPath({ distFolder }),
			})}.json`,
		).toBe(storedNames[0])
	})
})

describe(
	'mutants run: a write-back that throws (interleaving 8)',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the store folder is read-only → exit 0, the run reported, the warning on stderr, its verdicts in the ledger', async () => {
			const root = editedPackage()
			const folder = join(commonGitDirOf(root), MUTATION_STORE_FOLDER, INCREMENTAL_STORE_FOLDER)
			mkdirSync(folder, { recursive: true })
			chmodSync(folder, 0o555)
			const lines: string[] = []
			const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
				lines.push(String(chunk))
				return true
			})
			let outcome: Awaited<ReturnType<typeof runOnce>> | undefined
			try {
				outcome = await runOnce({ root, reports: { fast: SURVIVING } })
			} finally {
				spy.mockRestore()
				chmodSync(folder, 0o755)
			}

			expect(outcome?.exitCode).toBe(0)
			expect(storedRuns(root).map(({ state }) => state)).toEqual(['reported'])
			expect(lines.join('')).toMatch(
				/^mutants run: the incremental cache was not written \([^\n]*EACCES[^\n]*\); the next run of this tree starts cold\n$/,
			)
			// no store file under the final name after the failed write
			expect(storedIncrementalFiles(root)).toEqual({})
			expect(Object.values(storedLedger(root)).map(({ state }) => state)).toEqual(['new'])
		})
	},
)

describe(
	'mutants run: a later tier failing after a reported fast tier',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it("the timeouts tier fails → the fast tier's file is stored", async () => {
			const root = editedPackage({ full: true })

			const { exitCode, seen } = await runOnce({
				root,
				reports: { fast: TIMED_OUT, timeouts: TIMEOUT_ALONE },
				failures: { timeouts: 'throws' },
			})

			expect(seen.map(({ tier }) => tier)).toEqual(['fast', 'timeouts'])
			expect(exitCode).toBe(1)
			expect(Object.values(storedIncrementalFiles(root))).toEqual([written(1)])
		})

		it("the full tier fails → the fast tier's file is stored", async () => {
			const root = editedPackage({ full: true })

			const { exitCode, seen } = await runOnce({
				root,
				reports: { fast: SURVIVING, full: SURVIVING },
				failures: { full: 'exit' },
			})

			expect(seen.map(({ tier }) => tier)).toEqual(['fast', 'full'])
			expect(exitCode).toBe(1)
			expect(Object.values(storedIncrementalFiles(root))).toEqual([written(1)])
		})
	},
)
