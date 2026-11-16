import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import {
	LOCK_TEXT,
	OTHER_LOCK_TEXT,
	PARK_TIMES,
	POOL_UNIT_CASE_MS,
} from '../../../test/worktree-pool.constants.ts'
import {
	createBareWorktreeFolder,
	createWorktreeFolder,
	createWorktreesFolder,
	poolEntryOf,
	writePoolEntry,
} from '../../../test/worktree-pool.ts'
import { provideNodeModules } from './add-worktree.ts'
import { computeLockKey } from './lock-key.ts'

import { describe, expect, it } from 'vitest'

/**
 * The repository the worktrees belong to: its main checkout beside `.worktrees/`, holding a node_modules to copy and a
 * lock of its own (neither LOCK_TEXT nor OTHER_LOCK_TEXT): a key read from it names neither checkout's lock.
 */
function createRepository(params: { worktreesFolder: string }): string {
	return createWorktreeFolder({
		worktreesFolder: join(params.worktreesFolder, '..'),
		name: 'cli',
		lock: '{"name":"demo","lockfileVersion":3,"packages":{"node_modules/main-only":{"version":"1.0.0"}}}\n',
	})
}

/** A pool entry of `repository` (`cli` unless given) stamped with `lock`'s key (LOCK_TEXT unless given). */
function writeEntry(params: {
	worktreesFolder: string
	name: string
	repository?: string
	lock?: string
	parkedAt?: Date
}): string {
	return writePoolEntry({
		worktreesFolder: params.worktreesFolder,
		name: params.name,
		entry: poolEntryOf({
			repository: params.repository ?? 'cli',
			lock: params.lock ?? LOCK_TEXT,
			parkedAt: (params.parkedAt ?? PARK_TIMES[0]).toISOString(),
		}),
	})
}

describe('provideNodeModules: why the pool gave nothing', { timeout: POOL_UNIT_CASE_MS }, () => {
	it.each([
		{ label: 'an empty pool', entries: [] },
		{
			label: "another repository's entries only",
			entries: [{ name: '_pool-core-1', repository: 'core' }],
		},
	])('$label → the copy names pool empty', ({ entries }) => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		for (const entry of entries) writeEntry({ worktreesFolder, ...entry })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
			}),
		).toMatchObject({ miss: 'pool empty' })
	})

	it("entries of the repository, none with the checkout's lock key → the copy names no entry for install and the key's first 8 characters", () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({ worktreesFolder, name: '_pool-cli-1', lock: OTHER_LOCK_TEXT })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
			}),
		).toMatchObject({
			miss: `no entry for install ${computeLockKey({ text: LOCK_TEXT }).slice(0, 8)}`,
		})
	})

	it('the matching entry renamed away by another taker between its pick and its rename → the copy names entry busy', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const entry = writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})
		const elsewhere = join(worktreesFolder, 'taken-by-the-first')

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				afterPick: function firstTakerWins() {
					mkdirSync(elsewhere)
					renameSync(join(entry, 'node_modules'), join(elsewhere, 'node_modules'))
				},
			}),
		).toMatchObject({ miss: 'entry busy' })
	})

	it('the rename of the matching entry finds it gone (ENOENT) → the copy names entry busy', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				rename: function takenByAnother() {
					throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
				},
			}),
		).toMatchObject({ miss: 'entry busy' })
	})

	it('the rename of the matching entry fails with EXDEV → the copy names cross-device, the entry keeps its node_modules', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const entry = writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				rename: function acrossDevices() {
					throw Object.assign(new Error('EXDEV: cross-device link not permitted'), {
						code: 'EXDEV',
					})
				},
			}),
		).toMatchObject({ miss: 'cross-device' })
		expect(existsSync(join(entry, 'node_modules'))).toBe(true)
	})

	it('no pool to ask (worktreesFolder undefined), a node_modules to copy → the copy carries no miss', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder: undefined,
				from: join(repository, 'node_modules'),
			}),
		).not.toHaveProperty('miss')
	})

	it('one entry, two checkouts in a row → the first takes it with no miss, the second names pool empty', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const first = createBareWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const second = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})

		const taken = provideNodeModules({
			checkout: first,
			repository,
			worktreesFolder,
			from: join(repository, 'node_modules'),
		})
		const copied = provideNodeModules({
			checkout: second,
			repository,
			worktreesFolder,
			from: join(repository, 'node_modules'),
		})

		expect(taken).toEqual({ method: 'pooled', from: '_pool-cli-1', seconds: expect.any(Number) })
		expect(taken).not.toHaveProperty('miss')
		expect(copied).toMatchObject({ miss: 'pool empty' })
	})
})
