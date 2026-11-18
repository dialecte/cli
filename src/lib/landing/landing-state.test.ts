/**
 * `readLandingState` on scratch repositories whose origin's main moves by real git merges, the host faked: one row per
 * evidence (empty, ancestor, host, tree), the pull requests that are not the lot's, closed ones, and the squashes git
 * alone cannot prove (later local work, main editing the same lines). Each row builds its own repository.
 */
import { LOT_FILE, ORIGIN_MAIN } from '../../../test/landing-repository.constants.ts'
import {
	commitIn,
	editOnOrigin,
	landingHostOf,
	landingRepositoryOf,
	mergeOnOrigin,
	pullRequestOf,
	revertOnOrigin,
	reuseBranchName,
	commitEarlierLot,
	strayCommitOf,
	amendLot,
} from '../../../test/landing-repository.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readLandingState } from './landing-state.ts'

import { describe, expect, it } from 'vitest'

import type { LandingRepository } from '../../../test/landing-repository.types.ts'
import type { HostAdapter } from '../host/host.types.ts'
import type { LandingQuery, LandingState } from './landing-state.types.ts'

/** What a row arranges beyond the repository: the host, the pull request the landing recorded, the branch's tip. */
type Arranged = {
	host?: HostAdapter
	pullNumber?: number
	tip?: string
	/** The branch and base ref the query names, when not the lot's and origin's main. */
	branch?: string
	baseRef?: string
	/** When the lot was created (its identity's `created`), when the row gives it. */
	since?: string
}

type Row = {
	title: string
	arrange: (repository: LandingRepository) => Arranged
	expected: (params: { repository: LandingRepository; tip: string }) => LandingState
}

/** The lot's branch tip in the repository. */
function tipOf(repository: LandingRepository): string {
	return git({
		root: repository.root,
		args: ['rev-parse', `refs/heads/${repository.branch}`],
	}).trim()
}

const ROWS: Row[] = [
	{
		title: 'a branch with no commit beyond its cut -> empty',
		arrange: (repository) => {
			git({ root: repository.worktree, args: ['reset', '-q', '--hard', repository.cut] })
			return {}
		},
		expected: () => ({ kind: 'empty' }),
	},
	{
		title: "a branch fast-forwarded into origin's main -> merged by ancestor",
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'fast-forward' })
			return {}
		},
		expected: ({ tip }) => ({ kind: 'merged', how: 'ancestor', tip }),
	},
	{
		title: "a branch merged into origin's main by a merge commit -> merged by ancestor",
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'merge-commit' })
			return {}
		},
		expected: ({ tip }) => ({ kind: 'merged', how: 'ancestor', tip }),
	},
	{
		title: 'a branch squash-merged on origin, no host -> merged by tree',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			return {}
		},
		expected: ({ tip }) => ({ kind: 'merged', how: 'tree', tip }),
	},
	{
		title:
			'a squash merge, then a later local commit, its branch on origin -> unlanded, not provable offline',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			const tip = commitIn({
				root: repository.worktree,
				files: { 'src/later.ts': 'export const later = 1\n' },
				message: 'feat(x): later work',
			})
			return { tip }
		},
		expected: () => ({ kind: 'unlanded', proof: 'offline-unproven' }),
	},
	{
		title:
			'a squash merge, then main edits the same lines, no host -> unlanded, not provable offline',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 2\n' } })
			return {}
		},
		expected: () => ({ kind: 'unlanded', proof: 'offline-unproven' }),
	},
	{
		title: 'a squash merge, then main reverts it, no host -> unlanded, not provable offline',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			revertOnOrigin({ repository })
			return {}
		},
		expected: () => ({ kind: 'unlanded', proof: 'offline-unproven' }),
	},
	{
		title:
			'work never pushed, no pull request recorded, no host -> unlanded, nothing suggests a landing',
		arrange: () => ({}),
		expected: () => ({ kind: 'unlanded' }),
	},
	{
		title:
			'a pull request recorded, its branch not on origin, main edited the same lines, no host -> unlanded, not provable offline',
		arrange: (repository) => {
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 2\n' } })
			return { pullNumber: 7 }
		},
		expected: () => ({ kind: 'unlanded', proof: 'offline-unproven' }),
	},
	{
		title: 'a branch that does not resolve -> unknown naming it',
		arrange: () => ({ branch: 'feat/gone' }),
		expected: () => ({ kind: 'unknown', reason: 'the branch feat/gone does not resolve' }),
	},
	{
		title: 'a base ref that does not resolve -> unknown naming it',
		arrange: () => ({ baseRef: 'refs/remotes/origin/none' }),
		expected: () => ({
			kind: 'unknown',
			reason: 'the base refs/remotes/origin/none does not resolve: fetch origin',
		}),
	},
]

