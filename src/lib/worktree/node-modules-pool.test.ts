import {
	existsSync,
	mkdirSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { temporaryFolder, initializeRepository } from '../../../test/scratch-repository.ts'
import { identityOf, transitionOf, writeRecordFile } from '../../../test/store-records.ts'
import {
	KEPT_FILE,
	LOCK_TEXT,
	MARKER_FILE,
	MISMATCHED_LOCK_TEXT,
	OTHER_LOCK_TEXT,
	OUTSIDE_LINK,
	PARK_TIMES,
	POOL_UNIT_CASE_MS,
	REMOVED_FILES,
} from '../../../test/worktree-pool.constants.ts'
import {
	createBareWorktreeFolder,
	createRecordingSpawner,
	createWorktreeFolder,
	createWorktreesFolder,
	poolEntriesOf,
	readPoolFile,
	readTree,
	trashedNamesOf,
	writePoolEntry,
} from '../../../test/worktree-pool.ts'
import { writeCard } from '../events/cards-log.ts'
import { checkNodeModules } from './check-node-modules.ts'
import { computeLockKey } from './lock-key.ts'
import {
	createPoolCache,
	listPoolEntries,
	parkNodeModules,
	readPoolCap,
	takePooledNodeModules,
} from './node-modules-pool.ts'
import {
	POOL_FILE,
	POOL_MISS_BUSY,
	POOL_MISS_CROSS_DEVICE,
	POOL_MISS_EMPTY,
	POOL_MISS_NO_ENTRY,
} from './worktree.constants.ts'

import { describe, expect, it } from 'vitest'

import type { PoolEntryFile } from './worktree.types.ts'

/** The repository the worktrees belong to: its main checkout beside `.worktrees/`. */
function repositoryOf(params: { worktreesFolder: string; name?: string }): string {
	return join(params.worktreesFolder, '..', params.name ?? 'cli')
}

/** The pool entry as a park leaves it for `repository` (`cli` unless given), stamped with `lock`'s key and `packages`. */
function entryFile(params: {
	lock?: string
	parkedAt?: Date
	repository?: string
	packages?: Record<string, string>
	owner?: string
}): PoolEntryFile {
	return {
		repository: params.repository ?? 'cli',
		lockKey: computeLockKey({ text: params.lock ?? LOCK_TEXT }),
		parkedAt: (params.parkedAt ?? PARK_TIMES[0]).toISOString(),
		...(params.owner !== undefined && { owner: params.owner }),
		packages: params.packages ?? {},
	}
}

/** The `n`th hour of the pool's park day: an order of parks longer than PARK_TIMES. */
function hourOf(n: number): Date {
	return new Date(Date.UTC(2026, 10, 6, n))
}

/** A lock installing only `node_modules/k<n>`: a key of its own for each `n`. */
function keyedLockOf(n: number): string {
	return `${JSON.stringify({ lockfileVersion: 3, packages: { [`node_modules/k${n}`]: { version: '1.0.0' } } })}\n`
}

/** A scratch repository (a real git checkout) for the store readers, with no store lot yet. */
function createStoreRepository(params: { parent?: string; name?: string } = {}): string {
	return initializeRepository({
		root: join(
			params.parent ?? realpathSync(temporaryFolder('dialecte-pool-cap-')),
			params.name ?? 'cli',
		),
	})
}

/** Three store lots of `repository` open together (9:00 to 12:00, 10:00 to 11:30, 11:00 to 13:00). */
function writeThreeOpenLots(repository: string): void {
	writeStoreLot({
		repository,
		name: '0001-cli-a',
		at: ['2026-11-08T09:00:00.000Z', '2026-11-08T12:00:00.000Z'],
	})
	writeStoreLot({
		repository,
		name: '0002-cli-b',
		at: ['2026-11-08T10:00:00.000Z', '2026-11-08T11:30:00.000Z'],
	})
	writeStoreLot({
		repository,
		name: '0003-cli-c',
		at: ['2026-11-08T11:00:00.000Z', '2026-11-08T13:00:00.000Z'],
	})
}

/**
 * A store lot `name` of `repository`: its identity and one transition at each of `at` (ISO times), in that order;
 * written as plain files, as the store lays them out.
 */
function writeStoreLot(params: { repository: string; name: string; at: string[] }): void {
	const lotFolder = join(params.repository, '.git', 'dialecte-lots', params.name)
	writeRecordFile({
		folder: lotFolder,
		name: 'identity.json',
		text: `${JSON.stringify({ ...identityOf({ name: params.name }), repository: params.repository })}\n`,
	})
	params.at.forEach(function writeTransition(at, index) {
		writeRecordFile({
			folder: lotFolder,
			name: `transitions/${String(index + 1).padStart(6, '0')}.json`,
			text: `${JSON.stringify({ ...transitionOf({ seq: index + 1, at }), lot: params.name })}\n`,
		})
	})
}

/** A committed card of the lot `lot` at `at` in the repository's hand-over `cards.log`. */
function writeLotCard(params: { repository: string; lot: string; at: string }): void {
	const folder = join(params.repository, '.git', 'dialecte-handover')
	mkdirSync(folder, { recursive: true })
	writeCard({
		file: join(folder, 'cards.log'),
		line: {
			at: params.at,
			lot: params.lot,
			name: `hand-over-${params.lot}`,
			state: 'committed',
			feature: null,
			repository: params.repository,
			branch: `feat/${params.lot}`,
			head: 'a'.repeat(40),
			base: 'b'.repeat(40),
			card: null,
			usage: null,
			records: null,
			by: 'handover-run',
		},
	})
}

/**
 * A lockfile of the package `name` at `version` (its own entry `""` says both) installing `packages` (lock key to
 * version); by default the fake node_modules' `demo` 1.0.0.
 */
function lockTextOf(params: {
	name?: string
	version?: string
	packages?: Record<string, string>
}): string {
	const name = params.name ?? 'demo-app'
	const version = params.version ?? '1.0.0'
	const installed = Object.entries(params.packages ?? { 'node_modules/demo': '1.0.0' }).map(
		([key, installedVersion]) => [key, { version: installedVersion }],
	)
	return `${JSON.stringify({
		name,
		version,
		lockfileVersion: 3,
		requires: true,
		packages: { '': { name, version }, ...Object.fromEntries(installed) },
	})}\n`
}

/**
 * A `pool.json` of the old shape (`lockHash`, no `lockKey`) over the entry folder `name`: its `lockHash` holds the lock
 * key a new entry would hold, so only the missing `lockKey` tells it apart.
 */
function writeOldShapeEntry(params: {
	worktreesFolder: string
	name: string
	repository?: string
	lock?: string
}): string {
	const folder = writePoolEntry({
		worktreesFolder: params.worktreesFolder,
		name: params.name,
		entry: entryFile({ repository: params.repository }),
	})
	writeFileSync(
		join(folder, POOL_FILE),
		`${JSON.stringify({
			repository: params.repository ?? 'cli',
			lockHash: computeLockKey({ text: params.lock ?? LOCK_TEXT }),
			parkedAt: PARK_TIMES[0].toISOString(),
		})}\n`,
	)
	return folder
}

/** The miss a restore answers when the repository has entries, none with `lock`'s key. */
function noEntryMissOf(lock: string): string {
	return `${POOL_MISS_NO_ENTRY} ${computeLockKey({ text: lock }).slice(0, 8)}`
}

describe('parkNodeModules', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('a relative symlink leaving node_modules becomes absolute to the same target; one inside stays relative', () => {
		const worktreesFolder = createWorktreesFolder()
		// one folder deeper than a pool entry: resolving the relative link from the pool afterwards gives another target
		const worktree = createWorktreeFolder({
			worktreesFolder,
			name: 'nested/0001-cli-x',
			lock: LOCK_TEXT,
		})
		const target = resolve(join(worktree, 'node_modules/@dialecte'), OUTSIDE_LINK)
		const { spawner } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: PARK_TIMES[0],
				spawner,
			}),
		).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: [] })
		const [entry] = poolEntriesOf(worktreesFolder)
		const parked = join(worktreesFolder, entry, 'node_modules')
		expect(readlinkSync(join(parked, '@dialecte/core'))).toBe(target)
		expect(readlinkSync(join(parked, '.bin/demo'))).toBe('../demo/index.js')
	})

	it('a link reaching inside its own checkout (@s/pkg → ../../packages/pkg) → parked relative, and taken for another worktree it reaches that worktree’s packages/pkg', () => {
		const worktreesFolder = createWorktreesFolder()
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		mkdirSync(join(worktree, 'node_modules/@s'), { recursive: true })
		symlinkSync('../../packages/pkg', join(worktree, 'node_modules/@s/pkg'))
		const next = createBareWorktreeFolder({ worktreesFolder, name: '0002-cli-y', lock: LOCK_TEXT })
		mkdirSync(join(next, 'packages/pkg'), { recursive: true })
		const { spawner } = createRecordingSpawner()

		parkNodeModules({
			worktree,
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			now: PARK_TIMES[0],
			spawner,
		})
		const [entry] = poolEntriesOf(worktreesFolder)
		const parkedLink = readlinkSync(join(worktreesFolder, entry, 'node_modules/@s/pkg'))
		takePooledNodeModules({
			worktree: next,
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
		})

		expect(parkedLink).toBe('../../packages/pkg')
		expect(realpathSync(join(next, 'node_modules/@s/pkg'))).toBe(
			realpathSync(join(next, 'packages/pkg')),
		)
	})

	it('.vite and .cache removed; every other file kept byte for byte; the entry holds pool.json with repository, lockKey, parkedAt and packages', () => {
		const worktreesFolder = createWorktreesFolder()
		const worktree = createWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
			marker: 'kept as it is\n',
		})
		const before = readTree(join(worktree, 'node_modules'))
		const { spawner } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: PARK_TIMES[1],
				spawner,
			}),
		).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: [] })
		const [entry] = poolEntriesOf(worktreesFolder)
		const kept = join(worktreesFolder, entry, 'node_modules')
		const after = readTree(kept)
		// the leaving link is rewritten absolute (the case above); the rest is the same bytes
		const { '@dialecte/core': _leavingBefore, ...beforeRest } = before
		const { '@dialecte/core': _leavingAfter, ...afterRest } = after
		for (const file of REMOVED_FILES) delete beforeRest[file]
		expect(afterRest).toEqual(beforeRest)
		expect(afterRest[KEPT_FILE]).toBe('module.exports = 1\n')
		expect(afterRest[MARKER_FILE]).toBe('kept as it is\n')
		expect(existsSync(join(kept, '.vite'))).toBe(false)
		expect(existsSync(join(kept, '.cache'))).toBe(false)
		expect(existsSync(join(worktree, 'node_modules'))).toBe(false)
		expect(readPoolFile({ worktreesFolder, name: entry })).toEqual({
			repository: 'cli',
			lockKey: computeLockKey({ text: LOCK_TEXT }),
			parkedAt: PARK_TIMES[1].toISOString(),
			packages: {},
		})
	})

	it('park a third entry for one repository → the oldest goes to the trash, two remain', () => {
		const worktreesFolder = createWorktreesFolder()
		const { spawner, calls } = createRecordingSpawner()

		PARK_TIMES.forEach(function park(now, order) {
			const worktree = createWorktreeFolder({
				worktreesFolder,
				name: `000${order + 1}-cli-x`,
				lock: LOCK_TEXT,
			})
			expect(
				parkNodeModules({
					worktree,
					repository: repositoryOf({ worktreesFolder }),
					worktreesFolder,
					now,
					spawner,
				}),
			).toEqual({
				entry: expect.stringMatching(/^_pool-cli-\d+$/),
				// the third park sends the oldest entry to the trash
				trashed: order === 2 ? [expect.stringMatching(/^_pool-cli-\d+$/)] : [],
			})
		})

		const entries = poolEntriesOf(worktreesFolder)
		expect(entries).toHaveLength(2)
		expect(entries.map((name) => readPoolFile({ worktreesFolder, name }).parkedAt).sort()).toEqual([
			PARK_TIMES[1].toISOString(),
			PARK_TIMES[2].toISOString(),
		])
		// the trash also holds the caches of each park: the evicted entry is the one named like a pool entry
		const trashed = trashedNamesOf(worktreesFolder).filter((name) => name.startsWith('_pool-cli-'))
		expect(trashed).toHaveLength(1)
		expect(
			calls.filter((call) =>
				call.args.at(-1)?.startsWith(join(worktreesFolder, '_trash', '_pool-')),
			),
		).toEqual([
			{ command: 'rm', args: ['-rf', join(worktreesFolder, '_trash', trashed[0])], cwd: undefined },
		])
	})

	it('a repository with two entries and another with one → the second repository parks without trashing anything', () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ parkedAt: PARK_TIMES[0] }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: PARK_TIMES[1] }),
		})
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-core-x', lock: LOCK_TEXT })
		const { spawner, calls } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder, name: 'core' }),
				worktreesFolder,
				now: PARK_TIMES[2],
				spawner,
			}),
		).toEqual({ entry: expect.stringMatching(/^_pool-core-\d+$/), trashed: [] })
		expect(poolEntriesOf(worktreesFolder)).toHaveLength(3)
		// no pool entry is trashed; the caches of the park go to the trash too, as background removals
		expect(trashedNamesOf(worktreesFolder).filter((name) => name.startsWith('_pool-'))).toEqual([])
		expect(
			calls.filter((call) =>
				call.args.at(-1)?.startsWith(join(worktreesFolder, '_trash', '_pool-')),
			),
		).toEqual([])
	})
})

