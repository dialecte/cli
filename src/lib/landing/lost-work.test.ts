/**
 * `lostWork` and `workSinceLanding` over scratch repositories whose origin's main moves by real git merges
 * (FIX-landed-leftovers design, section 6): one row per removal and history - a worktree removal after a rebase, a
 * reset, a detached commit or an aborted rebase; a branch removal after a squash, a dropped commit, a stack, a
 * whitespace-only twin, an empty commit, a merge commit, origin's copy of the branch; and no base branch at all. Each
 * row asserts the whole result.
 */
import { CHILD_BRANCH, LOT_FILE, ORIGIN_MAIN } from '../../../test/landing-repository.constants.ts'
import {
	amendLot,
	branchWithCommits,
	commitDetached,
	commitIn,
	commitThenReset,
	editOnOrigin,
	emptyCommitIn,
	expireHeadReflog,
	headOf,
	landingRepositoryOf,
	mergeCommitIn,
	mergeOnOrigin,
	pushBranch,
	rebaseAborted,
	rebaseOnto,
	rebaseResolving,
	stackedChildOf,
} from '../../../test/landing-repository.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lostWork, workSinceLanding } from './lost-work.ts'

import { describe, expect, it } from 'vitest'

import type { LandingRepository } from '../../../test/landing-repository.types.ts'
import type { LostCommit, Removal } from './lost-work.types.ts'

/** What a row arranges after the lot's first commit: the removal, the landed tips, and what it expects lost. */
type Arranged = {
	removes: Removal
	landedTips: string[]
	expected: LostCommit[]
}

type LostRow = { title: string; arrange: (repository: LandingRepository) => Arranged }

/** The removal of the lot's worktree alone: its branch stays. */
function worktreeRemoval(repository: LandingRepository): Removal {
	return { worktrees: [repository.worktree], branches: [] }
}

/** The removal of a branch alone (the lot's when left out). */
function branchRemoval(params: { repository: LandingRepository; branch?: string }): Removal {
	return { worktrees: [], branches: [params.branch ?? params.repository.branch] }
}

/** A file only main writes: main moving on without touching the lot's lines. */
const MAIN_ONLY = { 'src/main.ts': 'export const main = 1\n' }

/** A file a lot edits near its top while main edits it near its bottom: the lot's change keeps its place. */
const SHARED_FILE = 'src/shared.ts'

/** The shared file: `top` on its second line, `bottom` on its nineteenth. */
function sharedTextOf(params: { top: string; bottom: string }): string {
	const middle = Array.from({ length: 16 }, (_unused, index) => `m${index + 3}`).join('\n')
	return `m1\n${params.top}\n${middle}\n${params.bottom}\nm20\n`
}

/** A file holding two identical blocks, each ending its body on `return <value>`. */
const TWO_BLOCKS_FILE = 'src/blocks.ts'

/** The two-blocks file with the value each block returns. */
function twoBlocksOf(params: { first: string; second: string }): string {
	return `top\n${blockOf(params.first)}s1\ns2\ns3\ns4\ns5\ns6\ns7\n${blockOf(params.second)}`
}

/** One block of the two-blocks file, returning `value`. */
function blockOf(value: string): string {
	return `a1\na2\na3\nreturn ${value}\nb1\nb2\nb3\n`
}

/** A file whose last line a lot changes while main adds lines above it. */
const SHIFTED_FILE = 'src/shifted.ts'
const SHIFTED_TEXT = 'l1\nl2\nl3\nl4\nl5\n'

