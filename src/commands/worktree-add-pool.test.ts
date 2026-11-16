import { existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { initializeRepository, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { MARKER_FILE, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
import { createFakeNpm, poolEntryOf, readTree, writePoolEntry } from '../../test/worktree-pool.ts'
import { computeLockKey } from '../lib/worktree/lock-key.ts'
import { runWorktreeAdd } from './worktree.ts'

import { describe, expect, it } from 'vitest'

import type { NpmRunner } from '../lib/worktree/worktree.types.ts'

/** The lock of a cli depending on `demo` and on its sibling `core` through `file:../core`. */
const LOCK_PACKAGES = {
	'': {
		name: '@dialecte/cli',
		devDependencies: { '@dialecte/core': 'file:../core', demo: '1.0.0' },
	},
	'../core': { name: '@dialecte/core', version: '0.7.0' },
	'node_modules/@dialecte/core': { resolved: '../core', link: true },
	'node_modules/demo': { version: '1.0.0' },
}

const LOCK_TEXT = `${JSON.stringify({ name: '@dialecte/cli', lockfileVersion: 3, packages: LOCK_PACKAGES }, null, 2)}\n`

/**
 * A workspace (real path) holding the sibling `core` and the repository `cli`: package.json and lockfile
 * committed, the main checkout's node_modules installed from that lock with a marker of its own.
 */
function createWorkspace(): { workspace: string; cli: string; core: string } {
	const workspace = realpathSync(temporaryFolder('dialecte-worktree-pool-'))
	const core = join(workspace, 'core')
	writeFiles({ root: core, files: { 'package.json': '{ "name": "@dialecte/core" }\n' } })
	const cli = initializeRepository({
		root: join(workspace, 'cli'),
		files: {
			'.gitignore': 'node_modules\n',
			'package.json': `${JSON.stringify({ name: '@dialecte/cli', devDependencies: { '@dialecte/core': 'file:../core', demo: '1.0.0' } }, null, 2)}\n`,
			'package-lock.json': LOCK_TEXT,
		},
	})
	writeFiles({
		root: cli,
		files: {
			'node_modules/demo/package.json': '{ "name": "demo", "version": "1.0.0" }\n',
			'node_modules/main-only.txt': 'from the main checkout\n',
		},
	})
	mkdirSync(join(cli, 'node_modules', '@dialecte'), { recursive: true })
	symlinkSync('../../../core', join(cli, 'node_modules', '@dialecte', 'core'))
	return { workspace, cli, core }
}

/** A pool entry for `cli` as a park leaves it: the lockfile's lock key, the `core` link absolute, a marker. */
function poolEntryFor(params: { workspace: string; core: string; name: string; parkedAt: string }) {
	return writePoolEntry({
		worktreesFolder: join(params.workspace, '.worktrees'),
		name: params.name,
		entry: poolEntryOf({ repository: 'cli', lock: LOCK_TEXT, parkedAt: params.parkedAt }),
		marker: 'pooled\n',
		outsideTarget: params.core,
	})
}

/**
 * What `npm ci` writes for LOCK_TEXT: `demo` 1.0.0, the `@dialecte/core` link reaching `../core` from the worktree
 * (through the sibling link of `.worktrees/`), a marker of its own.
 */
const INSTALLED_CI = {
	packages: { 'node_modules/demo': '1.0.0' },
	links: { 'node_modules/@dialecte/core': '../../../core' },
	marker: 'installed\n',
}

/** An `npm ci` that fails as it does offline: two lines of output, the first the reason. */
const OFFLINE_CI = {
	status: 1,
	output:
		'npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/demo failed',
}

/** `worktree add <cli> <branch>` with npm stood in for by `install` (an npm that must not run, unless given). */
function add(params: {
	workspace: string
	cli: string
	branch: string
	json?: boolean
	install?: NpmRunner
}) {
	return runWorktreeAdd({
		argv: [params.cli, params.branch, ...(params.json ? ['--json'] : [])],
		cwd: params.workspace,
		now: new Date('2026-11-06T10:00:00Z'),
		colour: false,
		install: params.install ?? createFakeNpm({ outcomes: {} }).install,
	})
}

describe('worktree add: the node_modules pool', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('a matching pool entry → the card says `node_modules  pooled  _pool-cli-1`, the lockfile row is ✓, no copy ran', () => {
		const { workspace, cli, core } = createWorkspace()
		const entry = poolEntryFor({
			workspace,
			core,
			name: '_pool-cli-1',
			parkedAt: '2026-11-06T09:00:00.000Z',
		})

		const result = add({ workspace, cli, branch: 'feat/thing' })

		const worktree = join(workspace, '.worktrees', '0001-cli-thing')
		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/^│ node_modules +pooled +_pool-cli-1 +\d+\.\d s +│$/m)
		expect(result.output).toMatch(/^│ lockfile +✓ node_modules matches package-lock\.json/m)
		// the pool's folder was renamed in (its marker), never copied from the main checkout (its marker)
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('pooled\n')
		expect(existsSync(join(worktree, 'node_modules/main-only.txt'))).toBe(false)
		expect(existsSync(entry)).toBe(false)
	})

	it('no pool → npm ci --prefer-offline installs it: the card says `installed  npm ci (pool empty)` with its seconds, the lockfile row is ✓, nothing copied from the main checkout', () => {
		const { workspace, cli } = createWorkspace()
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		const result = add({ workspace, cli, branch: 'feat/thing', install: npm.install })

		const worktree = join(workspace, '.worktrees', '0001-cli-thing')
		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(
			/^│ node_modules +installed +npm ci \(pool empty\) +\d+\.\d s +│$/m,
		)
		expect(result.output).toMatch(/^│ lockfile +✓ node_modules matches package-lock\.json/m)
		expect(npm.calls.map((call) => call.args)).toEqual([['ci', '--prefer-offline']])
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('installed\n')
		expect(existsSync(join(worktree, 'node_modules/main-only.txt'))).toBe(false)
	})

	it('npm ci fails (offline) → the card says `copy-on-write  npm ci failed: <its first line>`, --json nodeModules.reason the same line, node_modules copied from the main checkout', () => {
		const { workspace, cli } = createWorkspace()

		const card = add({
			workspace,
			cli,
			branch: 'feat/one',
			install: createFakeNpm({ outcomes: { ci: OFFLINE_CI } }).install,
		})
		const json = JSON.parse(
			add({
				workspace,
				cli,
				branch: 'feat/two',
				json: true,
				install: createFakeNpm({ outcomes: { ci: OFFLINE_CI } }).install,
			}).output,
		)

		expect(card.exitCode).toBe(0)
		expect(card.output).toMatch(
			/^│ node_modules +copy-on-write +npm ci failed: npm error code ENOTFOUND +\d+\.\d s +│$/m,
		)
		expect(
			existsSync(join(workspace, '.worktrees', '0001-cli-one', 'node_modules/main-only.txt')),
		).toBe(true)
		expect(json.nodeModules).toMatchObject({
			method: 'copy-on-write',
			miss: 'pool empty',
			reason: 'npm error code ENOTFOUND',
		})
	})

	it('an entry of the lockfile 1 package off → taken near, completed by npm install --prefer-offline --no-save: the card says `near  _pool-cli-1, 1 package(s) differ`, --json { method: near, from, drift }', () => {
		const { workspace, cli, core } = createWorkspace()
		writePoolEntry({
			worktreesFolder: join(workspace, '.worktrees'),
			name: '_pool-cli-1',
			entry: poolEntryOf({
				repository: 'cli',
				lock: 'another lockfile\n',
				parkedAt: '2026-11-06T09:00:00.000Z',
				packages: { 'node_modules/@dialecte/core': '../core', 'node_modules/demo': '0.9.0' },
			}),
			marker: 'pooled\n',
			outsideTarget: core,
		})
		writePoolEntry({
			worktreesFolder: join(workspace, '.worktrees'),
			name: '_pool-cli-2',
			entry: poolEntryOf({
				repository: 'cli',
				lock: 'a third lockfile\n',
				parkedAt: '2026-11-06T09:30:00.000Z',
				packages: { 'node_modules/@dialecte/core': '../core', 'node_modules/demo': '0.9.0' },
			}),
			marker: 'pooled\n',
			outsideTarget: core,
		})
		const npm = createFakeNpm({
			outcomes: { install: { packages: { 'node_modules/demo': '1.0.0' } } },
		})

		const card = add({ workspace, cli, branch: 'feat/one', install: npm.install })
		const json = JSON.parse(
			add({ workspace, cli, branch: 'feat/two', json: true, install: npm.install }).output,
		)

		const worktree = join(workspace, '.worktrees', '0001-cli-one')
		expect(card.exitCode).toBe(0)
		expect(card.output).toMatch(
			/^│ node_modules +near +_pool-cli-\d, 1 package\(s\) differ +\d+\.\d s +│$/m,
		)
		expect(readTree(join(worktree, 'node_modules'))[MARKER_FILE]).toBe('pooled\n')
		expect(json.nodeModules).toMatchObject({
			method: 'near',
			from: expect.stringMatching(/^_pool-cli-\d$/),
			drift: 1,
		})
		expect(npm.calls.map((call) => call.args)).toEqual([
			['install', '--prefer-offline', '--no-save'],
			['install', '--prefer-offline', '--no-save'],
		])
	})

	it('a pool entry of another lockfile only, past the drift limit → installed by npm ci, the entry left where it was, --json nodeModules { method: installed, miss: no entry for install and the key }', () => {
		const { workspace, cli, core } = createWorkspace()
		const entry = writePoolEntry({
			worktreesFolder: join(workspace, '.worktrees'),
			name: '_pool-cli-1',
			entry: poolEntryOf({
				repository: 'cli',
				lock: 'another lockfile\n',
				parkedAt: '2026-11-06T09:00:00.000Z',
				packages: {
					'node_modules/a': '1.0.0',
					'node_modules/b': '1.0.0',
					'node_modules/c': '1.0.0',
					'node_modules/d': '1.0.0',
					'node_modules/e': '1.0.0',
					'node_modules/f': '1.0.0',
				},
			}),
			marker: 'pooled\n',
			outsideTarget: core,
		})
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		const result = add({ workspace, cli, branch: 'feat/thing', json: true, install: npm.install })

		expect(result.exitCode).toBe(0)
		expect(JSON.parse(result.output).nodeModules).toMatchObject({
			method: 'installed',
			miss: `no entry for install ${computeLockKey({ text: LOCK_TEXT }).slice(0, 8)}`,
		})
		expect(existsSync(join(entry, 'node_modules'))).toBe(true)
	})

	it('--json → nodeModules { method, from, seconds } and no miss for a pooled one, { method: installed, seconds, miss: pool empty } for the npm ci after it', () => {
		const { workspace, cli, core } = createWorkspace()
		poolEntryFor({ workspace, core, name: '_pool-cli-1', parkedAt: '2026-11-06T09:00:00.000Z' })
		const npm = createFakeNpm({ outcomes: { ci: INSTALLED_CI } })

		const pooled = JSON.parse(
			add({ workspace, cli, branch: 'feat/one', json: true, install: npm.install }).output,
		)
		const installed = JSON.parse(
			add({ workspace, cli, branch: 'feat/two', json: true, install: npm.install }).output,
		)

		expect(pooled.nodeModules).toMatchObject({
			method: 'pooled',
			from: '_pool-cli-1',
			seconds: expect.any(Number),
		})
		expect(installed.nodeModules).toMatchObject({
			method: 'installed',
			seconds: expect.any(Number),
		})
		expect(installed.nodeModules).not.toHaveProperty('from')
		expect(pooled.nodeModules).not.toHaveProperty('miss')
		expect(installed.nodeModules).toMatchObject({ miss: 'pool empty' })
	})
})