describe(
	'parkNodeModules: what is left when it cannot finish',
	{ timeout: POOL_UNIT_CASE_MS },
	() => {
		it('the relink of the leaving links throws → node_modules left in the worktree, no _pool-* folder at all', () => {
			const worktreesFolder = createWorktreesFolder()
			const worktree = createWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: LOCK_TEXT,
				marker: 'stays\n',
			})
			const { spawner } = createRecordingSpawner()

			expect(
				parkNodeModules({
					worktree,
					repository: repositoryOf({ worktreesFolder }),
					worktreesFolder,
					now: PARK_TIMES[0],
					spawner,
					relink: function throwing() {
						throw new Error('the relink failed')
					},
				}),
			).toEqual(expect.stringContaining('the relink failed'))
			expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('stays\n')
			expect(poolEntriesOf(worktreesFolder)).toEqual([])
		})

		it('a node_modules that does not match the lockfile it would be stamped with → not parked: no pool entry', () => {
			const worktreesFolder = createWorktreesFolder()
			// the fake node_modules holds demo 1.0.0; this lockfile locks demo 2.0.0
			const worktree = createWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: MISMATCHED_LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()

			expect(
				parkNodeModules({
					worktree,
					repository: repositoryOf({ worktreesFolder }),
					worktreesFolder,
					now: PARK_TIMES[0],
					spawner,
				}),
			).toEqual(expect.any(String))
			expect(poolEntriesOf(worktreesFolder)).toEqual([])
		})

		it('a park → .vite and .cache go to the trash through the spawner, one background rm -rf each, none left in the pooled node_modules', () => {
			const worktreesFolder = createWorktreesFolder()
			const worktree = createWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: LOCK_TEXT,
			})
			const { spawner, calls } = createRecordingSpawner()

			expect(
				parkNodeModules({
					worktree,
					repository: repositoryOf({ worktreesFolder }),
					worktreesFolder,
					now: PARK_TIMES[0],
					spawner,
				}),
			).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: [] })

			const [entry] = poolEntriesOf(worktreesFolder)
			expect(existsSync(join(worktreesFolder, entry, 'node_modules/.vite'))).toBe(false)
			expect(existsSync(join(worktreesFolder, entry, 'node_modules/.cache'))).toBe(false)
			expect(calls).toHaveLength(2)
			for (const call of calls) {
				expect(call.command).toBe('rm')
				expect(call.args[0]).toBe('-rf')
				expect(call.args[1].startsWith(join(worktreesFolder, '_trash'))).toBe(true)
			}
			expect(trashedNamesOf(worktreesFolder)).toHaveLength(2)
		})
	},
)

