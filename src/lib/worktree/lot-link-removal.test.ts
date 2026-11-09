/**
 * Case 24 (33S section 15): the link `.dialecte/lot` of a lot's worktree reaches the lot folder, and no removal of
 * the worktree may follow it. Real removals in temporary folders: git's `worktree remove --force` (what the trash's
 * background removal runs), git's `worktree remove` (the command prune plans), and `rm -rf` of a plain folder
 * holding such a link. The link goes, the lot folder is byte-identical.
 */
import { appendFileSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { addBareWorktree } from '../../../test/lot-keep-workspace.ts'
import { snapshotOf } from '../../../test/lot-start-workspace.ts'
import { createWorkspaceWithLots, linkLot } from '../../../test/lot-stores.ts'
import { git, temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const LOT = '0001-repo-linked'

/** Whether something (a link included, dangling or not) stands at `path`. */
function standsAt(path: string): boolean {
	try {
		lstatSync(path)
		return true
	} catch {
		return false
	}
}

/** A lot folder of the store (brief, plan, identity, one transition), and a worktree of the same workspace holding the link to it. */
function linkedWorktree() {
	const { workspace, folders } = createWorkspaceWithLots({ names: [LOT] })
	const lotFolder = folders[LOT]
	const worktree = addBareWorktree({ workspace, name: '0001-repo-linkedtree' }).worktree
	const link = linkLot({ worktree, lotFolder })
	// the link is ignored by the repository, so a plain `worktree remove` is not refused for an untracked file
	appendFileSync(join(workspace.repository, '.git', 'info', 'exclude'), '.dialecte/\n')
	return { workspace, lotFolder, worktree, link }
}

describe(
	'removing a lot worktree or a folder holding the lot link',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('git worktree remove --force of a worktree holding .dialecte/lot (the trash way) → the worktree and its link gone, the lot folder byte-identical', () => {
			const { workspace, lotFolder, worktree, link } = linkedWorktree()
			const before = snapshotOf(lotFolder)

			git({ root: workspace.repository, args: ['worktree', 'remove', '--force', worktree] })

			expect({
				linkStands: standsAt(link),
				worktreeStands: standsAt(worktree),
				lot: snapshotOf(lotFolder),
			}).toEqual({
				linkStands: false,
				worktreeStands: false,
				lot: before,
			})
		})

		it('git worktree remove of a worktree holding .dialecte/lot (the command prune plans) → the worktree and its link gone, the lot folder byte-identical', () => {
			const { workspace, lotFolder, worktree, link } = linkedWorktree()
			const before = snapshotOf(lotFolder)

			git({ root: workspace.repository, args: ['worktree', 'remove', worktree] })

			expect({
				linkStands: standsAt(link),
				worktreeStands: standsAt(worktree),
				lot: snapshotOf(lotFolder),
			}).toEqual({
				linkStands: false,
				worktreeStands: false,
				lot: before,
			})
		})

		it('rm -rf of a plain folder holding a link to a lot folder → the link gone, the lot folder byte-identical', () => {
			const lotFolder = createWorkspaceWithLots({ names: [LOT] }).folders[LOT]
			const plain = join(temporaryFolder('dialecte-plain-'), 'plain')
			mkdirSync(join(plain, '.dialecte'), { recursive: true })
			const link = join(plain, '.dialecte', 'lot')
			symlinkSync(lotFolder, link)
			const before = snapshotOf(lotFolder)

			rmSync(plain, { recursive: true, force: true })

			expect({
				linkStands: standsAt(link),
				plainStands: standsAt(plain),
				lot: snapshotOf(lotFolder),
			}).toEqual({
				linkStands: false,
				plainStands: false,
				lot: before,
			})
		})
	},
)
