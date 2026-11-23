/**
 * `lotBaseOf` on scratch repositories: a lot cut from the base forks at its merge-base with origin's main; a stacked lot
 * forks from its parent's line, read from git (its newest branch tip, the parent ref's reflog), never a recorded tip,
 * and lands on origin's main once the parent merged. The rebase rows run the rebase the base implies and check that
 * only the child's own commit moves.
 */
import { spawnSync } from 'node:child_process'

import {
	CHILD_BRANCH,
	CHILD_FILE,
	LOT_BRANCH,
	LOT_FILE,
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
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotBaseOf } from './lot-base.ts'

import { describe, expect, it } from 'vitest'

import type { LandingRepository } from '../../../test/landing-repository.types.ts'
import type { LandingState } from './landing-state.types.ts'

const OPEN: LandingState = { kind: 'unlanded' }

/** A release on main: the version set and a file of its own. */
const RELEASE = {
	'package.json': '{ "name": "x", "version": "0.2.0" }\n',
	'src/release.ts': 'export const release = 1\n',
}

/** The subject git gives the child's merge of origin's main. */
const MERGE_SUBJECT = `Merge remote-tracking branch 'origin/main' into ${CHILD_BRANCH}`

/** Main's later text of the line the parent changed (its squash landed first). */
const EDITED_ON_MAIN = { [LOT_FILE]: 'export const x = 2\n' }