describe('parkNodeModules: the check and the stamp', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('the node_modules checked against lock A, the lockfile changed to B before the park → the entry is stamped with the key and packages of A (the lock the check was made against)', () => {
		const worktreesFolder = createWorktreesFolder()
		const checkedLockText = lockTextOf({})
		const worktree = createWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: checkedLockText,
		})
		const check = checkNodeModules({ worktree })
		writeFileSync(
			join(worktree, 'package-lock.json'),
			lockTextOf({ packages: { 'node_modules/demo': '2.0.0', 'node_modules/extra': '1.0.0' } }),
		)
		const { spawner } = createRecordingSpawner()

		parkNodeModules({
			worktree,
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			now: PARK_TIMES[0],
			spawner,
			check,
			checkedLockText,
		})

		const [entry] = poolEntriesOf(worktreesFolder)
		expect(readPoolFile({ worktreesFolder, name: entry })).toMatchObject({
			lockKey: computeLockKey({ text: checkedLockText }),
			packages: { 'node_modules/demo': '1.0.0' },
		})
	})

	it('no checkedLockText given → the entry is stamped with the key and packages of the lockfile read with the check', () => {
		const worktreesFolder = createWorktreesFolder()
		const lock = lockTextOf({})
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock })
		const { spawner } = createRecordingSpawner()

		parkNodeModules({
			worktree,
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			now: PARK_TIMES[0],
			spawner,
		})

		const [entry] = poolEntriesOf(worktreesFolder)
		expect(readPoolFile({ worktreesFolder, name: entry })).toMatchObject({
			lockKey: computeLockKey({ text: lock }),
			packages: { 'node_modules/demo': '1.0.0' },
		})
	})
})

