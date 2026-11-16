import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

import {
	KEPT_FILE,
	LOCK_TEXT,
	MARKER_FILE,
	OTHER_LOCK_TEXT,
	PARK_TIMES,
	POOL_UNIT_CASE_MS,
} from '../../../test/worktree-pool.constants.ts'
import {
	createBareWorktreeFolder,
	createFakeNpm,
	createRecordingSpawner,
	createWorktreeFolder,
	createWorktreesFolder,
	poolEntryOf,
	readTree,
	trashedNamesOf,
	writePoolEntry,
} from '../../../test/worktree-pool.ts'
import { provideNodeModules } from './add-worktree.ts'
import { computeLockKey } from './lock-key.ts'

import { describe, expect, it } from 'vitest'

/**
 * The repository the worktrees belong to: its main checkout beside `.worktrees/`, holding a node_modules to copy and a
 * lock of its own (neither LOCK_TEXT nor OTHER_LOCK_TEXT): a key read from it names neither checkout's lock.
 */
function createRepository(params: { worktreesFolder: string; name?: string }): string {
	return createWorktreeFolder({
		worktreesFolder: join(params.worktreesFolder, '..'),
		name: params.name ?? 'cli',
		lock: '{"name":"demo","lockfileVersion":3,"packages":{"node_modules/main-only":{"version":"1.0.0"}}}\n',
	})
}

/**
 * A pool entry of `repository` (`cli` unless given) stamped with `lock`'s key (LOCK_TEXT unless given) and `packages`
 * (none unless given), its node_modules holding the marker `marker` when given.
 */
function writeEntry(params: {
	worktreesFolder: string
	name: string
	repository?: string
	lock?: string
	parkedAt?: Date
	packages?: Record<string, string>
	marker?: string
}): string {
	return writePoolEntry({
		worktreesFolder: params.worktreesFolder,
		name: params.name,
		entry: poolEntryOf({
			repository: params.repository ?? 'cli',
			lock: params.lock ?? LOCK_TEXT,
			parkedAt: (params.parkedAt ?? PARK_TIMES[0]).toISOString(),
			packages: params.packages,
		}),
		marker: params.marker,
	})
}

/** The packages a near case's checkout locks: `node_modules/a` to `node_modules/f`, each at 1.0.0. */
const CHECKOUT_PACKAGES: Record<string, string> = {
	'node_modules/a': '1.0.0',
	'node_modules/b': '1.0.0',
	'node_modules/c': '1.0.0',
	'node_modules/d': '1.0.0',
	'node_modules/e': '1.0.0',
	'node_modules/f': '1.0.0',
}

/** CHECKOUT_PACKAGES with the first `count` of them at 2.0.0: `count` packages differ. */
function packagesDifferingIn(count: number): Record<string, string> {
	return Object.fromEntries(
		Object.entries(CHECKOUT_PACKAGES).map(([key, version], index) => [
			key,
			index < count ? '2.0.0' : version,
		]),
	)
}

/** A lockfile installing `packages` (lock key to version). */
function lockOf(packages: Record<string, string>): string {
	return `${JSON.stringify({
		name: 'demo',
		lockfileVersion: 3,
		packages: {
			'': { name: 'demo' },
			...Object.fromEntries(Object.entries(packages).map(([key, version]) => [key, { version }])),
		},
	})}\n`
}

/** The lock of a near case's checkout: CHECKOUT_PACKAGES. */
const CHECKOUT_LOCK = lockOf(CHECKOUT_PACKAGES)

/** An npm ci that installs the checkout's lock with the marker `installed`. */
const INSTALLED_CI = { packages: CHECKOUT_PACKAGES, marker: 'installed\n' }

/** An npm ci that fails as it does offline: two lines of output, the first the reason. */
const OFFLINE_CI = {
	status: 1,
	output:
		'npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/a failed',
}

