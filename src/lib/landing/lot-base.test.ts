/**
 * `lotBaseOf` on scratch repositories: a lot cut from the base forks at its merge-base with origin's main; a stacked lot
 * forks from its parent's line, read from git (its newest branch tip, the parent ref's reflog), never a recorded tip,
 * and lands on origin's main once the parent merged. The rebase rows run the rebase the base implies and check that
 * only the child's own commit moves.
 */
import {
	CHILD_BRANCH,
	LOT_BRANCH,
	ORIGIN_MAIN,
} from '../../../test/landing-repository.constants.ts'
import {
	commitIn,
	editOnOrigin,
	amendLot,
	headOf,
	landingRepositoryOf,
	mergeOnOrigin,
	stackedChildOf,
} from '../../../test/landing-repository.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotBaseOf } from './lot-base.ts'

import { describe, expect, it } from 'vitest'

import type { LandingRepository } from '../../../test/landing-repository.types.ts'
import type { LandingState } from './landing-state.types.ts'

const OPEN: LandingState = { kind: 'unlanded' }

/** The subjects of the commits `ref` holds beyond `base`, newest first. */
function subjectsBeyond(params: { root: string; base: string; ref: string }): string[] {
	return git({ root: params.root, args: ['log', '--format=%s', `${params.base}..${params.ref}`] })
		.split('\n')
		.filter(Boolean)
}

