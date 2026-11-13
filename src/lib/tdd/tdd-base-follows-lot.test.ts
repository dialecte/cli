/**
 * The whole-branch base follows the lot's base branch (TB3): where the lot's base ref comes from (the store lot's
 * identity, else the worktree baseline's `from`), the merge-base it moves to once the lot took the base branch's new
 * commits, and the cut it falls back to, with the note saying why.
 */
import { createBriefWorkspace } from '../../../test/brief-workspace.ts'
import { commitOf } from '../../../test/rule-gaps-base-branch.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import {
	BASE_BRANCH,
	BASE_TAG,
	EXEMPT_LOT_FILE,
	EXEMPT_REASON,
	OTHER_BRANCH,
	VITEST_PACKAGE_JSON,
} from '../../../test/tdd-bugs-follows-lot.constants.ts'
import {
	advanceBranch,
	createLotScenario,
	deleteBranch,
	fastForwardLot,
	fromSource,
	linkStoreLot,
	mergeIntoLot,
	mergeLotInto,
	rebaseLot,
	rewriteBranch,
	shortOf,
	tagAt,
} from '../../../test/tdd-bugs-follows-lot.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { checkTddReceipts } from './check-tdd-receipts.ts'
import { resolveTddBase } from './tdd-base.ts'
import { TDD_BASE_LINE, TDD_BASE_NOTES, TDD_BASE_SOURCES } from './tdd.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe(
	'resolveTddBase: the whole-branch base follows the lot base branch',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('TB3-c the baseline records from feat/x, feat/x gained a commit that was merged into the lot → the new merge-base, from the worktree’s from', () => {
			const { root } = createLotScenario({ from: BASE_BRANCH })
			const tip = advanceBranch({ root, branch: BASE_BRANCH })
			mergeIntoLot({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: tip,
				source: fromSource(BASE_BRANCH),
			})
		})

		it('TB3-b the baseline records from feat/x, feat/x gained a commit not merged into the lot → the cut', () => {
			const { root, cut } = createLotScenario({ from: BASE_BRANCH })
			advanceBranch({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: fromSource(BASE_BRANCH),
			})
		})

		it('TB3-a a store lot on base feat/x, no from in the baseline, feat/x gained a commit merged into the lot → the new merge-base, from the lot’s base', () => {
			const workspace = createBriefWorkspace()
			const { root, cut } = createLotScenario({ root: workspace.repository })
			linkStoreLot({ workspace, baseRef: BASE_BRANCH, cut })
			const tip = advanceBranch({ root, branch: BASE_BRANCH })
			mergeIntoLot({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: tip,
				source: TDD_BASE_SOURCES.lotBase.replace('{ref}', () => BASE_BRANCH),
			})
		})

		it('TB3-e a store lot on base feat/x, no from in the baseline, feat/x was deleted → the cut, with the note that feat/x is not found', () => {
			const workspace = createBriefWorkspace()
			const { root, cut } = createLotScenario({ root: workspace.repository })
			linkStoreLot({ workspace, baseRef: BASE_BRANCH, cut })
			deleteBranch({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.notFound.replace('{ref}', () => BASE_BRANCH),
			})
		})

		it('TB3-a a store lot on base feat/x and a baseline from feat/y → the store’s ref decides, not the from', () => {
			const workspace = createBriefWorkspace()
			const { root, cut } = createLotScenario({ root: workspace.repository, from: OTHER_BRANCH })
			git({ root, args: ['branch', OTHER_BRANCH, 'main'] })
			linkStoreLot({ workspace, baseRef: BASE_BRANCH, cut })
			const tip = advanceBranch({ root, branch: BASE_BRANCH })
			mergeIntoLot({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: tip,
				source: TDD_BASE_SOURCES.lotBase.replace('{ref}', () => BASE_BRANCH),
			})
		})

		it('Q7 a store lot whose base ref is a commit id, main is the base branch and gained a commit merged into the lot → the new merge-base, from the base branch with the lot’s base said to be a commit', () => {
			const workspace = createBriefWorkspace()
			const { root, cut } = createLotScenario({ root: workspace.repository, cutFrom: 'main' })
			linkStoreLot({ workspace, baseRef: shortOf({ root, commit: cut }), cut })
			const tip = advanceBranch({ root, branch: 'main' })
			mergeIntoLot({ root, branch: 'main' })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: tip,
				source: TDD_BASE_SOURCES.baseBranchOfCommit.replace('{branch}', () => 'main'),
			})
		})

		it('TB3-d a baseline without from and no store lot → the cut, with the note that no base branch is recorded', () => {
			const { root, cut } = createLotScenario()
			advanceBranch({ root, branch: BASE_BRANCH })
			mergeIntoLot({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.noneRecorded,
			})
		})

		it('TB3-e the baseline records from feat/x and feat/x was deleted → the cut, with the note that feat/x is not found', () => {
			const { root, cut } = createLotScenario({ from: BASE_BRANCH })
			deleteBranch({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.notFound.replace('{ref}', () => BASE_BRANCH),
			})
		})

		it('TB3-f the baseline records from feat/x and feat/x merged the lot’s branch → the cut, with the note that feat/x holds the lot’s own commits', () => {
			const { root, cut } = createLotScenario({ from: BASE_BRANCH })
			mergeLotInto({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.holdsOwnCommits.replace('{ref}', () => BASE_BRANCH),
			})
		})

		it('X3 the baseline records from a tag, the tagged commit merged into the lot → the merge-base with the tag', () => {
			const { root } = createLotScenario({ from: BASE_TAG })
			const tip = advanceBranch({ root, branch: BASE_BRANCH })
			tagAt({ root, tag: BASE_TAG, at: tip })
			mergeIntoLot({ root, branch: BASE_TAG })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: tip,
				source: fromSource(BASE_TAG),
			})
		})

		it('X4a the lot branch was fast-forwarded onto feat/x’s new tip, no commit of its own → the new merge-base', () => {
			const { root } = createLotScenario({ from: BASE_BRANCH, ownCommit: false })
			const tip = advanceBranch({ root, branch: BASE_BRANCH })
			fastForwardLot({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: tip,
				source: fromSource(BASE_BRANCH),
			})
		})

		it('X4a the lot kept its own commit and was rebased onto feat/x’s new tip → the new merge-base', () => {
			const { root, cut } = createLotScenario({ from: BASE_BRANCH })
			const tip = advanceBranch({ root, branch: BASE_BRANCH })
			rebaseLot({ root, onto: tip, cut })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: tip,
				source: fromSource(BASE_BRANCH),
			})
		})

		it('X4b feat/x was rewritten and the lot rebased onto the rewritten tip, the cut an ancestor of neither HEAD nor feat/x → the cut, with the note naming the cut and the merge-base', () => {
			const { root, cut } = createLotScenario({ from: BASE_BRANCH })
			rewriteBranch({ root, branch: BASE_BRANCH, onto: 'main' })
			const rewritten = commitOf({ root, rev: BASE_BRANCH })
			rebaseLot({ root, onto: rewritten, cut })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.rewritten
					.replace('{ref}', () => BASE_BRANCH)
					.replace('{cut}', () => shortOf({ root, commit: cut }))
					.replace('{mergeBase}', () => shortOf({ root, commit: rewritten })),
			})
		})

		it('X4b feat/x was rewritten so the cut is no ancestor of its merge-base with the lot → the cut, with the note naming the cut and the merge-base', () => {
			const { root, cut, start } = createLotScenario({ from: BASE_BRANCH })
			rewriteBranch({ root, branch: BASE_BRANCH, onto: 'main' })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.rewritten
					.replace('{ref}', () => BASE_BRANCH)
					.replace('{cut}', () => shortOf({ root, commit: cut }))
					.replace('{mergeBase}', () => shortOf({ root, commit: start })),
			})
		})

		it('the lot was cut from feat/x, a commit ahead of main, and the baseline records from main (behind the cut) → the cut, with the note that main is behind the cut, not rewritten', () => {
			const { root, cut } = createLotScenario({ from: 'main' })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.behind.replace('{ref}', () => 'main'),
			})
		})

		it('R3-2 a stacked lot: cut on feat/x, feat/x branched from main, main moved past the branch point, the baseline records from main → the cut, with the note that main does not hold the cut, not rewritten', () => {
			const { root, cut } = createLotScenario({ from: 'main' })
			advanceBranch({ root, branch: 'main' })

			expect(resolveTddBase({ root, packageJson: {}, wholeBranch: true })).toEqual({
				commit: cut,
				source: TDD_BASE_SOURCES.worktreeCut,
				note: TDD_BASE_NOTES.notOnRef.replace('{ref}', () => 'main'),
			})
		})

		it('--base main with a baseline recording from feat/x that moved forward → the merge-base with main, the flag wins', () => {
			const { root } = createLotScenario({ from: BASE_BRANCH })
			advanceBranch({ root, branch: BASE_BRANCH })
			mergeIntoLot({ root, branch: BASE_BRANCH })

			expect(resolveTddBase({ root, packageJson: {}, ref: 'main', wholeBranch: true })).toEqual({
				commit: commitOf({ root, rev: 'main' }),
				source: TDD_BASE_SOURCES.flag,
			})
		})
	},
)