describe('the pool key: what the lock installs', { timeout: POOL_UNIT_CASE_MS }, () => {
	it.each([
		{
			label: "a release bump (the package's own version)",
			taken: lockTextOf({ version: '1.1.0' }),
		},
		{ label: "a rename (the package's own name)", taken: lockTextOf({ name: 'demo-renamed' }) },
	])(
		'an entry parked before $label → the same key, taken by the checkout of the new lock',
		({ taken }) => {
			const worktreesFolder = createWorktreesFolder()
			const worktree = createWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: lockTextOf({}),
			})
			const next = createBareWorktreeFolder({ worktreesFolder, name: '0002-cli-y', lock: taken })
			const { spawner } = createRecordingSpawner()
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: PARK_TIMES[0],
				spawner,
			})
			const [entry] = poolEntriesOf(worktreesFolder)

			expect(
				takePooledNodeModules({
					worktree: next,
					repository: repositoryOf({ worktreesFolder }),
					worktreesFolder,
				}),
			).toEqual({ taken: entry })
		},
	)

	it.each([
		{
			label: 'a dependency added',
			checkout: lockTextOf({
				packages: { 'node_modules/demo': '1.0.0', 'node_modules/extra': '1.0.0' },
			}),
		},
		{
			label: 'a dependency moved under another',
			checkout: lockTextOf({ packages: { 'node_modules/other/node_modules/demo': '1.0.0' } }),
		},
		{
			label: 'a dependency at another version',
			checkout: lockTextOf({ packages: { 'node_modules/demo': '1.0.1' } }),
		},
	])(
		'an entry of the repository, the checkout lock with $label → another key: no take, the miss names the key',
		({ checkout }) => {
			const worktreesFolder = createWorktreesFolder()
			writePoolEntry({
				worktreesFolder,
				name: '_pool-cli-1',
				entry: entryFile({ lock: lockTextOf({}), packages: { 'node_modules/demo': '1.0.0' } }),
			})
			const next = createBareWorktreeFolder({ worktreesFolder, name: '0002-cli-y', lock: checkout })
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.restore({ checkout: next, lockText: checkout })).toEqual({
				miss: noEntryMissOf(checkout),
			})
			expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
		},
	)

	it('a pool.json of the old shape (lockHash, no lockKey) → no entry: never listed, never taken', () => {
		const worktreesFolder = createWorktreesFolder()
		writeOldShapeEntry({ worktreesFolder, name: '_pool-cli-1', lock: LOCK_TEXT })
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
			}),
		).toEqual({ notTaken: 'no match' })
		expect(listPoolEntries(worktreesFolder)).toEqual([])
		expect(existsSync(join(worktree, 'node_modules'))).toBe(false)
	})

	it('old-shape entries of the repository and of another → the next park of the repository trashes its own, the other stays', () => {
		const worktreesFolder = createWorktreesFolder()
		writeOldShapeEntry({ worktreesFolder, name: '_pool-cli-1' })
		writeOldShapeEntry({ worktreesFolder, name: '_pool-core-1', repository: 'core' })
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: PARK_TIMES[1],
				spawner,
			}),
		).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: ['_pool-cli-1'] })
		expect(existsSync(join(worktreesFolder, '_pool-cli-1'))).toBe(false)
		expect(existsSync(join(worktreesFolder, '_pool-core-1'))).toBe(true)
	})

	it('an old-shape entry, a folder without pool.json (a park in progress) and one whose pool.json does not parse → the park trashes the old-shape one only', () => {
		const worktreesFolder = createWorktreesFolder()
		writeOldShapeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const inProgress = writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({}),
		})
		rmSync(join(inProgress, POOL_FILE))
		const unreadable = writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-3',
			entry: entryFile({}),
		})
		writeFileSync(join(unreadable, POOL_FILE), '{ "repository": "cli", \n')
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: PARK_TIMES[1],
				spawner,
			}),
		).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: ['_pool-cli-1'] })
		expect(existsSync(join(inProgress, 'node_modules'))).toBe(true)
		expect(existsSync(join(unreadable, POOL_FILE))).toBe(true)
	})
})

describe('parkNodeModules: a rename that fails', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('the rename fails with EXDEV → answers the reason, node_modules left in place, no pool entry', () => {
		const worktreesFolder = createWorktreesFolder()
		const worktree = createWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
			marker: 'stays\n',
		})
		const { spawner, calls } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: PARK_TIMES[0],
				spawner,
				rename: function acrossDevices() {
					throw Object.assign(new Error('EXDEV: cross-device link not permitted'), {
						code: 'EXDEV',
					})
				},
			}),
		).toEqual(expect.stringMatching(/cross-device/))
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('stays\n')
		expect(poolEntriesOf(worktreesFolder)).toEqual([])
		expect(calls).toEqual([])
	})
})

