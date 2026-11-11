import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { git, initializeRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { POOL_UNIT_CASE_MS } from '../../../test/worktree-pool.constants.ts'
import {
	createExecutingSpawner,
	createRecordingSpawner,
	trashedNamesOf,
} from '../../../test/worktree-pool.ts'
import { trashWorktree } from './trash.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-09T10:00:00Z')

/** A repository with the worktree `.worktrees/0001-cli-x` on `feat/x`. */
function createScenario() {
	const workspace = realpathSync(temporaryFolder('dialecte-trash-removal-'))
	const repository = initializeRepository({ root: join(workspace, 'cli') })
	const worktreesFolder = join(workspace, '.worktrees')
	const worktree = join(worktreesFolder, '0001-cli-x')
	git({ root: repository, args: ['worktree', 'add', '-q', '-b', 'feat/x', worktree] })
	return { repository, worktreesFolder, worktree }
}

describe('trashWorktree: the removal it starts', { timeout: POOL_UNIT_CASE_MS }, () => {
	it('force: false → the recorded removal has no --force', () => {
		const { repository, worktreesFolder, worktree } = createScenario()
		const { spawner, calls } = createRecordingSpawner()

		const { trashed } = trashWorktree({
			worktree,
			repository,
			worktreesFolder,
			now: NOW,
			spawner,
			force: false,
		})

		expect(calls).toEqual([
			{ command: 'git', args: ['worktree', 'remove', trashed], cwd: repository },
		])
	})

	it('no force given → today the removal carries --force', () => {
		const { repository, worktreesFolder, worktree } = createScenario()
		const { spawner, calls } = createRecordingSpawner()

		const { trashed } = trashWorktree({ worktree, repository, worktreesFolder, now: NOW, spawner })

		expect(calls).toEqual([
			{ command: 'git', args: ['worktree', 'remove', '--force', trashed], cwd: repository },
		])
	})

	it('force: false, an untracked file written into the trashed worktree before the removal → git refuses, the folder stays registered under _trash/, the file intact', () => {
		const { repository, worktreesFolder, worktree } = createScenario()
		// the removal waits until the file is written, as a person's work could land in the window
		const { spawner: recording, calls } = createRecordingSpawner()
		const { trashed } = trashWorktree({
			worktree,
			repository,
			worktreesFolder,
			now: NOW,
			spawner: recording,
			force: false,
		})
		writeFileSync(join(trashed, 'late-notes.txt'), 'written after the move\n')
		const { spawner: executing } = createExecutingSpawner()

		for (const call of calls) executing(call)

		expect(existsSync(trashed)).toBe(true)
		expect(readFileSync(join(trashed, 'late-notes.txt'), 'utf8')).toBe('written after the move\n')
		expect(trashedNamesOf(worktreesFolder)).toHaveLength(1)
		expect(git({ root: repository, args: ['worktree', 'list', '--porcelain'] })).toContain(
			`worktree ${trashed}\n`,
		)
	})
})