describe('provideNodeModules: why the pool gave nothing', { timeout: POOL_UNIT_CASE_MS }, () => {
	it.each([
		{ label: 'an empty pool', entries: [] },
		{
			label: "another repository's entries only",
			entries: [{ name: '_pool-core-1', repository: 'core' }],
		},
	])('$label → npm ci installs it, the source names pool empty', ({ entries }) => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		for (const entry of entries) writeEntry({ worktreesFolder, ...entry })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
			}),
		).toMatchObject({ method: 'installed', miss: 'pool empty' })
	})

	it("entries of the repository, none with the checkout's lock key nor within the drift limit → npm ci installs it, the source names no entry for install and the key's first 8 characters", () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			lock: OTHER_LOCK_TEXT,
			packages: packagesDifferingIn(6),
		})
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
			}),
		).toMatchObject({
			method: 'installed',
			miss: `no entry for install ${computeLockKey({ text: LOCK_TEXT }).slice(0, 8)}`,
		})
	})

	it('the matching entry renamed away by another taker between its pick and its rename → npm ci installs it, the source names entry busy', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const entry = writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})
		const elsewhere = join(worktreesFolder, 'taken-by-the-first')
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				afterPick: function firstTakerWins() {
					mkdirSync(elsewhere)
					renameSync(join(entry, 'node_modules'), join(elsewhere, 'node_modules'))
				},
			}),
		).toMatchObject({ method: 'installed', miss: 'entry busy' })
	})

	it('the rename of the matching entry finds it gone (ENOENT) → npm ci installs it, the source names entry busy', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				rename: function takenByAnother() {
					throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
				},
			}),
		).toMatchObject({ method: 'installed', miss: 'entry busy' })
	})

	it('the rename of the matching entry fails with EXDEV → npm ci installs it, the source names cross-device, the entry keeps its node_modules', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const entry = writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				rename: function acrossDevices() {
					throw Object.assign(new Error('EXDEV: cross-device link not permitted'), {
						code: 'EXDEV',
					})
				},
			}),
		).toMatchObject({ method: 'installed', miss: 'cross-device' })
		expect(existsSync(join(entry, 'node_modules'))).toBe(true)
	})

	it('no pool to ask (worktreesFolder undefined) → npm ci installs it, the source carries no miss', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: LOCK_TEXT,
		})
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		const provided = provideNodeModules({
			checkout,
			repository,
			worktreesFolder: undefined,
			from: join(repository, 'node_modules'),
			install: npm.install,
		})

		expect(provided).toMatchObject({ method: 'installed' })
		expect(provided).not.toHaveProperty('miss')
	})

	it('one entry, two checkouts in a row → the first takes it with no miss and no npm run, the second is installed by npm ci and names pool empty', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({ worktreesFolder, name: '_pool-cli-1' })
		const first = createBareWorktreeFolder({ worktreesFolder, name: '0001-cli-x', lock: LOCK_TEXT })
		const second = createBareWorktreeFolder({
			worktreesFolder,
			name: '0002-cli-y',
			lock: LOCK_TEXT,
		})

		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		const taken = provideNodeModules({
			checkout: first,
			repository,
			worktreesFolder,
			from: join(repository, 'node_modules'),
			install: npm.install,
		})
		const callsAfterTake = npm.calls.length
		const installed = provideNodeModules({
			checkout: second,
			repository,
			worktreesFolder,
			from: join(repository, 'node_modules'),
			install: npm.install,
		})

		expect(taken).toEqual({ method: 'pooled', from: '_pool-cli-1', seconds: expect.any(Number) })
		expect(taken).not.toHaveProperty('miss')
		expect(callsAfterTake).toBe(0)
		expect(installed).toMatchObject({ method: 'installed', miss: 'pool empty' })
	})
})

/** The args of the incremental install after a near take, and of the clean install. */
const NEAR_INSTALL = ['install', '--prefer-offline', '--no-save']
const CLEAN_INSTALL = ['ci', '--prefer-offline']

/** The miss a restore answers when the repository has entries, none with `lock`'s key nor near it. */
function noEntryMissOf(lock: string): string {
	return `no entry for install ${computeLockKey({ text: lock }).slice(0, 8)}`
}