describe('takePooledNodeModules', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('the newest entry with the same lock key is renamed into the worktree; the entry folder is gone', () => {
		const worktreesFolder = createWorktreesFolder()
		// the newest entry is the lowest numbered: neither the name order nor the number order picks it
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ parkedAt: PARK_TIMES[1] }),
			marker: 'newer\n',
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: PARK_TIMES[0] }),
			marker: 'older\n',
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0003-cli-y',
			lock: LOCK_TEXT,
		})

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
			}),
		).toEqual({ taken: '_pool-cli-1' })
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('newer\n')
		expect(existsSync(join(worktreesFolder, '_pool-cli-1'))).toBe(false)
		expect(poolEntriesOf(worktreesFolder)).toEqual(['_pool-cli-2'])
	})

	it('entries with another lock key only → nothing taken, answer "no match"', () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ lock: OTHER_LOCK_TEXT }),
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})

		// the entry is read as an entry: the answer comes from its key or repository, not from a shape it skips
		expect(listPoolEntries(worktreesFolder).map((entry) => entry.name)).toEqual(['_pool-cli-1'])
		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
			}),
		).toEqual({ notTaken: 'no match' })
		expect(existsSync(join(worktree, 'node_modules'))).toBe(false)
		expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
	})

	it("another repository's entry is never taken, whatever its lock key", () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-core-1',
			entry: entryFile({ repository: 'core' }),
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})

		// the entry is read as an entry: the answer comes from its key or repository, not from a shape it skips
		expect(listPoolEntries(worktreesFolder).map((entry) => entry.name)).toEqual(['_pool-core-1'])
		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder, name: 'cli' }),
				worktreesFolder,
			}),
		).toEqual({ notTaken: 'no match' })
		expect(existsSync(join(worktree, 'node_modules'))).toBe(false)
		expect(existsSync(join(worktreesFolder, '_pool-core-1/node_modules'))).toBe(true)
	})

	it('two takers on one entry (the first rename wins) → the second gets "taken by another"', () => {
		const worktreesFolder = createWorktreesFolder()
		const entry = writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({}),
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})
		const elsewhere = join(worktreesFolder, 'taken-by-the-first')

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				afterPick: function firstTakerWins() {
					mkdirSync(elsewhere)
					renameSync(join(entry, 'node_modules'), join(elsewhere, 'node_modules'))
				},
			}),
		).toEqual({ notTaken: 'taken by another' })
		expect(existsSync(join(worktree, 'node_modules'))).toBe(false)
	})

	it('two matching entries, the newest taken by another → the older one is taken: the second goes on to the next entry', () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: PARK_TIMES[0] }),
			marker: 'older\n',
		})
		const newest = writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ parkedAt: PARK_TIMES[1] }),
			marker: 'newer\n',
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0003-cli-y',
			lock: LOCK_TEXT,
		})
		const elsewhere = join(worktreesFolder, 'taken-by-the-first')
		let picks = 0

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				afterPick: function firstTakerWinsTheNewest() {
					picks += 1
					if (picks > 1) return
					mkdirSync(elsewhere)
					renameSync(join(newest, 'node_modules'), join(elsewhere, 'node_modules'))
				},
			}),
		).toEqual({ taken: '_pool-cli-2' })
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('older\n')
	})

	it('the entry folder is gone between the rename and its cleanup (evicted meanwhile) → the take still succeeds', () => {
		const worktreesFolder = createWorktreesFolder()
		const entry = writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({}),
			marker: 'taken\n',
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				rename: function renameThenEvicted({ from, to }) {
					renameSync(from, to)
					// another run evicts the emptied entry before the taker cleans it up
					rmSync(entry, { recursive: true, force: true })
				},
			}),
		).toEqual({ taken: '_pool-cli-1' })
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('taken\n')
	})

	it('the rename fails with EXDEV → answer "cross-device", nothing moved', () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({ worktreesFolder, name: '_pool-cli-1', entry: entryFile({}) })
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				rename: function acrossDevices() {
					throw Object.assign(new Error('EXDEV: cross-device link not permitted'), {
						code: 'EXDEV',
					})
				},
			}),
		).toEqual({ notTaken: 'cross-device' })
		expect(existsSync(join(worktree, 'node_modules'))).toBe(false)
		expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
		expect(existsSync(join(worktreesFolder, '_pool-cli-1/pool.json'))).toBe(true)
	})
})

