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
	sha256Of,
	trashedNamesOf,
	writePoolEntry,
} from '../../../test/worktree-pool.ts'
import { checkNodeModules } from './check-node-modules.ts'
import { parkNodeModules, takePooledNodeModules } from './node-modules-pool.ts'

import { describe, expect, it } from 'vitest'

/** The repository the worktrees belong to: its main checkout beside `.worktrees/`. */
function repositoryOf(params: { worktreesFolder: string; name?: string }): string {
	return join(params.worktreesFolder, '..', params.name ?? 'cli')
}

/** The pool entry `name` as a park leaves it for `repository` (`cli` unless given). */
function entryFile(params: { lock?: string; parkedAt?: Date; repository?: string }) {
	return {
		repository: params.repository ?? 'cli',
		lockHash: sha256Of(params.lock ?? LOCK_TEXT),
		parkedAt: (params.parkedAt ?? PARK_TIMES[0]).toISOString(),
	}
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

	it('.vite and .cache removed; every other file kept byte for byte; the entry holds pool.json with repository and lockHash', () => {
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
			lockHash: sha256Of(LOCK_TEXT),
			parkedAt: PARK_TIMES[1].toISOString(),
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
	it('the node_modules checked against lockfile A, the lockfile changed to B before the park → the entry is stamped with A (the hash the check was made against)', () => {
		const worktreesFolder = createWorktreesFolder()
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const check = checkNodeModules({ worktree })
		const checkedLockHash = sha256Of(LOCK_TEXT)
		writeFileSync(join(worktree, 'package-lock.json'), OTHER_LOCK_TEXT)
		const { spawner } = createRecordingSpawner()

		expect(
			parkNodeModules({
				worktree,
				repository: repositoryOf({ worktreesFolder }),
				worktreesFolder,
				now: PARK_TIMES[0],
				spawner,
				check,
				checkedLockHash,
			}),
		).toEqual({ entry: expect.stringMatching(/^_pool-cli-\d+$/), trashed: [] })

		const [entry] = poolEntriesOf(worktreesFolder)
		expect(readPoolFile({ worktreesFolder, name: entry }).lockHash).toBe(sha256Of(LOCK_TEXT))
	})

	it('no checkedLockHash given → the entry is stamped with the lockfile read at park time', () => {
		const worktreesFolder = createWorktreesFolder()
		const worktree = createWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
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
		expect(readPoolFile({ worktreesFolder, name: entry }).lockHash).toBe(sha256Of(LOCK_TEXT))
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
	it('the newest entry with the same lockHash is renamed into the worktree; the entry folder is gone', () => {
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

	it('entries with another lockHash only → nothing taken, answer "no match"', () => {
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

	it("another repository's entry is never taken, whatever its lockHash", () => {
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