describe('provideNodeModules: the miss order', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('no entry with the lock key, one 1 package off → taken, npm install --prefer-offline --no-save completes it, the check passes: near with its entry and drift', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const entry = writeEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			lock: OTHER_LOCK_TEXT,
			packages: packagesDifferingIn(1),
			marker: 'pooled\n',
		})
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})
		const npm = createFakeNpm({ outcomes: { install: { packages: CHECKOUT_PACKAGES } } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				spawner: createRecordingSpawner().spawner,
			}),
		).toEqual({ method: 'near', from: '_pool-cli-1', drift: 1, seconds: expect.any(Number) })
		expect(npm.calls).toEqual([{ checkout, args: NEAR_INSTALL, hadNodeModules: true }])
		// the entry's own node_modules, completed in place: never a fresh install
		expect(readTree(join(checkout, 'node_modules'))[MARKER_FILE]).toBe('pooled\n')
		expect(existsSync(join(entry, 'node_modules'))).toBe(false)
	})

	it.each([
		{ differing: 5, provided: { method: 'near', from: '_pool-cli-1', drift: 5 } },
		{ differing: 6, provided: { method: 'installed', miss: noEntryMissOf(CHECKOUT_LOCK) } },
	])(
		'the only entry $differing packages off (the drift limit 5) → $provided.method',
		({ differing, provided }) => {
			const worktreesFolder = createWorktreesFolder()
			const repository = createRepository({ worktreesFolder })
			writeEntry({
				worktreesFolder,
				name: '_pool-cli-1',
				lock: OTHER_LOCK_TEXT,
				packages: packagesDifferingIn(differing),
			})
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: CHECKOUT_LOCK,
			})
			const npm = createFakeNpm({
				outcomes: { install: { packages: CHECKOUT_PACKAGES }, ci: INSTALLED_CI },
			})

			expect(
				provideNodeModules({
					checkout,
					repository,
					worktreesFolder,
					from: join(repository, 'node_modules'),
					install: npm.install,
					spawner: createRecordingSpawner().spawner,
				}),
			).toEqual({ ...provided, seconds: expect.any(Number) })
		},
	)

	it.each([
		{
			label: 'the install fails',
			install: {
				status: 1,
				output: 'npm error code ETARGET\nnpm error notarget No matching version found for a@1.0.0',
			},
			reason: 'npm error code ETARGET',
		},
		{
			label: 'the install passes but the check still lists a package off',
			install: { packages: packagesDifferingIn(1) },
			reason: '2.0.0 installed, lock 1.0.0',
		},
	])(
		'a near entry taken, $label → that node_modules to the trash, then npm ci in a checkout without node_modules, the reason recorded',
		({ install, reason }) => {
			const worktreesFolder = createWorktreesFolder()
			const repository = createRepository({ worktreesFolder })
			writeEntry({
				worktreesFolder,
				name: '_pool-cli-1',
				lock: OTHER_LOCK_TEXT,
				packages: packagesDifferingIn(1),
				marker: 'pooled\n',
			})
			const checkout = createBareWorktreeFolder({
				worktreesFolder,
				name: '0001-cli-x',
				lock: CHECKOUT_LOCK,
			})
			const npm = createFakeNpm({ outcomes: { install, ci: INSTALLED_CI } })
			const { spawner, calls } = createRecordingSpawner()

			const provided = provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				spawner,
			})

			expect(provided).toMatchObject({
				method: 'installed',
				miss: noEntryMissOf(CHECKOUT_LOCK),
				near: { from: '_pool-cli-1', drift: 1, reason: expect.stringContaining(reason) },
			})
			expect(npm.calls).toEqual([
				{ checkout, args: NEAR_INSTALL, hadNodeModules: true },
				{ checkout, args: CLEAN_INSTALL, hadNodeModules: false },
			])
			const trashed = trashedNamesOf(worktreesFolder)
			expect(trashed).toEqual([expect.stringMatching(/^node_modules-/)])
			expect(readTree(join(worktreesFolder, '_trash', trashed[0] ?? ''))[MARKER_FILE]).toBe(
				'pooled\n',
			)
			expect(calls).toEqual([
				{ command: 'rm', args: ['-rf', join(worktreesFolder, '_trash', trashed[0] ?? '')] },
			])
			expect(readTree(join(checkout, 'node_modules'))[MARKER_FILE]).toBe('installed\n')
		},
	)

	it('the install after a near take fails on two lines → the reason is its first line only', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			lock: OTHER_LOCK_TEXT,
			packages: packagesDifferingIn(1),
		})
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})
		const npm = createFakeNpm({
			outcomes: {
				install: { status: 1, output: 'npm error code ETARGET\nnpm error notarget more' },
				ci: INSTALLED_CI,
			},
		})

		const provided = provideNodeModules({
			checkout,
			repository,
			worktreesFolder,
			from: join(repository, 'node_modules'),
			install: npm.install,
			spawner: createRecordingSpawner().spawner,
		})

		expect(provided).toMatchObject({ near: { reason: expect.not.stringContaining('notarget') } })
		expect(provided).toMatchObject({ near: { reason: expect.stringContaining('ETARGET') } })
	})

	it('no entry within the drift limit → npm ci --prefer-offline in the bare checkout, no copy: installed with the miss, the far entry left in the pool', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const entry = writeEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			lock: OTHER_LOCK_TEXT,
			packages: packagesDifferingIn(6),
		})
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				spawner: createRecordingSpawner().spawner,
			}),
		).toEqual({
			method: 'installed',
			miss: noEntryMissOf(CHECKOUT_LOCK),
			seconds: expect.any(Number),
		})
		expect(npm.calls).toEqual([{ checkout, args: CLEAN_INSTALL, hadNodeModules: false }])
		expect(readTree(join(checkout, 'node_modules'))[MARKER_FILE]).toBe('installed\n')
		// nothing of the main checkout's node_modules: no copy ran
		expect(existsSync(join(checkout, 'node_modules', KEPT_FILE))).toBe(false)
		expect(existsSync(join(entry, 'node_modules'))).toBe(true)
	})

	it('npm ci fails (offline) → the copy-on-write copy of `from`, the miss kept, the first line of the npm ci failure as the reason', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})
		const npm = createFakeNpm({ outcomes: { ci: OFFLINE_CI } })

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				spawner: createRecordingSpawner().spawner,
			}),
		).toMatchObject({
			method: expect.stringMatching(/^copy(-on-write)?$/),
			miss: 'pool empty',
			reason: 'npm error code ENOTFOUND',
		})
		expect(npm.calls).toEqual([{ checkout, args: CLEAN_INSTALL, hadNodeModules: false }])
		expect(existsSync(join(checkout, 'node_modules', KEPT_FILE))).toBe(true)
	})

	it('a near entry whose install fails, then npm ci fails → the copy, the npm ci failure as the reason, the near attempt recorded', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		writeEntry({
			worktreesFolder,
			name: '_pool-cli-1',
			lock: OTHER_LOCK_TEXT,
			packages: packagesDifferingIn(2),
		})
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})
		const npm = createFakeNpm({
			outcomes: {
				install: { status: 1, output: 'npm error code ETARGET' },
				ci: OFFLINE_CI,
			},
		})

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				spawner: createRecordingSpawner().spawner,
			}),
		).toMatchObject({
			method: expect.stringMatching(/^copy(-on-write)?$/),
			miss: noEntryMissOf(CHECKOUT_LOCK),
			reason: 'npm error code ENOTFOUND',
			near: { from: '_pool-cli-1', drift: 2, reason: 'npm error code ETARGET' },
		})
		expect(existsSync(join(checkout, 'node_modules', KEPT_FILE))).toBe(true)
	})

	it.each(['cli', 'core', 'plc'])(
		'the repository %s → the same order, no per-repository list: a near entry completed by npm install, then a miss installed by npm ci',
		(name) => {
			const worktreesFolder = createWorktreesFolder()
			const repository = createRepository({ worktreesFolder, name })
			writeEntry({
				worktreesFolder,
				name: `_pool-${name}-1`,
				repository: name,
				lock: OTHER_LOCK_TEXT,
				packages: packagesDifferingIn(1),
			})
			const first = createBareWorktreeFolder({
				worktreesFolder,
				name: `0001-${name}-x`,
				lock: CHECKOUT_LOCK,
			})
			const second = createBareWorktreeFolder({
				worktreesFolder,
				name: `0002-${name}-y`,
				lock: CHECKOUT_LOCK,
			})
			const npm = createFakeNpm({
				outcomes: { install: { packages: CHECKOUT_PACKAGES }, ci: INSTALLED_CI },
			})
			const { spawner } = createRecordingSpawner()

			const near = provideNodeModules({
				checkout: first,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				spawner,
			})
			const installed = provideNodeModules({
				checkout: second,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				install: npm.install,
				spawner,
			})

			expect({ near, installed, args: npm.calls.map((call) => call.args) }).toEqual({
				near: { method: 'near', from: `_pool-${name}-1`, drift: 1, seconds: expect.any(Number) },
				installed: { method: 'installed', miss: 'pool empty', seconds: expect.any(Number) },
				args: [NEAR_INSTALL, CLEAN_INSTALL],
			})
		},
	)
})

