import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { git, initializeRepository, temporaryFolder } from '../../test/scratch-repository.ts'
import { LOCK_TEXT, POOL_COMMAND_CASE_MS } from '../../test/worktree-pool.constants.ts'
import { sha256Of, writePoolEntry } from '../../test/worktree-pool.ts'
import { runWorktreePrune } from './worktree.ts'

import { describe, expect, it } from 'vitest'

describe('worktree prune: the pool and the trash', { timeout: POOL_COMMAND_CASE_MS }, () => {
	it('_pool-cli-1, _pool-core-1 and a _trash/ holding a worktree and two folders → none listed as a worktree nor touched; one pool line, one trash line', async () => {
		const workspace = realpathSync(temporaryFolder('dialecte-prune-pool-'))
		const cli = initializeRepository({ root: join(workspace, 'cli') })
		initializeRepository({ root: join(workspace, 'core') })
		const worktreesFolder = join(workspace, '.worktrees')
		mkdirSync(join(worktreesFolder, '_trash'), { recursive: true })
		// a merged, clean worktree that was sent to the trash: git still registers it, prune must not list it
		const worktree = join(worktreesFolder, '0001-cli-x')
		git({ root: cli, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree] })
		const trashedWorktree = join(worktreesFolder, '_trash', '0001-cli-x-20261106T100000')
		git({ root: cli, args: ['worktree', 'move', worktree, trashedWorktree] })
		for (const name of ['x', 'y']) {
			mkdirSync(join(worktreesFolder, '_trash', name))
			writeFileSync(join(worktreesFolder, '_trash', name, 'left.txt'), 'left\n')
		}
		for (const repository of ['cli', 'core'])
			writePoolEntry({
				worktreesFolder,
				name: `_pool-${repository}-1`,
				entry: {
					repository,
					lockHash: sha256Of(LOCK_TEXT),
					parkedAt: '2026-11-06T09:00:00.000Z',
				},
			})

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		expect(lines).toEqual(
			expect.arrayContaining([
				'pool: 2 entries (cli 1, core 1)',
				'trash: 3 folders, being deleted or left over',
			]),
		)
		expect(lines.filter((line) => line.startsWith('pool:'))).toHaveLength(1)
		expect(lines.filter((line) => line.startsWith('trash:'))).toHaveLength(1)
		expect(result.output).not.toContain('_trash/')
		expect(result.output).not.toContain('_pool-')
		expect(existsSync(trashedWorktree)).toBe(true)
		expect(existsSync(join(worktreesFolder, '_trash/x/left.txt'))).toBe(true)
		expect(existsSync(join(worktreesFolder, '_pool-cli-1/node_modules'))).toBe(true)
		expect(existsSync(join(worktreesFolder, '_pool-core-1/node_modules'))).toBe(true)
	})

	it('a _pool-x-1/node_modules with no pool.json (a park that never finished) → reported as left over, named, and left where it is', async () => {
		const workspace = realpathSync(temporaryFolder('dialecte-prune-pool-'))
		initializeRepository({ root: join(workspace, 'cli') })
		const worktreesFolder = join(workspace, '.worktrees')
		mkdirSync(join(worktreesFolder, '_pool-x-1', 'node_modules'), { recursive: true })
		writeFileSync(join(worktreesFolder, '_pool-x-1', 'node_modules', 'file.txt'), 'half parked\n')

		const result = await runWorktreePrune({
			argv: ['--root', workspace],
			cwd: workspace,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
			isTerminal: false,
			confirm: async () => true,
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/_pool-x-1[^\n]*left over/)
		expect(existsSync(join(worktreesFolder, '_pool-x-1/node_modules/file.txt'))).toBe(true)
	})
})