const WORKTREE_ROWS: LostRow[] = [
	{
		title:
			'1. a worktree removal, the branch rebased cleanly, the old head only in the branch reflog -> nothing lost',
		arrange: (repository) => {
			editOnOrigin({ repository, files: MAIN_ONLY })
			rebaseOnto({ worktree: repository.worktree, onto: ORIGIN_MAIN })
			return { removes: worktreeRemoval(repository), landedTips: [], expected: [] }
		},
	},
	{
		title: '2. a worktree removal, a rebase with a conflict resolved by hand -> nothing lost',
		arrange: (repository) => {
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 5\n' } })
			rebaseResolving({
				worktree: repository.worktree,
				onto: ORIGIN_MAIN,
				files: { [LOT_FILE]: 'export const x = 15\n' },
			})
			return { removes: worktreeRemoval(repository), landedTips: [], expected: [] }
		},
	},
	{
		title:
			'3. a worktree removal, work committed then reset away -> nothing lost: the branch reflog holds it',
		arrange: (repository) => {
			commitThenReset({
				worktree: repository.worktree,
				files: { 'src/dropped.ts': 'export const dropped = 1\n' },
			})
			return { removes: worktreeRemoval(repository), landedTips: [], expected: [] }
		},
	},
	{
		title: '4. a worktree removal, a commit made on a detached HEAD -> lost, detached',
		arrange: (repository) => {
			const detached = commitDetached({
				worktree: repository.worktree,
				files: { 'src/detached.ts': 'export const detached = 1\n' },
			})
			return {
				removes: worktreeRemoval(repository),
				landedTips: [],
				expected: [{ commit: detached, why: 'detached' }],
			}
		},
	},
	{
		title:
			'4b. a worktree removal, a commit made on a detached HEAD, the branch checked out again -> still lost, detached',
		arrange: (repository) => {
			const detached = commitDetached({
				worktree: repository.worktree,
				files: { 'src/detached.ts': 'export const detached = 1\n' },
				reattach: true,
			})
			return {
				removes: worktreeRemoval(repository),
				landedTips: [],
				expected: [{ commit: detached, why: 'detached' }],
			}
		},
	},
	{
		title:
			'5. a worktree removal, an aborted rebase s picks only in the HEAD reflog -> nothing lost: their twins are in the branch',
		arrange: (repository) => {
			commitIn({
				root: repository.worktree,
				files: { 'src/b.ts': 'export const b = 1\n' },
				message: 'feat(x): b',
			})
			editOnOrigin({ repository, files: { 'src/b.ts': 'export const b = 2\n' } })
			const picks = rebaseAborted({ worktree: repository.worktree, onto: ORIGIN_MAIN })
			// the row's premise: the rebase picked the first commit before it stopped
			if (picks.length !== 1)
				throw new Error(`the aborted rebase picked ${picks.length} commit(s), not 1`)
			return { removes: worktreeRemoval(repository), landedTips: [], expected: [] }
		},
	},
	{
		title:
			'15. a worktree removal, a commit on its detached HEAD whose HEAD reflog expired -> its current HEAD still a candidate: lost, detached',
		arrange: (repository) => {
			const detached = commitDetached({
				worktree: repository.worktree,
				files: { 'src/detached.ts': 'export const detached = 1\n' },
			})
			expireHeadReflog({ worktree: repository.worktree })
			// the row's premise: the HEAD reflog names nothing, the detached commit is the worktree's HEAD only
			const reflog = git({
				root: repository.worktree,
				args: ['reflog', 'show', '--format=%H', 'HEAD', '--'],
			}).trim()
			if (reflog !== '') throw new Error(`the HEAD reflog still names ${reflog}`)
			return {
				removes: worktreeRemoval(repository),
				landedTips: [],
				expected: [{ commit: detached, why: 'detached' }],
			}
		},
	},
]