describe('the suite switches npm off', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('the test setup sets DIALECTE_NPM_INSTALL=off for every worker: no suite that makes a worktree spawns npm', () => {
		expect(process.env.DIALECTE_NPM_INSTALL).toBe('off')
	})

	it('no install runner given, the switch off → the default runner spawns nothing: the copy of `from`, the miss kept, npm install off as the reason', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})

		expect(
			provideNodeModules({
				checkout,
				repository,
				worktreesFolder,
				from: join(repository, 'node_modules'),
				spawner: createRecordingSpawner().spawner,
			}),
		).toMatchObject({
			method: expect.stringMatching(/^copy(-on-write)?$/),
			miss: 'pool empty',
			reason: 'npm install off (DIALECTE_NPM_INSTALL)',
		})
		expect(existsSync(join(checkout, 'node_modules', KEPT_FILE))).toBe(true)
	})
})

/** The file a failed `npm ci` leaves half written in node_modules. */
const PARTIAL_FILE = 'partial-package/half.js'

/** An npm ci that fails offline after writing PARTIAL_FILE into node_modules. */
const PARTIAL_CI = {
	status: 1,
	output: 'npm error code ENOTFOUND',
	partial: PARTIAL_FILE,
}

/** The paths of the files under `folder` (relative, every depth) that end with PARTIAL_FILE. */
function partialFilesIn(folder: string): string[] {
	return Object.keys(readTree(folder)).filter((path) => path.endsWith(PARTIAL_FILE))
}