describe(
	'createPoolCache: the local store behind the dependency-cache interface',
	{ timeout: POOL_UNIT_CASE_MS },
	() => {
		it('restore, an entry of the repository with the checkout lock key → taken: its node_modules in the checkout', () => {
			const worktreesFolder = createWorktreesFolder()
			writePoolEntry({
				worktreesFolder,
				name: '_pool-cli-1',
				entry: entryFile({}),
				marker: 'taken\n',
			})
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0002-cli-y',
				lock: LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.restore({ checkout, lockText: LOCK_TEXT })).toEqual({ taken: '_pool-cli-1' })
			expect(readTree(join(checkout, 'node_modules'))[MARKER_FILE]).toBe('taken\n')
		})

		it("restore, no entry of the repository (another repository's only) → miss: pool empty", () => {
			const worktreesFolder = createWorktreesFolder()
			writePoolEntry({
				worktreesFolder,
				name: '_pool-core-1',
				entry: entryFile({ repository: 'core' }),
			})
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0002-cli-y',
				lock: LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.restore({ checkout, lockText: LOCK_TEXT })).toEqual({ miss: POOL_MISS_EMPTY })
			expect(existsSync(join(worktreesFolder, '_pool-core-1/node_modules'))).toBe(true)
		})

		it('restore, the lock on disk another than lockText, an entry with the key of lockText → taken: the restore keys on lockText', () => {
			const worktreesFolder = createWorktreesFolder()
			writePoolEntry({
				worktreesFolder,
				name: '_pool-cli-1',
				entry: entryFile({ lock: LOCK_TEXT }),
			})
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0002-cli-y',
				lock: OTHER_LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.restore({ checkout, lockText: LOCK_TEXT })).toEqual({ taken: '_pool-cli-1' })
		})

		it("restore, the repository's only entry of the old shape → miss: pool empty, its node_modules stays", () => {
			const worktreesFolder = createWorktreesFolder()
			const old = writeOldShapeEntry({ worktreesFolder, name: '_pool-cli-1', lock: LOCK_TEXT })
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0002-cli-y',
				lock: LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.restore({ checkout, lockText: LOCK_TEXT })).toEqual({ miss: POOL_MISS_EMPTY })
			expect(existsSync(join(old, 'node_modules'))).toBe(true)
		})

		it('restore, the matching entry renamed away by another taker → miss: entry busy', () => {
			const worktreesFolder = createWorktreesFolder()
			writePoolEntry({ worktreesFolder, name: '_pool-cli-1', entry: entryFile({}) })
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0002-cli-y',
				lock: LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
				rename: function takenByAnother() {
					throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
				},
			})

			expect(cache.restore({ checkout, lockText: LOCK_TEXT })).toEqual({ miss: POOL_MISS_BUSY })
			expect(existsSync(join(checkout, 'node_modules'))).toBe(false)
		})

		it('restore, the rename fails with EXDEV → miss: cross-device, nothing moved', () => {
			const worktreesFolder = createWorktreesFolder()
			writePoolEntry({ worktreesFolder, name: '_pool-cli-1', entry: entryFile({}) })
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0002-cli-y',
				lock: LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
				rename: function acrossDevices() {
					throw Object.assign(new Error('EXDEV: cross-device link not permitted'), {
						code: 'EXDEV',
					})
				},
			})

			expect(cache.restore({ checkout, lockText: LOCK_TEXT })).toEqual({
				miss: POOL_MISS_CROSS_DEVICE,
			})
			expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
		})

		it('save, a node_modules that installs its lock → parked, stamped with the key and packages of the lock given', () => {
			const worktreesFolder = createWorktreesFolder()
			const lockText = lockTextOf({})
			const checkout = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: lockText })
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.save({ checkout, lockText, now: PARK_TIMES[0] })).toEqual({
				parked: expect.stringMatching(/^_pool-cli-\d+$/),
				trashed: [],
			})
			const [entry] = poolEntriesOf(worktreesFolder)
			expect(readPoolFile({ worktreesFolder, name: entry })).toEqual({
				repository: 'cli',
				lockKey: computeLockKey({ text: lockText }),
				parkedAt: PARK_TIMES[0].toISOString(),
				packages: { 'node_modules/demo': '1.0.0' },
			})
		})

		it('save, the lock on disk another than lockText → checked against lockText, parked, stamped with its key and packages', () => {
			const worktreesFolder = createWorktreesFolder()
			const lockText = lockTextOf({})
			// the lock on disk locks demo 2.0.0: a check against it would refuse the fake node_modules (demo 1.0.0)
			const checkout = createWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: MISMATCHED_LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.save({ checkout, lockText, now: PARK_TIMES[0] })).toEqual({
				parked: expect.stringMatching(/^_pool-cli-\d+$/),
				trashed: [],
			})
			const [entry] = poolEntriesOf(worktreesFolder)
			expect(readPoolFile({ worktreesFolder, name: entry })).toMatchObject({
				lockKey: computeLockKey({ text: lockText }),
				packages: { 'node_modules/demo': '1.0.0' },
			})
		})

		it('save, a node_modules that differs from its lock → refused with the reason, no pool entry, node_modules left', () => {
			const worktreesFolder = createWorktreesFolder()
			// the fake node_modules holds demo 1.0.0; this lockfile locks demo 2.0.0
			const checkout = createWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: MISMATCHED_LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.save({ checkout, now: PARK_TIMES[0] })).toEqual({
				refused: expect.stringContaining('package(s) differ from package-lock.json'),
			})
			expect(poolEntriesOf(worktreesFolder)).toEqual([])
			expect(existsSync(join(checkout, 'node_modules'))).toBe(true)
		})

		it("list, an entry of the new shape, one of the old and another repository's → only the repository's new one", () => {
			const worktreesFolder = createWorktreesFolder()
			writePoolEntry({ worktreesFolder, name: '_pool-cli-1', entry: entryFile({}) })
			writeOldShapeEntry({ worktreesFolder, name: '_pool-cli-2' })
			writePoolEntry({
				worktreesFolder,
				name: '_pool-core-1',
				entry: entryFile({ repository: 'core' }),
			})
			const { spawner } = createRecordingSpawner()
			const cache = createPoolCache({
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				spawner,
			})

			expect(cache.list()).toEqual([{ name: '_pool-cli-1', file: entryFile({}) }])
		})
	},
)

