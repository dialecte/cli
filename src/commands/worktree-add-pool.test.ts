import { existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { initializeRepository, temporaryFolder, writeFiles } from '../../test/scratch-repository.ts'
import { MARKER_FILE, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
import { readTree, sha256Of, writePoolEntry } from '../../test/worktree-pool.ts'
import { runWorktreeAdd } from './worktree.ts'

import { describe, expect, it } from 'vitest'

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

/** A pool entry for `cli` as a park leaves it: the lockfile's hash, the `core` link absolute, a marker. */
function poolEntryFor(params: { workspace: string; core: string; name: string; parkedAt: string }) {
	return writePoolEntry({
		worktreesFolder: join(params.workspace, '.worktrees'),
		name: params.name,
		entry: { repository: 'cli', lockHash: sha256Of(LOCK_TEXT), parkedAt: params.parkedAt },
		marker: 'pooled\n',
		outsideTarget: params.core,
	})
}

function add(params: { workspace: string; cli: string; branch: string; json?: boolean }) {
	return runWorktreeAdd({
		argv: [params.cli, params.branch, ...(params.json ? ['--json'] : [])],
		cwd: params.workspace,
		now: new Date('2026-11-06T10:00:00Z'),
		colour: false,
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

	it('no pool → the card says `copy-on-write` with its seconds, node_modules copied from the main checkout', () => {
		const { workspace, cli } = createWorkspace()

		const result = add({ workspace, cli, branch: 'feat/thing' })

		const worktree = join(workspace, '.worktrees', '0001-cli-thing')
		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/^│ node_modules +copy-on-write +\d+\.\d s +│$/m)
		expect(existsSync(join(worktree, 'node_modules/main-only.txt'))).toBe(true)
	})

	it('a pool entry of another lockfile only → copied as today, the entry left where it was', () => {
		const { workspace, cli, core } = createWorkspace()
		const entry = writePoolEntry({
			worktreesFolder: join(workspace, '.worktrees'),
			name: '_pool-cli-1',
			entry: {
				repository: 'cli',
				lockHash: sha256Of('another lockfile\n'),
				parkedAt: '2026-11-06T09:00:00.000Z',
			},
			marker: 'pooled\n',
			outsideTarget: core,
		})

		const result = add({ workspace, cli, branch: 'feat/thing' })

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/^│ node_modules +copy-on-write +\d+\.\d s +│$/m)
		expect(existsSync(join(entry, 'node_modules'))).toBe(true)
	})

	it('--json → nodeModules { method, from, seconds } for a pooled one, { method, seconds } for a copy', () => {
		const { workspace, cli, core } = createWorkspace()
		poolEntryFor({ workspace, core, name: '_pool-cli-1', parkedAt: '2026-11-06T09:00:00.000Z' })

		const pooled = JSON.parse(add({ workspace, cli, branch: 'feat/one', json: true }).output)
		const copied = JSON.parse(add({ workspace, cli, branch: 'feat/two', json: true }).output)

		expect(pooled.nodeModules).toMatchObject({
			method: 'pooled',
			from: '_pool-cli-1',
			seconds: expect.any(Number),
		})
		expect(copied.nodeModules).toMatchObject({
			method: 'copy-on-write',
			seconds: expect.any(Number),
		})
		expect(copied.nodeModules).not.toHaveProperty('from')
	})
})