describe('provideNodeModules: what a failed npm ci left', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('no pool, discardInto given → the partial node_modules renamed into discardInto, the copy lands clean', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})
		const discardInto = join(worktreesFolder, 'rehearsal-on-its-way-out')
		mkdirSync(discardInto)

		const provided = provideNodeModules({
			checkout,
			repository,
			worktreesFolder: undefined,
			from: join(repository, 'node_modules'),
			install: createFakeNpm({ outcomes: { ci: PARTIAL_CI } }).install,
			spawner: createRecordingSpawner().spawner,
			discardInto,
		})

		expect(provided).toMatchObject({ reason: 'npm error code ENOTFOUND' })
		expect(partialFilesIn(discardInto)).toHaveLength(1)
		expect(existsSync(join(checkout, 'node_modules', PARTIAL_FILE))).toBe(false)
		expect(existsSync(join(checkout, 'node_modules', KEPT_FILE))).toBe(true)
	})

	it("no pool, no discardInto → the partial node_modules renamed into the checkout's own .dialecte/ (discarded-node_modules-<n>), the copy lands clean", () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})

		const provided = provideNodeModules({
			checkout,
			repository,
			worktreesFolder: undefined,
			from: join(repository, 'node_modules'),
			install: createFakeNpm({ outcomes: { ci: PARTIAL_CI } }).install,
			spawner: createRecordingSpawner().spawner,
		})

		const dialecte = join(checkout, '.dialecte')
		expect(provided).toMatchObject({ reason: 'npm error code ENOTFOUND' })
		expect(existsSync(dialecte) ? readdirSync(dialecte) : []).toEqual([
			expect.stringMatching(/^discarded-node_modules-\d+$/),
		])
		expect(partialFilesIn(dialecte)).toHaveLength(1)
		expect(existsSync(join(checkout, 'node_modules', PARTIAL_FILE))).toBe(false)
		expect(existsSync(join(checkout, 'node_modules', KEPT_FILE))).toBe(true)
	})

	it('a pool, no discardInto → the partial node_modules sent to _trash/ (one background rm), the copy lands clean', () => {
		const worktreesFolder = createWorktreesFolder()
		const repository = createRepository({ worktreesFolder })
		const checkout = createBareWorktreeFolder({
			worktreesFolder,
			name: '0001-cli-x',
			lock: CHECKOUT_LOCK,
		})
		const { spawner, calls } = createRecordingSpawner()

		const provided = provideNodeModules({
			checkout,
			repository,
			worktreesFolder,
			from: join(repository, 'node_modules'),
			install: createFakeNpm({ outcomes: { ci: PARTIAL_CI } }).install,
			spawner,
		})

		const trashed = trashedNamesOf(worktreesFolder)
		expect(provided).toMatchObject({ miss: 'pool empty', reason: 'npm error code ENOTFOUND' })
		expect(trashed).toEqual([expect.stringMatching(/^node_modules-/)])
		expect(partialFilesIn(join(worktreesFolder, '_trash', trashed[0] ?? ''))).toHaveLength(1)
		expect(calls).toEqual([
			{ command: 'rm', args: ['-rf', join(worktreesFolder, '_trash', trashed[0] ?? '')] },
		])
		expect(existsSync(join(checkout, 'node_modules', PARTIAL_FILE))).toBe(false)
		expect(existsSync(join(checkout, 'node_modules', KEPT_FILE))).toBe(true)
	})
})