const BRANCH_ROWS: LostRow[] = [
	{
		title:
			'6. a branch removal, two commits rebased cleanly, landed by squash, the landed tip given -> nothing lost: each old commit has its twin under the landed tip',
		arrange: (repository) => {
			// b edits a file main edits too, far below: the same change at the same place, on another blob
			editOnOrigin({
				repository,
				files: { [SHARED_FILE]: sharedTextOf({ top: 'a', bottom: 'z' }) },
			})
			rebaseOnto({ worktree: repository.worktree, onto: ORIGIN_MAIN })
			commitIn({
				root: repository.worktree,
				files: { [SHARED_FILE]: sharedTextOf({ top: 'b', bottom: 'z' }) },
				message: 'feat(x): b',
			})
			editOnOrigin({
				repository,
				files: { [SHARED_FILE]: sharedTextOf({ top: 'a', bottom: 'y' }) },
			})
			const rebased = rebaseOnto({ worktree: repository.worktree, onto: ORIGIN_MAIN })
			mergeOnOrigin({ repository, how: 'squash' })
			return {
				removes: branchRemoval({ repository }),
				landedTips: [rebased],
				expected: [],
			}
		},
	},
	{
		title:
			'7. a branch removal, a rebase with a conflict resolved by hand, landed by squash, the landed tip given -> the old head lost, dropped',
		arrange: (repository) => {
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 5\n' } })
			const resolved = rebaseResolving({
				worktree: repository.worktree,
				onto: ORIGIN_MAIN,
				files: { [LOT_FILE]: 'export const x = 15\n' },
			})
			mergeOnOrigin({ repository, how: 'squash' })
			return {
				removes: branchRemoval({ repository }),
				landedTips: [resolved],
				expected: [{ commit: repository.tip, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'8. a branch removal, its work fast-forwarded into main, a commit then dropped by a reset -> that commit lost, dropped',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'fast-forward' })
			const dropped = commitThenReset({
				worktree: repository.worktree,
				files: { 'src/dropped.ts': 'export const dropped = 1\n' },
			})
			return {
				removes: branchRemoval({ repository }),
				landedTips: [],
				expected: [{ commit: dropped, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'9. a stack: the parent amended after the child s cut and landed, the parent s branch removed, then the child s -> the parent s old commit (the child s cut) lost at the child s removal',
		arrange: (repository) => {
			const child = stackedChildOf(repository)
			const amended = amendLot({ worktree: repository.worktree })
			mergeOnOrigin({ repository, how: 'squash' })
			// the parent's branch removed first: its worktree let go of it, then the branch deleted
			git({ root: repository.worktree, args: ['checkout', '-q', '--detach'] })
			git({ root: repository.root, args: ['branch', '-q', '-D', repository.branch] })
			const childLanded = rebaseOnto({
				worktree: child.worktree,
				onto: ORIGIN_MAIN,
				upstream: repository.tip,
			})
			mergeOnOrigin({ repository, how: 'squash', branch: CHILD_BRANCH })
			return {
				removes: branchRemoval({ repository, branch: CHILD_BRANCH }),
				landedTips: [amended, childLanded],
				expected: [{ commit: repository.tip, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'10. a branch removal, a dedent whose only twin differs in whitespace (a tab removed, not two spaces) -> not a twin: lost, dropped',
		arrange: (repository) => {
			const shared = commitIn({
				root: repository.worktree,
				files: { 'src/w.ts': 'a\n  foo\nb\n' },
				message: 'feat(x): w',
			})
			mergeOnOrigin({ repository, how: 'fast-forward' })
			branchWithCommits({
				repository,
				branch: 'side',
				from: shared,
				commits: [
					{ files: { 'src/w.ts': 'a\n\tfoo\nb\n' }, message: 'style: tab' },
					{ files: { 'src/w.ts': 'a\nfoo\nb\n' }, message: 'style: dedent the tab' },
				],
			})
			const dedent = commitIn({
				root: repository.worktree,
				files: { 'src/w.ts': 'a\nfoo\nb\n' },
				message: 'style: dedent the spaces',
			})
			return {
				removes: branchRemoval({ repository }),
				landedTips: [],
				expected: [{ commit: dedent, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'11. a branch removal, an empty commit, another empty commit on a surviving branch -> never a twin: lost, dropped',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'fast-forward' })
			branchWithCommits({
				repository,
				branch: 'side',
				from: repository.tip,
				commits: [{ message: 'chore: empty on the side' }],
			})
			const empty = emptyCommitIn({ root: repository.worktree, message: 'chore: empty' })
			return {
				removes: branchRemoval({ repository }),
				landedTips: [],
				expected: [{ commit: empty, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'12. a branch removal, a merge commit only in the removed reflog, its change carried by a surviving branch -> never held by content: lost, dropped',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'fast-forward' })
			branchWithCommits({
				repository,
				branch: 'topic',
				from: repository.tip,
				commits: [{ files: { 'src/t.ts': 'export const t = 1\n' }, message: 'feat(t): t' }],
			})
			// the same change on another surviving branch, no ancestor of the merge: a content twin of its first-parent diff
			branchWithCommits({
				repository,
				branch: 'side',
				from: repository.tip,
				commits: [{ files: { 'src/t.ts': 'export const t = 1\n' }, message: 'feat(t): t again' }],
			})
			const merge = mergeCommitIn({ root: repository.worktree, topic: 'topic' })
			git({ root: repository.worktree, args: ['reset', '-q', '--hard', 'HEAD~1'] })
			return {
				removes: branchRemoval({ repository }),
				landedTips: [],
				expected: [{ commit: merge, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'13. a branch removal, the branch pushed to origin, never merged -> origin s copy of the removed branch holds nothing: lost, dropped',
		arrange: (repository) => {
			pushBranch({ repository })
			return {
				removes: branchRemoval({ repository }),
				landedTips: [],
				expected: [{ commit: repository.tip, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'14. no base branch resolves (origin s main gone), a worktree removal, a commit made on a detached HEAD -> still decided: lost, detached',
		arrange: (repository) => {
			git({ root: repository.root, args: ['update-ref', '-d', ORIGIN_MAIN] })
			const detached = commitDetached({
				worktree: repository.worktree,
				files: { 'src/detached.ts': 'export const detached = 1\n' },
				reattach: true,
			})
			return {
				removes: worktreeRemoval(repository),
				landedTips: [],
				expected: [{ commit: detached, why: 'detached' }],
			}
		},
	},
	{
		title:
			'16. a branch removal, a file with two identical blocks, main editing the first, a commit editing the second then reset away -> not a twin of main s edit: lost, dropped',
		arrange: (repository) => {
			commitIn({
				root: repository.worktree,
				files: { [TWO_BLOCKS_FILE]: twoBlocksOf({ first: 'x', second: 'x' }) },
				message: 'feat(x): two blocks',
			})
			mergeOnOrigin({ repository, how: 'fast-forward' })
			editOnOrigin({
				repository,
				files: { [TWO_BLOCKS_FILE]: twoBlocksOf({ first: 'y', second: 'x' }) },
			})
			const dropped = commitThenReset({
				worktree: repository.worktree,
				files: { [TWO_BLOCKS_FILE]: twoBlocksOf({ first: 'x', second: 'y' }) },
			})
			return {
				removes: branchRemoval({ repository }),
				landedTips: [],
				expected: [{ commit: dropped, why: 'dropped' }],
			}
		},
	},
	{
		title:
			'17. a branch removal, a rebase that shifted the change s lines (main added lines above it), the rebased head landed -> no twin: the old head lost, dropped',
		arrange: (repository) => {
			commitIn({
				root: repository.worktree,
				files: { [SHIFTED_FILE]: SHIFTED_TEXT },
				message: 'feat(x): five lines',
			})
			mergeOnOrigin({ repository, how: 'fast-forward' })
			const old = commitIn({
				root: repository.worktree,
				files: { [SHIFTED_FILE]: SHIFTED_TEXT.replace('l5', 'L5') },
				message: 'feat(x): the last line',
			})
			editOnOrigin({ repository, files: { [SHIFTED_FILE]: `n1\nn2\nn3\nn4\nn5\n${SHIFTED_TEXT}` } })
			const rebased = rebaseOnto({ worktree: repository.worktree, onto: ORIGIN_MAIN })
			return {
				removes: branchRemoval({ repository }),
				landedTips: [rebased],
				expected: [{ commit: old, why: 'dropped' }],
			}
		},
	},
]

describe('lostWork', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const row of [...WORKTREE_ROWS, ...BRANCH_ROWS])
		it(row.title, () => {
			const repository = landingRepositoryOf()
			const { removes, landedTips, expected } = row.arrange(repository)

			expect(lostWork({ root: repository.root, removes, landedTips })).toEqual(expected)
		})
})

/** What a `workSinceLanding` row arranges: the landed tip it gives, and the commits it expects named. */
type SinceRow = {
	title: string
	arrange: (repository: LandingRepository) => { landedTip: string; expected: string[] }
}

const SINCE_ROWS: SinceRow[] = [
	{
		title: 'a squash-merged lot, its tip the landed tip -> no work since its landing',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			return { landedTip: repository.tip, expected: [] }
		},
	},
	{
		title: 'a squash-merged lot with a commit made after the merge -> only that commit named',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			const after = commitIn({
				root: repository.worktree,
				files: { 'src/after.ts': 'export const after = 1\n' },
				message: 'feat(x): after',
			})
			return { landedTip: repository.tip, expected: [after] }
		},
	},
	{
		title:
			'a squash merge, then main edits the same lines, the landed tip given -> no work since its landing',
		arrange: (repository) => {
			mergeOnOrigin({ repository, how: 'squash' })
			editOnOrigin({ repository, files: { [LOT_FILE]: 'export const x = 2\n' } })
			return { landedTip: headOf(repository.worktree), expected: [] }
		},
	},
]

describe('workSinceLanding', { timeout: SCRATCH_GIT_CASE_TIMEOUT }, () => {
	for (const row of SINCE_ROWS)
		it(row.title, () => {
			const repository = landingRepositoryOf()
			const { landedTip, expected } = row.arrange(repository)

			expect(
				workSinceLanding({
					root: repository.root,
					branch: repository.branch,
					cut: repository.cut,
					landedTip,
				}),
			).toEqual(expected)
		})
})