/** The refusal of a join whose parent `feat/x` and origin's main do not merge clean on the parent's file. */
const PARENT_FILE_CONFLICT = `the lines the lot holds (${LOT_BRANCH}, origin/main) do not merge clean (${LOT_FILE}): its own change cannot be told apart from origin/main's; rebase it onto origin/main once its parent landed, or merge origin/main into its parent first`

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

	it("a stacked child on an open parent, a release on main, the child merges origin's main → only its own commit and its merge beyond its base, joining the parent commit it holds and main's tip", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		const release = editOnOrigin({ repository, files: RELEASE })
		mergeBaseInto({ worktree: child.worktree })

		const base = lotBaseOf({
			root: repository.root,
			head: headOf(child.worktree),
			baseRef: ORIGIN_MAIN,
			parent: { branch: LOT_BRANCH, landing: OPEN },
		})

		expect(ownChangeOf({ worktree: child.worktree, base })).toEqual({
			beyond: [MERGE_SUBJECT, 'feat(y): y'],
			changed: [CHILD_FILE],
		})
		expect(base).toMatchObject({
			ref: `refs/heads/${LOT_BRANCH}`,
			label: LOT_BRANCH,
			joined: [repository.tip, release],
		})
	})

	it("a stacked child never rebased, its parent squash-merged then a release on main, the child merges origin's main, the parent read open → only its own commit and its merge beyond its base, no package.json changed", () => {
		const { repository, worktree } = squashedParentThenMergedRelease()

		const base = lotBaseOf({
			root: repository.root,
			head: headOf(worktree),
			baseRef: ORIGIN_MAIN,
			parent: { branch: LOT_BRANCH, landing: OPEN },
		})

		expect(ownChangeOf({ worktree, base })).toEqual({
			beyond: [MERGE_SUBJECT, 'feat(y): y'],
			changed: [CHILD_FILE],
		})
	})

	it('the same, the parent read merged → the same: only its own commit and its merge beyond its base, no package.json changed', () => {
		const { repository, worktree } = squashedParentThenMergedRelease()

		const base = lotBaseOf({
			root: repository.root,
			head: headOf(worktree),
			baseRef: ORIGIN_MAIN,
			parent: {
				branch: LOT_BRANCH,
				landing: { kind: 'merged', how: 'tree', tip: repository.tip },
			},
		})

		expect(ownChangeOf({ worktree, base })).toEqual({
			beyond: [MERGE_SUBJECT, 'feat(y): y'],
			changed: [CHILD_FILE],
		})
	})

	it("a stacked child on an open parent that merged origin's main after a release, rebased onto the parent's tip from its base → only its own commit moves", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		editOnOrigin({ repository, files: RELEASE })
		mergeBaseInto({ worktree: child.worktree })
		const base = lotBaseOf({
			root: repository.root,
			head: headOf(child.worktree),
			baseRef: ORIGIN_MAIN,
			parent: { branch: LOT_BRANCH, landing: OPEN },
		})

		git({
			root: child.worktree,
			args: ['rebase', '-q', '--onto', repository.tip, forkPointOf(base)],
		})

		expect(subjectsBeyond({ root: child.worktree, base: repository.tip, ref: 'HEAD' })).toEqual([
			'feat(y): y',
		])
	})

	it('a stacked child on an open parent, the parent and main changing the same line differently, the child merging main resolving it → refused naming the path and both ways out', () => {
		const repository = landingRepositoryOf()
		commitIn({
			root: repository.worktree,
			files: { 'README.md': 'parent\n' },
			message: 'feat(x): the parent reads',
		})
		const child = stackedChildOf(repository)
		editOnOrigin({ repository, files: { 'README.md': 'main\n' } })
		mergeBaseResolving({ worktree: child.worktree, files: { 'README.md': 'parent and main\n' } })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: OPEN },
			}),
		).toEqual({
			refusal: `the lines the lot holds (${LOT_BRANCH}, origin/main) do not merge clean (README.md): its own change cannot be told apart from origin/main's; rebase it onto origin/main once its parent landed, or merge origin/main into its parent first`,
		})
	})

	it("a stacked child never rebased, its parent squash-merged then edited on main, the child merges origin's main resolving it, the parent read merged → only its own commit and its merge beyond its base, joining the landed tip and main's tip", () => {
		const { repository, worktree, main } = squashedParentThenEditedOnMain()

		const base = lotBaseOf({
			root: repository.root,
			head: headOf(worktree),
			baseRef: ORIGIN_MAIN,
			parent: {
				branch: LOT_BRANCH,
				landing: { kind: 'merged', how: 'tree', tip: repository.tip },
			},
		})

		expect(base).toMatchObject({
			ref: ORIGIN_MAIN,
			label: 'origin/main',
			joined: [repository.tip, main],
		})
		expect(ownChangeOf({ worktree, base })).toEqual({
			beyond: [MERGE_SUBJECT, 'feat(y): y'],
			changed: [CHILD_FILE],
		})
	})

	it("the same, rebased onto origin's main from its base → only its own commit replays, clean", () => {
		const { repository, worktree } = squashedParentThenEditedOnMain()
		const base = lotBaseOf({
			root: repository.root,
			head: headOf(worktree),
			baseRef: ORIGIN_MAIN,
			parent: {
				branch: LOT_BRANCH,
				landing: { kind: 'merged', how: 'tree', tip: repository.tip },
			},
		})

		git({ root: worktree, args: ['rebase', '-q', '--onto', ORIGIN_MAIN, forkPointOf(base)] })

		expect(subjectsBeyond({ root: worktree, base: ORIGIN_MAIN, ref: 'HEAD' })).toEqual([
			'feat(y): y',
		])
	})

	it('the same, the parent read unlanded though pushed, no host asked → refused naming the parent that may have landed and how to record it', () => {
		const { repository, worktree } = squashedParentThenEditedOnMain()

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(worktree),
				baseRef: ORIGIN_MAIN,
				parent: {
					branch: LOT_BRANCH,
					landing: { kind: 'unlanded', proof: 'offline-unproven' },
				},
			}),
		).toEqual({
			refusal: `the lines the lot holds (${LOT_BRANCH}, origin/main) do not merge clean (${LOT_FILE}), and its parent ${LOT_BRANCH} may have landed though git alone cannot prove it: record the parent's landing (lot close on the parent's lot), then read it again; or rebase it onto origin/main once its parent landed, or merge origin/main into its parent first`,
		})
	})

	// guard: a parent read plainly unlanded keeps the conflict's own refusal, never the may-have-landed text
	it('the same, the parent read unlanded → refused naming the path and both ways out', () => {
		const { repository, worktree } = squashedParentThenEditedOnMain()

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: OPEN },
			}),
		).toEqual({ refusal: PARENT_FILE_CONFLICT })
	})

	// guard: a clean join of the landed tip and a base line older than the squash keeps merge-tree's tree, never the base's
	it("a stacked child that merged origin's main before its parent's squash, the parent read merged → only its own commit and its merge beyond its base, no parent file", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		editOnOrigin({ repository, files: { 'src/other.ts': 'export const other = 1\n' } })
		mergeBaseInto({ worktree: child.worktree })
		mergeOnOrigin({ repository, how: 'squash' })

		const base = lotBaseOf({
			root: repository.root,
			head: headOf(child.worktree),
			baseRef: ORIGIN_MAIN,
			parent: {
				branch: LOT_BRANCH,
				landing: { kind: 'merged', how: 'tree', tip: repository.tip },
			},
		})

		expect(ownChangeOf({ worktree: child.worktree, base })).toEqual({
			beyond: [MERGE_SUBJECT, 'feat(y): y'],
			changed: [CHILD_FILE],
		})
	})

	// guard: it guards a parent whose landed tip HEAD does not hold
	it("a stacked child holding its parent's commit before an amend, the amended parent squash-merged then edited on main, the child merges origin's main resolving it, the parent read merged → refused naming the path and both ways out", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		const amended = amendLot({ worktree: repository.worktree })
		mergeOnOrigin({ repository, how: 'squash' })
		editOnOrigin({ repository, files: EDITED_ON_MAIN })
		mergeBaseResolving({ worktree: child.worktree, files: EDITED_ON_MAIN })

		expect(
			lotBaseOf({
				root: repository.root,
				head: headOf(child.worktree),
				baseRef: ORIGIN_MAIN,
				parent: { branch: LOT_BRANCH, landing: { kind: 'merged', how: 'tree', tip: amended } },
			}),
		).toEqual({ refusal: PARENT_FILE_CONFLICT })
	})

	// guard: the parent line the lot holds is a commit beyond the landed tip, whose work the base does not hold
	it("a stacked child that merged its parent's commit made after the parent's squash, main then editing the parent's line, the child merges origin's main resolving it, the parent read merged → refused naming the path and both ways out", () => {
		const repository = landingRepositoryOf()
		const child = stackedChildOf(repository)
		mergeOnOrigin({ repository, how: 'squash' })
		commitIn({
			root: repository.worktree,
			files: { 'src/q.ts': 'export const q = 1\n' },
			message: 'feat(x): q',
		})
		git({ root: child.worktree, args: ['merge', '--no-edit', '-q', LOT_BRANCH] })
		editOnOrigin({ repository, files: EDITED_ON_MAIN })
		mergeBaseResolving({ worktree: child.worktree, files: EDITED_ON_MAIN })

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
		).toEqual({ refusal: PARENT_FILE_CONFLICT })
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

/** The base merged into the worktree's branch: origin fetched, then origin's main merged. */
function mergeBaseInto(params: { worktree: string }): void {
	git({ root: params.worktree, args: ['fetch', '-q', 'origin'] })
	git({ root: params.worktree, args: ['merge', '--no-edit', '-q', 'origin/main'] })
}

/**
 * The base merged into the worktree's branch, its conflict resolved by hand: origin fetched, origin's main merged until
 * it stops on a conflict, `files` written over the conflicted ones, then the merge committed.
 */
function mergeBaseResolving(params: { worktree: string; files: Record<string, string> }): void {
	git({ root: params.worktree, args: ['fetch', '-q', 'origin'] })
	const merge = spawnSync('git', ['merge', '--no-edit', '-q', 'origin/main'], {
		cwd: params.worktree,
		encoding: 'utf8',
	})
	if (merge.status === 0) throw new Error('git merge origin/main met no conflict')
	writeFiles({ root: params.worktree, files: params.files })
	git({ root: params.worktree, args: ['add', '-A'] })
	git({ root: params.worktree, args: ['commit', '-q', '--no-edit'] })
}

/** The files `ref` changed since `base`, sorted. */
function changedSince(params: { root: string; base: string; ref: string }): string[] {
	return git({ root: params.root, args: ['diff', '--name-only', params.base, params.ref] })
		.split('\n')
		.filter(Boolean)
		.sort()
}

/** The fork point of a base, or HEAD for a refusal (nothing beyond it, nothing changed since). */
function forkPointOf(base: ReturnType<typeof lotBaseOf>): string {
	return 'forkPoint' in base ? base.forkPoint : 'HEAD'
}

/** What a stacked child's base leaves as its own: the subjects beyond its fork point and the files changed since. */
function ownChangeOf(params: { worktree: string; base: ReturnType<typeof lotBaseOf> }): {
	beyond: string[]
	changed: string[]
} {
	const forkPoint = forkPointOf(params.base)
	return {
		beyond: subjectsBeyond({ root: params.worktree, base: forkPoint, ref: 'HEAD' }),
		changed: changedSince({ root: params.worktree, base: forkPoint, ref: 'HEAD' }),
	}
}

/** The parent squash-merged on origin's main, a release on main, then the child, never rebased, merges main. */
function squashedParentThenMergedRelease(): { repository: LandingRepository; worktree: string } {
	const repository = landingRepositoryOf()
	const child = stackedChildOf(repository)
	mergeOnOrigin({ repository, how: 'squash' })
	editOnOrigin({ repository, files: RELEASE })
	mergeBaseInto({ worktree: child.worktree })
	return { repository, worktree: child.worktree }
}

/**
 * The parent squash-merged on origin's main, main then edits the parent's line, and the child, never rebased, merges
 * main resolving the conflict to main's text; main's new tip.
 */
function squashedParentThenEditedOnMain(): {
	repository: LandingRepository
	worktree: string
	main: string
} {
	const repository = landingRepositoryOf()
	const child = stackedChildOf(repository)
	mergeOnOrigin({ repository, how: 'squash' })
	const main = editOnOrigin({ repository, files: EDITED_ON_MAIN })
	mergeBaseResolving({ worktree: child.worktree, files: EDITED_ON_MAIN })
	return { repository, worktree: child.worktree, main }
}
