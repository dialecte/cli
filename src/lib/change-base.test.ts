import { LOT_NAME, PARENT_LOT_NAME } from '../../test/rules-lot-worktree.constants.ts'
import {
	commitFiles,
	createMovedLotWorktree,
	createStackedLotWorktree,
} from '../../test/rules-lot-worktree.ts'
import { createScratchRepository, git } from '../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { resolveChangeBase } from './change-base.ts'

import { describe, expect, it } from 'vitest'

/**
 * A repository whose `main` holds two commits when HEAD's branch forks from it with one commit of its own, then main
 * moves on by one more (so the fork point is neither tip); the fork point and HEAD.
 */
function branchOffMain(): { root: string; forkPoint: string; head: string } {
	const root = createScratchRepository()
	commitFiles({ root, files: { 'notes-main.md': 'main\n' }, message: 'chore: main note' })
	const forkPoint = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	git({ root, args: ['checkout', '-q', '-b', 'feat/change'] })
	commitFiles({ root, files: { 'notes-change.md': 'change\n' }, message: 'chore: change note' })
	git({ root, args: ['checkout', '-q', 'main'] })
	commitFiles({ root, files: { 'notes-later.md': 'later\n' }, message: 'chore: main moves on' })
	git({ root, args: ['checkout', '-q', 'feat/change'] })
	return { root, forkPoint, head: git({ root, args: ['rev-parse', 'HEAD'] }).trim() }
}

function shortOf(params: { root: string; commit: string }): string {
	return git({ root: params.root, args: ['rev-parse', '--short', params.commit] }).trim()
}

describe(
	'resolveChangeBase: the flag, then the handed base, then the order',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('a --base ref → its merge-base with HEAD, source flag, no line', () => {
			const { root, forkPoint } = branchOffMain()

			expect(resolveChangeBase({ root, ref: 'main', emptyTreeRequest: false })).toEqual({
				id: forkPoint,
				source: 'flag',
			})
		})

		it('a --base ref and a handed base → the flag wins: its merge-base with HEAD, source flag', () => {
			const { root, forkPoint, head } = branchOffMain()

			expect(
				resolveChangeBase({ root, ref: 'main', handed: head, emptyTreeRequest: false }),
			).toEqual({ id: forkPoint, source: 'flag' })
		})

		it('a --base ref naming nothing → a refusal naming the ref', () => {
			const { root } = branchOffMain()

			expect(resolveChangeBase({ root, ref: 'no-such-ref', emptyTreeRequest: false })).toEqual({
				refusal: expect.stringContaining('no-such-ref'),
			})
		})

		it('a handed base → that id as given, source handed, no line', () => {
			const { root } = branchOffMain()

			expect(resolveChangeBase({ root, handed: 'HEAD^1', emptyTreeRequest: false })).toEqual({
				id: 'HEAD^1',
				source: 'handed',
			})
		})

		it('an empty handed base → not handed: the order answers', () => {
			const { root, forkPoint } = branchOffMain()

			expect(resolveChangeBase({ root, handed: '', emptyTreeRequest: false })).toEqual({
				id: forkPoint,
				source: 'order',
				line: `base ${shortOf({ root, commit: forkPoint })} (the merge-base with main)`,
			})
		})

		it('a store lot rebased onto a newer main → the fork point after the rebase, its line without a prefix', () => {
			const worktree = createMovedLotWorktree({ move: 'rebase' })

			expect(resolveChangeBase({ root: worktree.root, emptyTreeRequest: false })).toEqual({
				id: worktree.baseCommit,
				source: 'order',
				line: `base ${worktree.shortSha} (the lot ${LOT_NAME})`,
			})
		})

		it("a lot stacked on an open parent → the parent's line", () => {
			const worktree = createStackedLotWorktree({ parent: 'open' })

			expect(resolveChangeBase({ root: worktree.root, emptyTreeRequest: false })).toEqual({
				id: worktree.baseCommit,
				source: 'order',
				line: `base ${worktree.shortSha} (the lot ${LOT_NAME})`,
			})
		})

		it("a stacked lot whose parent cannot be read → unreadable, the line names the failure, never main's merge-base", () => {
			const worktree = createStackedLotWorktree({ parent: 'unreadable' })

			expect(resolveChangeBase({ root: worktree.root, emptyTreeRequest: false })).toEqual({
				unreadable: expect.stringMatching(
					new RegExp(
						`^no base \\(tdd base: the stack parent ${PARENT_LOT_NAME} cannot be read: .+\\)$`,
					),
				),
			})
		})

		it("on main, no lot, not an empty-tree request → HEAD's commit, source order", () => {
			const root = createScratchRepository()
			const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()

			expect(resolveChangeBase({ root, emptyTreeRequest: false })).toEqual({
				id: head,
				source: 'order',
				line: `base ${shortOf({ root, commit: head })} (the merge-base with main)`,
			})
		})

		it('no base branch, no lot, no release tag → no base, its line', () => {
			const root = createScratchRepository()
			git({ root, args: ['branch', '-m', 'main', 'trunk'] })

			expect(resolveChangeBase({ root, emptyTreeRequest: false })).toEqual({
				noBase: expect.stringContaining('no base'),
			})
		})
	},
)
