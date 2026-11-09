/**
 * `linkedWorktreeLockPath` (R2-1): a `gitdir` entry is resolved against its own `worktrees/<name>` folder, so a
 * relative one finds its worktree; an unreadable or missing entry is skipped, never thrown on.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { linkedWorktreeLockPath } from './handover-lock.ts'
import {
	HANDOVER_LOCK_FILE,
	LINKED_WORKTREE_GITDIR_FILE,
	LINKED_WORKTREES_FOLDER,
} from './handover.constants.ts'

import { describe, expect, it } from 'vitest'

/** A common git folder and a worktree folder beside it, both real; the worktree's `.git` is not written. */
function commonFolderAndWorktree(): { commonFolder: string; worktree: string } {
	const base = realpathSync(temporaryFolder('dialecte-linked-lock-'))
	const commonFolder = join(base, 'repository', '.git')
	const worktree = join(base, 'work', 'tree')
	mkdirSync(commonFolder, { recursive: true })
	mkdirSync(worktree, { recursive: true })
	return { commonFolder, worktree }
}

/** `<common>/worktrees/<name>/` made, its `gitdir` entry written when `gitdir` is given; the folder is returned. */
function gitFolderOfEntry(params: { commonFolder: string; name: string; gitdir?: string }): string {
	const folder = join(params.commonFolder, LINKED_WORKTREES_FOLDER, params.name)
	mkdirSync(folder, { recursive: true })
	if (params.gitdir !== undefined)
		writeFileSync(join(folder, LINKED_WORKTREE_GITDIR_FILE), `${params.gitdir}\n`)
	return folder
}

describe('linkedWorktreeLockPath', () => {
	it('a gitdir holding a path relative to its own worktrees/<name> folder -> that entry is found, wherever the process runs', () => {
		const { commonFolder, worktree } = commonFolderAndWorktree()
		const folder = gitFolderOfEntry({
			commonFolder,
			name: 'tree',
			gitdir: relative(join(commonFolder, LINKED_WORKTREES_FOLDER, 'tree'), join(worktree, '.git')),
		})

		expect(linkedWorktreeLockPath({ commonFolder, worktree })).toBe(
			join(folder, HANDOVER_LOCK_FILE),
		)
	})

	it('an entry whose gitdir cannot be read and an entry with no gitdir, before a valid one -> both skipped, the valid entry is found', () => {
		const { commonFolder, worktree } = commonFolderAndWorktree()
		const unreadable = gitFolderOfEntry({ commonFolder, name: 'a-unreadable' })
		// a folder where the file should be: reading it throws
		mkdirSync(join(unreadable, LINKED_WORKTREE_GITDIR_FILE))
		gitFolderOfEntry({ commonFolder, name: 'b-missing' })
		const valid = gitFolderOfEntry({
			commonFolder,
			name: 'c-valid',
			gitdir: join(worktree, '.git'),
		})

		expect(linkedWorktreeLockPath({ commonFolder, worktree })).toBe(join(valid, HANDOVER_LOCK_FILE))
	})

	it('only unreadable and missing entries -> undefined, nothing thrown', () => {
		const { commonFolder, worktree } = commonFolderAndWorktree()
		const unreadable = gitFolderOfEntry({ commonFolder, name: 'a-unreadable' })
		mkdirSync(join(unreadable, LINKED_WORKTREE_GITDIR_FILE))
		gitFolderOfEntry({ commonFolder, name: 'b-missing' })

		expect(linkedWorktreeLockPath({ commonFolder, worktree })).toBeUndefined()
	})
})
