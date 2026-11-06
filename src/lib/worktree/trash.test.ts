import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { git, initializeRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { POOL_UNIT_CASE_MS } from '../../../test/worktree-pool.constants.ts'
import { createRecordingSpawner, trashedNamesOf } from '../../../test/worktree-pool.ts'
import { trashFolder, trashWorktree } from './trash.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-06T10:00:00Z')

describe('trashWorktree', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('a worktree → `git worktree list` shows it under _trash/, the original path gone, the remove only started (not awaited)', () => {
		const workspace = realpathSync(temporaryFolder('dialecte-trash-'))
		const repository = initializeRepository({ root: join(workspace, 'cli') })
		const worktreesFolder = join(workspace, '.worktrees')
		const worktree = join(worktreesFolder, '0001-cli-x')
		git({ root: repository, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree] })
		const { spawner, calls } = createRecordingSpawner()

		expect(trashWorktree({ worktree, repository, worktreesFolder, now: NOW, spawner })).toEqual({
			trashed: expect.stringContaining(join(worktreesFolder, '_trash', '0001-cli-x-')),
		})

		const [trashedName] = trashedNamesOf(worktreesFolder)
		const trashed = join(worktreesFolder, '_trash', trashedName)
		expect(trashedNamesOf(worktreesFolder)).toHaveLength(1)
		expect(existsSync(worktree)).toBe(false)
		expect(git({ root: repository, args: ['worktree', 'list', '--porcelain'] })).toContain(
			`worktree ${trashed}\n`,
		)
		// the call returned with the folder still there: the remove is a background command nobody waits for
		expect(existsSync(trashed)).toBe(true)
		expect(calls).toEqual([
			{ command: 'git', args: ['worktree', 'remove', '--force', trashed], cwd: repository },
		])
	})
})

describe('trashFolder', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('a plain folder → renamed into _trash/, a background rm -rf of that one path started (recorded by the spawner), not awaited', () => {
		const worktreesFolder = join(realpathSync(temporaryFolder('dialecte-trash-')), '.worktrees')
		const folder = join(worktreesFolder, '_pool-cli-1')
		mkdirSync(folder, { recursive: true })
		writeFileSync(join(folder, 'pool.json'), '{}\n')
		const { spawner, calls } = createRecordingSpawner()

		expect(trashFolder({ folder, worktreesFolder, now: NOW, spawner })).toEqual({
			trashed: expect.stringContaining(join(worktreesFolder, '_trash', '_pool-cli-1-')),
		})

		const [trashedName] = trashedNamesOf(worktreesFolder)
		const trashed = join(worktreesFolder, '_trash', trashedName)
		expect(trashedNamesOf(worktreesFolder)).toHaveLength(1)
		expect(existsSync(folder)).toBe(false)
		expect(existsSync(join(trashed, 'pool.json'))).toBe(true)
		expect(calls).toEqual([{ command: 'rm', args: ['-rf', trashed], cwd: undefined }])
	})

	it('two folders of one name trashed in the same second → two distinct entries in _trash/, none overwritten', () => {
		const worktreesFolder = join(realpathSync(temporaryFolder('dialecte-trash-')), '.worktrees')
		const { spawner } = createRecordingSpawner()
		for (const round of [0, 1]) {
			const folder = join(worktreesFolder, 'rehearsal')
			mkdirSync(folder, { recursive: true })
			writeFileSync(join(folder, 'file.txt'), `round ${round}\n`)
			expect(trashFolder({ folder, worktreesFolder, now: NOW, spawner })).toEqual({
				trashed: expect.stringContaining(join(worktreesFolder, '_trash', 'rehearsal-')),
			})
		}

		expect(trashedNamesOf(worktreesFolder)).toHaveLength(2)
	})
})