describe(
	'checkTddReceipts: the base of the whole-branch step',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('TB3-f the baseline records from feat/x and feat/x merged the lot’s branch → the step measures from the cut, the whole check carries the fallback note as its baseNote', async () => {
			const { root } = createLotScenario({ from: BASE_BRANCH })
			mergeLotInto({ root, branch: BASE_BRANCH })
			writeFiles({ root, files: { '.dialecte/lot.json': EXEMPT_LOT_FILE } })

			const check = await checkTddReceipts({
				root,
				packageJson: VITEST_PACKAGE_JSON,
				wholeBranch: true,
			})

			expect(check).toEqual({
				status: 'passed',
				cases: [],
				note: `exempt: ${EXEMPT_REASON} (1 production file(s), 0 test file(s) changed)`,
				// the fallback note already reads `tdd base: the worktree's cut (...)`: it is the baseNote, not added to the line
				baseNote: TDD_BASE_NOTES.holdsOwnCommits.replace('{ref}', () => BASE_BRANCH),
			})
		})

		it('no hand-over base, the baseline records from feat/x → the step measures from the cut and says where it came from, the change counted from the cut', async () => {
			const { root, cut } = createLotScenario({ from: BASE_BRANCH })
			writeFiles({ root, files: { '.dialecte/lot.json': EXEMPT_LOT_FILE } })

			const check = await checkTddReceipts({
				root,
				packageJson: VITEST_PACKAGE_JSON,
				wholeBranch: true,
			})

			expect(check).toEqual({
				status: 'passed',
				cases: [],
				note: `exempt: ${EXEMPT_REASON} (1 production file(s), 0 test file(s) changed)`,
				baseNote: TDD_BASE_LINE.replace('{commit}', () => shortOf({ root, commit: cut })).replace(
					'{source}',
					() => fromSource(BASE_BRANCH),
				),
			})
		})
	},
)