const HOST_ROWS: Row[] = [
	{
		title:
			'a squash merge the host reports merged, by the recorded number -> merged by host, its pull request kept',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			return {
				pullNumber: 7,
				host: landingHostOf({
					byNumber: { 7: pullRequestOf({ number: 7, state: 'merged', head: repository.tip }) },
				}).host,
			}
		},
		expected: ({ tip }) => ({
			kind: 'merged',
			how: 'host',
			tip,
			pull: pullRequestOf({ number: 7, state: 'merged', head: tip }),
		}),
	},
	{
		title: 'a pull request found by branch, opened outside lot land, merged -> merged by host',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 2\n' } })
			return {
				host: landingHostOf({
					byBranch: {
						[repository.branch]: pullRequestOf({
							number: 9,
							state: 'merged',
							head: repository.tip,
						}),
					},
				}).host,
			}
		},
		expected: ({ tip }) => ({
			kind: 'merged',
			how: 'host',
			tip,
			pull: pullRequestOf({ number: 9, state: 'merged', head: tip }),
		}),
	},
	{
		title:
			'a merged pull request of the same branch name whose head the branch never reached -> not the lot s: unlanded',
		arrange: (repository) => ({
			host: landingHostOf({
				byBranch: {
					[repository.branch]: pullRequestOf({ number: 3, state: 'merged', head: repository.cut }),
				},
			}).host,
		}),
		expected: () => ({ kind: 'unlanded' }),
	},
	{
		title: 'work not in the base and an open draft pull request -> unlanded with the pull request',
		arrange: (repository) => ({
			pullNumber: 7,
			host: landingHostOf({
				byNumber: {
					7: pullRequestOf({ number: 7, state: 'open', head: repository.tip, draft: true }),
				},
			}).host,
		}),
		expected: ({ tip }) => ({
			kind: 'unlanded',
			pull: pullRequestOf({ number: 7, state: 'open', head: tip, draft: true }),
		}),
	},
	{
		title: 'a pull request closed unmerged, its work not in the base -> closed',
		arrange: (repository) => ({
			pullNumber: 7,
			host: landingHostOf({
				byNumber: { 7: pullRequestOf({ number: 7, state: 'closed', head: repository.tip }) },
			}).host,
		}),
		expected: ({ tip }) => ({
			kind: 'closed',
			pull: pullRequestOf({ number: 7, state: 'closed', head: tip }),
		}),
	},
	{
		title: 'a host refusal on a squash merge -> the git evidence decides: merged by tree',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			return { pullNumber: 7, host: landingHostOf({ refusal: 'gh: offline' }).host }
		},
		expected: ({ tip }) => ({ kind: 'merged', how: 'tree', tip }),
	},
	{
		title:
			'a merged pull request found by branch whose head is another branch s commit beyond the cut -> not the lot s: unlanded',
		arrange: (repository) => ({
			host: landingHostOf({
				byBranch: {
					[repository.branch]: pullRequestOf({
						number: 3,
						state: 'merged',
						head: strayCommitOf({ root: repository.root, parent: repository.cut }),
					}),
				},
			}).host,
		}),
		expected: () => ({ kind: 'unlanded' }),
	},
	{
		title:
			'a merged pull request found by branch whose head the branch held before an amend -> merged by host at that head',
		arrange: (repository) => {
			amendLot({ worktree: repository.worktree })
			return {
				host: landingHostOf({
					byBranch: {
						[repository.branch]: pullRequestOf({
							number: 9,
							state: 'merged',
							head: repository.tip,
						}),
					},
				}).host,
			}
		},
		expected: ({ repository }) => ({
			kind: 'merged',
			how: 'host',
			tip: repository.tip,
			pull: pullRequestOf({ number: 9, state: 'merged', head: repository.tip }),
		}),
	},
	{
		title:
			'a branch name reused by a new lot, an older merged pull request of that name whose head the branch held before the lot was created -> not this lot s: unlanded',
		arrange: (repository) => {
			const earlier = reuseBranchName({
				worktree: repository.worktree,
				cut: repository.cut,
				at: '2026-01-01T00:00:00Z',
			})
			commitIn({
				root: repository.worktree,
				files: { 'src/new.ts': 'export const fresh = 1\n' },
				message: 'feat(x): the new lot',
			})
			return {
				since: '2026-06-01T00:00:00.000Z',
				host: landingHostOf({
					byBranch: {
						[repository.branch]: pullRequestOf({ number: 4, state: 'merged', head: earlier }),
					},
				}).host,
			}
		},
		expected: () => ({ kind: 'unlanded' }),
	},
	{
		title:
			'a branch name reused by a new lot that keeps the old tip and builds on it, an older merged pull request of that name whose head the branch held before the lot was created and its new tip holds -> not this lot s: unlanded',
		arrange: (repository) => {
			const earlier = commitEarlierLot({
				worktree: repository.worktree,
				at: '2026-01-01T00:00:00Z',
			})
			commitIn({
				root: repository.worktree,
				files: { 'src/new.ts': 'export const fresh = 1\n' },
				message: 'feat(x): the new lot',
			})
			return {
				since: '2026-06-01T00:00:00.000Z',
				host: landingHostOf({
					byBranch: {
						[repository.branch]: pullRequestOf({ number: 4, state: 'merged', head: earlier }),
					},
				}).host,
			}
		},
		expected: () => ({ kind: 'unlanded' }),
	},
	{
		title: 'a queued pull request, its work not in the base -> unlanded with the pull request',
		arrange: (repository) => ({
			pullNumber: 7,
			host: landingHostOf({
				byNumber: {
					7: pullRequestOf({ number: 7, state: 'open', head: repository.tip, queued: true }),
				},
			}).host,
		}),
		expected: ({ tip }) => ({
			kind: 'unlanded',
			pull: pullRequestOf({ number: 7, state: 'open', head: tip, queued: true }),
		}),
	},
	{
		title:
			'a host refusal, the work not in the base, a pull request recorded -> unlanded naming the refusal, not provable offline',
		arrange: () => ({ pullNumber: 7, host: landingHostOf({ refusal: 'gh: offline' }).host }),
		expected: () => ({ kind: 'unlanded', hostRefusal: 'gh: offline', proof: 'offline-unproven' }),
	},
]

/** The row's repository arranged, the query of its lot, and the state the row expects. */
function arrangeRow(row: Row): { query: LandingQuery; expected: LandingState } {
	const repository = landingRepositoryOf()
	const arranged = row.arrange(repository)
	return {
		query: {
			root: repository.root,
			branch: arranged.branch ?? repository.branch,
			baseRef: arranged.baseRef ?? ORIGIN_MAIN,
			cut: repository.cut,
			pullNumber: arranged.pullNumber,
			host: arranged.host,
			...(arranged.since !== undefined && { since: arranged.since }),
		},
		expected: row.expected({ repository, tip: arranged.tip ?? tipOf(repository) }),
	}
}

describe('readLandingState: git evidence', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const row of ROWS)
		it(row.title, () => {
			const { query, expected } = arrangeRow(row)

			expect(readLandingState(query)).toEqual(expected)
		})
})

describe('readLandingState: host evidence', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const row of HOST_ROWS)
		it(row.title, () => {
			const { query, expected } = arrangeRow(row)

			expect(readLandingState(query)).toEqual(expected)
		})
})
