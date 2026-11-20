/**
 * `lostWork` and a worktree's own refs (L0b2 carry-over): a commit only a per-worktree ref holds (`refs/worktree/*`,
 * `refs/bisect/*`, written from inside that worktree) is among the removed worktree's records, so its removal names it.
 */
import { realpathSync } from 'node:fs'
import { join } from 'node:path'

import { headOf, strayCommitOf } from '../../../test/landing-repository.ts'
import { git, initializeRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lostWork } from './lost-work.ts'

import { describe, expect, it } from 'vitest'

/** A repository on main and a worktree `side` on its own branch at main, both real paths. */
function repositoryWithWorktree(): { root: string; worktree: string } {
	const top = realpathSync(temporaryFolder('dialecte-worktree-refs-'))
	const root = initializeRepository({ root: join(top, 'repository') })
	const path = join(top, 'side')
	git({ root, args: ['worktree', 'add', '-q', '-b', 'side', path, 'main'] })
	return { root, worktree: realpathSync(path) }
}

const OWN_REFS: { title: string; ref: string }[] = [
	{ title: 'refs/worktree/keep', ref: 'refs/worktree/keep' },
	{ title: 'refs/bisect/bad', ref: 'refs/bisect/bad' },
]

describe('lostWork: a worktree’s own refs', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of OWN_REFS)
		it(`a commit only ${row.title} of the removed worktree holds → its removal would lose it`, () => {
			const { root, worktree } = repositoryWithWorktree()
			const held = strayCommitOf({ root: worktree, parent: headOf(worktree) })
			git({ root: worktree, args: ['update-ref', row.ref, held] })

			expect(
				lostWork({ root, removes: { worktrees: [worktree], branches: [] }, landedTips: [] }).map(
					(lost) => lost.commit,
				),
			).toEqual([held])
		})
})