describe('lotBaseOf', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	it("a lot not stacked, origin's main moved on -> origin's main, forking at its cut", () => {
		const repository = landingRepositoryOf()
		editOnOrigin({ repository, files: { 'src/other.ts': 'export const other = 1\n' } })

		expect(
			lotBaseOf({ root: repository.root, head: `refs/heads/${LOT_BRANCH}`, baseRef: ORIGIN_MAIN }),
		).toEqual({ ref: ORIGIN_MAIN, label: 'origin/main', forkPoint: repository.cut })
	})

	it("a stacked lot, its parent open and moved on since -> the parent's branch, forking at the parent commit it holds", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		commitIn({
			root: repository.worktree,
			files: { 'src/w.ts': 'export const w = 1\n' },
			message: 'feat(x): w',
		})

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: OPEN },
			}),
		).toEqual({ ref: `refs/heads/${LOT_BRANCH}`, label: LOT_BRANCH, forkPoint: repository.tip })
	})

	it('a stacked child rebased by hand onto its amended parent, the parent then squash-merged -> origin s main; the rebase moves only the child s commit', () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		const amended = amendLot({ worktree: repository.worktree })
		git({ root: child.worktree, args: ['rebase', '-q', '--onto', amended, repository.tip] })
		mergeOnOrigin({ repository, how: 'squash' })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: { kind: 'merged', how: 'tree', tip: amended } },
			}),
		).toEqual({ ref: ORIGIN_MAIN, label: 'origin/main', forkPoint: amended })
		git({ root: child.worktree, args: ['rebase', '-q', '--onto', ORIGIN_MAIN, amended] })
		expect(subjectsBeyond({ root: child.worktree, base: ORIGIN_MAIN, ref: 'HEAD' })).toEqual([
			'feat(y): y',
		])
	})

	it('a stacked child never rebased, its parent amended then squash-merged -> origin s main, forking at the parent commit it holds; the rebase moves only the child s commit', () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		const amended = amendLot({ worktree: repository.worktree })
		mergeOnOrigin({ repository, how: 'squash' })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: {
					branch: LOT_BRANCH,
					landing: { kind: 'merged', how: 'tree', tip: amended },
				},
			}),
		).toEqual({ ref: ORIGIN_MAIN, label: 'origin/main', forkPoint: repository.tip })
		git({ root: child.worktree, args: ['rebase', '-q', '--onto', ORIGIN_MAIN, repository.tip] })
		expect(subjectsBeyond({ root: child.worktree, base: ORIGIN_MAIN, ref: 'HEAD' })).toEqual([
			'feat(y): y',
		])
	})

	it("a stacked child already on origin's main after its parent's squash, main moved on -> origin's main, forking at its merge-base with it", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		const squashed = mergeOnOrigin({ repository, how: 'squash' })
		git({ root: child.worktree, args: ['rebase', '-q', '--onto', ORIGIN_MAIN, repository.tip] })
		editOnOrigin({ repository, files: { 'src/other.ts': 'export const other = 1\n' } })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: {
					branch: LOT_BRANCH,
					landing: { kind: 'merged', how: 'tree', tip: repository.tip },
				},
			}),
		).toEqual({ ref: ORIGIN_MAIN, label: 'origin/main', forkPoint: squashed })
	})

	it("a stacked child on origin's main, its merged parent's branches deleted here and on origin -> origin's main, forking at its merge-base with it", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		const squashed = mergeOnOrigin({ repository, how: 'squash' })
		git({ root: child.worktree, args: ['rebase', '-q', '--onto', ORIGIN_MAIN, repository.tip] })
		dropParentBranches({ repository })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: {
					branch: LOT_BRANCH,
					landing: { kind: 'merged', how: 'tree', tip: repository.tip },
				},
			}),
		).toEqual({ ref: ORIGIN_MAIN, label: 'origin/main', forkPoint: squashed })
	})

	it('a stacked lot whose open parent has no branch here nor on origin -> refused naming the parent', () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		dropParentBranches({ repository })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: OPEN },
			}),
		).toEqual({ refusal: `the stack parent ${LOT_BRANCH} has no branch here nor on origin` })
	})

	it("a stacked lot whose open parent's local branch and origin's diverged -> the local branch", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		git({ root: repository.root, args: ['push', '-q', 'origin', `${LOT_BRANCH}:${LOT_BRANCH}`] })
		git({ root: repository.root, args: ['fetch', '-q', 'origin'] })
		amendLot({ worktree: repository.worktree })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: OPEN },
			}),
		).toEqual({ ref: `refs/heads/${LOT_BRANCH}`, label: LOT_BRANCH, forkPoint: repository.tip })
	})

	it("a stacked lot whose open parent is only on origin -> origin's branch", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		git({ root: repository.root, args: ['push', '-q', 'origin', `${LOT_BRANCH}:${LOT_BRANCH}`] })
		git({ root: repository.root, args: ['fetch', '-q', 'origin'] })
		git({ root: repository.worktree, args: ['checkout', '-q', '--detach'] })
		git({ root: repository.root, args: ['branch', '-q', '-D', LOT_BRANCH] })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: OPEN },
			}),
		).toEqual({
			ref: `refs/remotes/origin/${LOT_BRANCH}`,
			label: LOT_BRANCH,
			forkPoint: repository.tip,
		})
	})

	it("a stacked child never rebased, its two-commit parent squash-merged and its branches deleted here and on origin -> origin's main, forking at the parent's landed tip; the rebase moves only the child's commit", () => {
		const repository = landingRepositoryOf()
		const second = commitIn({
			root: repository.worktree,
			files: { 'src/w.ts': 'export const w = 1\n' },
			message: 'feat(x): w',
		})
		const child = stackedChildOf(repository)
		mergeOnOrigin({ repository, how: 'squash' })
		dropParentBranches({ repository })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: { kind: 'merged', how: 'tree', tip: second } },
			}),
		).toEqual({ ref: ORIGIN_MAIN, label: 'origin/main', forkPoint: second })
		git({ root: child.worktree, args: ['rebase', '-q', '--onto', ORIGIN_MAIN, second] })
		expect(subjectsBeyond({ root: child.worktree, base: ORIGIN_MAIN, ref: 'HEAD' })).toEqual([
			'feat(y): y',
		])
	})

	it('a stacked child whose open parent was amended, the reflog expired -> the plain merge-base, as git answers', () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		amendLot({ worktree: repository.worktree })
		git({ root: repository.root, args: ['reflog', 'expire', '--expire=now', '--all'] })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: OPEN },
			}),
		).toEqual({ ref: `refs/heads/${LOT_BRANCH}`, label: LOT_BRANCH, forkPoint: repository.cut })
	})

	it('a head that does not resolve -> refused naming it', () => {
		const repository = landingRepositoryOf()

		expect(
			lotBaseOf({
				root: repository.root,
				head: `refs/heads/${CHILD_BRANCH}`,
				baseRef: ORIGIN_MAIN,
			}),
		).toEqual({ refusal: `the lot's head refs/heads/${CHILD_BRANCH} does not resolve` })
	})
})

/** The parent's branch deleted here (its worktree detached) and its origin-tracking ref removed. */
function dropParentBranches(params: { repository: LandingRepository }): void {
	const { repository } = params
	git({ root: repository.worktree, args: ['checkout', '-q', '--detach'] })
	git({ root: repository.root, args: ['branch', '-q', '-D', LOT_BRANCH] })
	git({
		root: repository.root,
		args: ['update-ref', '-d', `refs/remotes/origin/${LOT_BRANCH}`],
	})
}