describe('parkNodeModules: the cap and the per-key limit', { timeout: POOL_UNIT_CASE_MS }, () => {
	it.each([
		{ label: 'cap 3, two entries already', cap: 3, existing: 2, trashed: [] },
		{ label: 'cap 3, three entries already', cap: 3, existing: 3, trashed: ['_pool-cli-1'] },
		{ label: 'cap 4, four entries already', cap: 4, existing: 4, trashed: ['_pool-cli-1'] },
		{ label: 'cap 4, three entries already', cap: 4, existing: 3, trashed: [] },
		{
			label: 'cap 3, five entries already',
			cap: 3,
			existing: 5,
			trashed: ['_pool-cli-1', '_pool-cli-2', '_pool-cli-3'],
		},
	])(
		'$label, each of its own key → the park trashes $trashed: the oldest of the repository past the cap',
		({ cap, existing, trashed }) => {
			const worktreesFolder = createWorktreesFolder()
			for (let n = 1; n <= existing; n++)
				writePoolEntry({
					worktreesFolder,
					name: `_pool-cli-${n}`,
					entry: entryFile({ lock: keyedLockOf(n), parkedAt: hourOf(n) }),
				})
			const worktree = createWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: LOCK_TEXT,
			})
			const { spawner } = createRecordingSpawner()

			const parked = parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: hourOf(existing + 1),
				spawner,
				cap,
			})

			expect(parked).toEqual({
				entry: expect.stringMatching(/^_pool-cli-\d+$/),
				trashed: expect.any(Array),
			})
			// the trashed names in any order
			expect(typeof parked === 'string' ? parked : [...parked.trashed].sort()).toEqual(trashed)
			expect(poolEntriesOf(worktreesFolder)).toHaveLength(Math.min(existing + 1, cap))
		},
	)

	it('no cap given, the repository with three lots open together and three entries of their own keys → the park reads the cap, 3: the oldest trashed, three left', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createStoreRepository({ parent: join(worktreesFolder, '..') })
		writeThreeOpenLots(repository)
		for (let n = 1; n <= 3; n++)
			writePoolEntry({
				worktreesFolder,
				name: `_pool-cli-${n}`,
				entry: entryFile({ lock: keyedLockOf(n), parkedAt: hourOf(n) }),
			})
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()

		expect(
			parkNodeModules({ worktree, repository, worktreesFolder, now: hourOf(4), spawner }),
		).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: ['_pool-cli-1'] })
		expect(poolEntriesOf(worktreesFolder)).toHaveLength(3)
	})

	it('the same through createPoolCache save, no cap given → the cache reads the cap, 3: the oldest trashed, three left', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createStoreRepository({ parent: join(worktreesFolder, '..') })
		writeThreeOpenLots(repository)
		for (let n = 1; n <= 3; n++)
			writePoolEntry({
				worktreesFolder,
				name: `_pool-cli-${n}`,
				entry: entryFile({ lock: keyedLockOf(n), parkedAt: hourOf(n) }),
			})
		const checkout = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()
		const cache = createPoolCache({ repository, worktreesFolder, spawner })

		expect(cache.save({ checkout, now: hourOf(4) })).toEqual({
			parked: expect.stringMatching(/^_pool-cli-\d+$/),
			trashed: ['_pool-cli-1'],
		})
		expect(poolEntriesOf(worktreesFolder)).toHaveLength(3)
	})

	it('createPoolCache with cap 3 and three entries of their own keys → a save trashes the oldest, three left', () => {
		const worktreesFolder = createWorktreesFolder()
		for (let n = 1; n <= 3; n++)
			writePoolEntry({
				worktreesFolder,
				name: `_pool-cli-${n}`,
				entry: entryFile({ lock: keyedLockOf(n), parkedAt: hourOf(n) }),
			})
		const checkout = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()
		const cache = createPoolCache({
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			spawner,
			cap: 3,
		})

		expect(cache.save({ checkout, now: hourOf(4) })).toEqual({
			parked: expect.stringMatching(/^_pool-cli-\d+$/),
			trashed: ['_pool-cli-1'],
		})
		expect(poolEntriesOf(worktreesFolder)).toHaveLength(3)
	})

	it('a park with an owner → its pool.json holds the owner', () => {
		const worktreesFolder = createWorktreesFolder()
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()

		parkNodeModules({
			worktree,
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			now: hourOf(1),
			spawner,
			owner: 'lot-a',
		})

		const [entry] = poolEntriesOf(worktreesFolder)
		expect(readPoolFile({ worktreesFolder, name: entry })).toMatchObject({ owner: 'lot-a' })
	})

	it('a cache save with an owner → its pool.json holds the owner', () => {
		const worktreesFolder = createWorktreesFolder()
		const checkout = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()
		const cache = createPoolCache({
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			spawner,
		})

		cache.save({ checkout, now: hourOf(1), owner: 'lot-a' })

		const [entry] = poolEntriesOf(worktreesFolder)
		expect(readPoolFile({ worktreesFolder, name: entry })).toMatchObject({ owner: 'lot-a' })
	})

	it('a park making a third entry of one key, under the cap → the oldest of that key trashed, the older entry of another key stays', () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ lock: keyedLockOf(1), parkedAt: hourOf(1) }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: hourOf(2) }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-3',
			entry: entryFile({ parkedAt: hourOf(3) }),
		})
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const { spawner } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: hourOf(4),
				spawner,
				cap: 8,
			}),
		).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: ['_pool-cli-2'] })
		expect(existsSync(join(worktreesFolder, '_pool-cli-1'))).toBe(true)
		expect(existsSync(join(worktreesFolder, '_pool-cli-3'))).toBe(true)
	})
})

describe('takePooledNodeModules: owner first', { timeout: POOL_UNIT_CASE_MS }, () => {
	it.each([
		{ label: "the owner's newest of two of its own", owner: 'lot-a', taken: '_pool-cli-2' },
		{ label: "the newest: none is the owner's", owner: 'lot-c', taken: '_pool-cli-3' },
		{ label: 'the newest: no owner given', owner: undefined, taken: '_pool-cli-3' },
	])('three matching entries (lot-a, lot-a, then lot-b newest) → $label', ({ owner, taken }) => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ parkedAt: hourOf(1), owner: 'lot-a' }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: hourOf(2), owner: 'lot-a' }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-3',
			entry: entryFile({ parkedAt: hourOf(3), owner: 'lot-b' }),
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0004-cli-y',
			lock: LOCK_TEXT,
		})

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				...(owner !== undefined && { owner }),
			}),
		).toEqual({ taken })
	})

	it("the owner's entry the newest but of another key → the entry of the checkout's key taken, the owner's stays", () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ lock: keyedLockOf(1), parkedAt: hourOf(2), owner: 'lot-a' }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: hourOf(1), owner: 'lot-b' }),
		})
		const worktree = createBareWorktreeFolder({
			worktreesFolder,
			name: '0003-cli-y',
			lock: LOCK_TEXT,
		})

		expect(
			takePooledNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				owner: 'lot-a',
			}),
		).toEqual({ taken: '_pool-cli-2' })
		expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
	})

	it("restore with an owner whose entry is the newest but of another key → the entry of lockText's key taken, the owner's stays", () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ lock: keyedLockOf(1), parkedAt: hourOf(2), owner: 'lot-a' }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: hourOf(1), owner: 'lot-b' }),
		})
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0003-cli-y',
			lock: LOCK_TEXT,
		})
		const { spawner } = createRecordingSpawner()
		const cache = createPoolCache({
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			spawner,
		})

		expect(cache.restore({ checkout, lockText: LOCK_TEXT, owner: 'lot-a' })).toEqual({
			taken: '_pool-cli-2',
		})
		expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
	})

	it("restore with an owner, its entry older than another's → the owner's entry taken", () => {
		const worktreesFolder = createWorktreesFolder()
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			entry: entryFile({ parkedAt: hourOf(1), owner: 'lot-a' }),
		})
		writePoolEntry({
			worktreesFolder,
			name: '_pool-cli-2',
			entry: entryFile({ parkedAt: hourOf(2), owner: 'lot-b' }),
		})
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0003-cli-y',
			lock: LOCK_TEXT,
		})
		const { spawner } = createRecordingSpawner()
		const cache = createPoolCache({
			repository: repositoryOf({ worktreesFolder }),
			worktreesFolder,
			spawner,
		})

		expect(cache.restore({ checkout, lockText: LOCK_TEXT, owner: 'lot-a' })).toEqual({
			taken: '_pool-cli-1',
		})
	})
})

