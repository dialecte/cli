/**
 * `lotBaseOf` on scratch repositories: a lot cut from the base forks at its merge-base with origin's main; a stacked lot
 * forks from its parent's line, read from git (its newest branch tip, the parent ref's reflog), never a recorded tip,
 * and lands on origin's main once the parent merged. The rebase rows run the rebase the base implies and check that
 * only the child's own commit moves.
 */
import {
	CHILD_BRANCH,
	LOT_BRANCH,
	LOT_FILE,
	ORIGIN_MAIN,
} from '../../../test/landing-repository.constants.ts'
import {
	commitIn,
	editOnOrigin,
	headOf,
	landingRepositoryOf,
	mergeOnOrigin,
	stackedChildOf,
} from '../../../test/landing-repository.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotBaseOf } from './lot-base.ts'

import { describe, expect, it } from 'vitest'

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
		const amended = amendParent({ worktree: repository.worktree })
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
		const amended = amendParent({ worktree: repository.worktree })
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

/** The parent's commit amended (another text of its file); the amended commit. Its branch reflog keeps the old one. */
function amendParent(params: { worktree: string }): string {
	writeFiles({ root: params.worktree, files: { [LOT_FILE]: 'export const x = 10\n' } })
	git({
		root: params.worktree,
		args: ['commit', '-q', '-a', '--amend', '-m', 'feat(x): x amended'],
	})
	return headOf(params.worktree)
}
