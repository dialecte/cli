/**
 * `unlandedWork` over scratch repositories with real merges on origin: what a squash, a commit after the landing, a
 * commit dropped from the branch and a landed tip leave as work the base does not hold.
 */
import { LOT_FILE, ORIGIN_MAIN } from '../../../test/landing-repository.constants.ts'
import {
	commitIn,
	editOnOrigin,
	headOf,
	landingRepositoryOf,
	mergeOnOrigin,
} from '../../../test/landing-repository.ts'
import { git } from '../../../test/scratch-repository.ts'
import { unlandedWork } from './unlanded-work.ts'

import { describe, expect, it } from 'vitest'

import type { LandingRepository } from '../../../test/landing-repository.types.ts'

/** What a row does to the repository after its cut: the commits it expects named, and the landed tip it records. */
type UnlandedRow = {
	title: string
	arrange: (repository: LandingRepository) => { named: string[]; landedTip?: string }
}

const ROWS: UnlandedRow[] = [
	{
		title: 'a lot never merged → its commit named',
		arrange: (repository) => ({ named: [repository.tip] }),
	},
	{
		title: 'a squash-merged lot → nothing named',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			return { named: [] }
		},
	},
	{
		title: 'a squash-merged lot with a commit made after the merge → only that commit named',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			const after = commitIn({
				root: repository.worktree,
				files: { 'src/after.ts': 'export const after = 1\n' },
				message: 'feat(x): after',
			})
			return { named: [after] }
		},
	},
	{
		title:
			'a squash-merged lot, a commit after it then dropped by a reset (its HEAD reflog only) → that commit named',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			const dropped = commitIn({
				root: repository.worktree,
				files: { 'src/dropped.ts': 'export const dropped = 1\n' },
				message: 'feat(x): dropped',
			})
			git({ root: repository.worktree, args: ['reset', '-q', '--hard', 'HEAD~1'] })
			return { named: [dropped] }
		},
	},
	{
		title:
			'squash, then main edits the same lines, no landed tip → the commit named (not provable from the tree)',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 2\n' } })
			return { named: [repository.tip] }
		},
	},
	{
		title: 'squash, then main edits the same lines, the landed tip recorded → nothing named',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 2\n' } })
			return { named: [], landedTip: headOf(repository.worktree) }
		},
	},
]

describe('unlandedWork', () => {
	for (const row of ROWS)
		it(row.title, () => {
			const repository = landingRepositoryOf()
			const { named, landedTip } = row.arrange(repository)

			expect(
				unlandedWork({
					root: repository.worktree,
					branch: repository.branch,
					baseRef: ORIGIN_MAIN,
					worktree: repository.worktree,
					...(landedTip !== undefined && { landedTip }),
				}),
			).toEqual(named)
		})
})