describe(
	'readPoolCap: the most lots of the repository open at once',
	{ timeout: POOL_UNIT_CASE_MS },
	() => {
		it('a repository with no store lot → the floor, 2', () => {
			const repository = createStoreRepository()

			expect(readPoolCap({ repository })).toBe(2)
		})

		it.each([
			{
				label: 'a folder that does not exist',
				make: () => join(realpathSync(temporaryFolder('dialecte-pool-cap-')), 'cli'),
			},
			{
				label: 'a plain folder, no git checkout',
				make: () => realpathSync(temporaryFolder('dialecte-pool-cap-')),
			},
		])('$label → the floor, 2', ({ make }) => {
			const repository = make()

			expect(readPoolCap({ repository })).toBe(2)
		})

		it('three lots open together in a sibling repository core, none in cli → cli gets the floor, 2', () => {
			const parent = realpathSync(temporaryFolder('dialecte-pool-cap-'))
			const repository = createStoreRepository({ parent, name: 'cli' })
			writeThreeOpenLots(createStoreRepository({ parent, name: 'core' }))

			expect(readPoolCap({ repository })).toBe(2)
		})

		it('a lot whose card comes after its last transition → open until the card: it meets two later lots, 3', () => {
			const repository = createStoreRepository()
			writeStoreLot({
				repository,
				name: '0001-cli-a',
				at: ['2026-11-08T09:00:00.000Z', '2026-11-08T10:00:00.000Z'],
			})
			writeLotCard({ repository, lot: '0001-cli-a', at: '2026-11-08T12:00:00.000Z' })
			writeStoreLot({
				repository,
				name: '0002-cli-b',
				at: ['2026-11-08T11:00:00.000Z', '2026-11-08T11:30:00.000Z'],
			})
			writeStoreLot({
				repository,
				name: '0003-cli-c',
				at: ['2026-11-08T11:15:00.000Z', '2026-11-08T11:45:00.000Z'],
			})

			expect(readPoolCap({ repository })).toBe(3)
		})

		it('one lot → the floor, 2', () => {
			const repository = createStoreRepository()
			writeStoreLot({
				repository,
				name: '0001-cli-a',
				at: ['2026-11-08T09:00:00.000Z', '2026-11-08T12:00:00.000Z'],
			})

			expect(readPoolCap({ repository })).toBe(2)
		})

		it('three lots open together, a fourth after they closed → 3', () => {
			const repository = createStoreRepository()
			writeStoreLot({
				repository,
				name: '0001-cli-a',
				at: ['2026-11-08T09:00:00.000Z', '2026-11-08T12:00:00.000Z'],
			})
			writeStoreLot({
				repository,
				name: '0002-cli-b',
				at: ['2026-11-08T10:00:00.000Z', '2026-11-08T10:30:00.000Z', '2026-11-08T11:30:00.000Z'],
			})
			writeStoreLot({
				repository,
				name: '0003-cli-c',
				at: ['2026-11-08T11:00:00.000Z', '2026-11-08T13:00:00.000Z'],
			})
			writeStoreLot({
				repository,
				name: '0004-cli-d',
				at: ['2026-11-08T14:00:00.000Z', '2026-11-08T15:00:00.000Z'],
			})

			expect(readPoolCap({ repository })).toBe(3)
		})

		it('three lots one after the other, none overlapping → the floor, 2', () => {
			const repository = createStoreRepository()
			writeStoreLot({
				repository,
				name: '0001-cli-a',
				at: ['2026-11-08T09:00:00.000Z', '2026-11-08T09:30:00.000Z'],
			})
			writeStoreLot({
				repository,
				name: '0002-cli-b',
				at: ['2026-11-08T10:00:00.000Z', '2026-11-08T10:30:00.000Z'],
			})
			writeStoreLot({
				repository,
				name: '0003-cli-c',
				at: ['2026-11-08T11:00:00.000Z', '2026-11-08T11:30:00.000Z'],
			})

			expect(readPoolCap({ repository })).toBe(2)
		})

		it('four lots whose transitions overlap, one closed by its card before the others opened → 3', () => {
			const repository = createStoreRepository()
			writeStoreLot({
				repository,
				name: '0001-cli-a',
				at: ['2026-11-08T09:00:00.000Z', '2026-11-08T12:00:00.000Z'],
			})
			writeStoreLot({
				repository,
				name: '0002-cli-b',
				at: ['2026-11-08T09:10:00.000Z', '2026-11-08T12:00:00.000Z'],
			})
			// its transitions span the others; its card closes it before any of them opens
			writeStoreLot({
				repository,
				name: '0003-cli-c',
				at: ['2026-11-08T08:00:00.000Z', '2026-11-08T13:00:00.000Z'],
			})
			writeLotCard({ repository, lot: '0003-cli-c', at: '2026-11-08T08:30:00.000Z' })
			writeStoreLot({
				repository,
				name: '0004-cli-d',
				at: ['2026-11-08T10:00:00.000Z', '2026-11-08T11:00:00.000Z'],
			})

			expect(readPoolCap({ repository })).toBe(3)
		})

		it('ten lots open together → the ceiling, 8', () => {
			const repository = createStoreRepository()
			for (let n = 1; n <= 10; n++)
				writeStoreLot({
					repository,
					name: `${String(n).padStart(4, '0')}-cli-l${n}`,
					at: [`2026-11-08T09:${String(n).padStart(2, '0')}:00.000Z`, '2026-11-08T12:00:00.000Z'],
				})

			expect(readPoolCap({ repository })).toBe(8)
		})
	},
)
