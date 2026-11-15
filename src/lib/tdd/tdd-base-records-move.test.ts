/**
 * The whole-branch base records where it moved: once the lot took its base branch's new commits (a main merge or a
 * rebase), the worktree's hygiene baseline moves to HEAD's merge-base with the base branch (the one `gate` resolves
 * when none is recorded), with one `hygiene.baseline-moved` event in a store lot; a base branch rewritten under the lot
 * is refused naming both commits, the baseline unchanged; no base branch found keeps today's cut.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import { createBriefWorkspace, writeStoreLot } from '../../../test/brief-workspace.ts'
import { linkLot } from '../../../test/lot-stores.ts'
import { commitOf } from '../../../test/rule-gaps-base-branch.ts'
import { git } from '../../../test/scratch-repository.ts'
import {
	BASE_BRANCH,
	LOT_BRANCH,
	SCENARIO_LOT_NAME,
} from '../../../test/tdd-bugs-follows-lot.constants.ts'
import {
	advanceBranch,
	createLotScenario,
	mergeIntoLot,
	mergeLotInto,
	rebaseLot,
	rewriteBranch,
	shortOf,
} from '../../../test/tdd-bugs-follows-lot.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { readHygieneBaseline } from '../worktree/hygiene.ts'
import {
	HYGIENE_BASELINE_MOVED_KIND,
	HYGIENE_BASELINE_REWRITTEN,
} from '../worktree/worktree.constants.ts'
import { resolveTddBase } from './tdd-base.ts'
import { TDD_BASE_NOTES, TDD_BASE_SOURCES } from './tdd.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const MAIN_SOURCE = TDD_BASE_SOURCES.baseBranch.replace('{branch}', () => 'main')

/** The `hygiene.baseline-moved` events of the worktree's store lot, their `from` and `to`. */
function movedEventsOf(root: string): { from: unknown; to: unknown }[] {
	const lotFolder = lotOfWorktree({ cwd: root })
	if (lotFolder === undefined) return []
	const file = join(lotFolder, STORE_FILES.events)
	if (!existsSync(file)) return []
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Record<string, unknown>)
		.filter((event) => event.kind === HYGIENE_BASELINE_MOVED_KIND)
		.map((event) => ({ from: event.from, to: event.to }))
}

/** A lot cut on main whose store lot (base main) names the scenario repository as its worktree, linked to it. */
function createStoreLotScenario(): { root: string; cut: string } {
	const workspace = createBriefWorkspace()
	const { root, cut } = createLotScenario({ root: workspace.repository, cutFrom: 'main' })
	// the lot's identity names this worktree: the event goes to the worktree's own lot
	const lotFolder = writeStoreLot({
		workspace,
		name: SCENARIO_LOT_NAME,
		scope: ['src/'],
		worktree: root,
		base: { ref: 'main', commit: cut },
	})
	linkLot({ worktree: root, lotFolder })
	return { root, cut }
}

describe(
	'resolveTddBase: the hygiene baseline follows the base branch',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it('cut on main, nothing recorded, main gained a commit merged into the lot → the new merge-base, from main, the baseline moved there', () => {
			const { root } = createLotScenario({ cutFrom: 'main' })
			const tip = advanceBranch({ root, branch: 'main' })
			mergeIntoLot({ root, branch: 'main' })

			expect({
				base: resolveTddBase({ root, packageJson: {}, wholeBranch: true }),
				baseline: readHygieneBaseline(root)?.head,
			}).toEqual({ base: { commit: tip, source: MAIN_SOURCE }, baseline: tip })
		})

		it('cut on main, nothing recorded, the lot rebased onto main’s new tip → the new merge-base, the baseline moved there', () => {
			const { root, cut } = createLotScenario({ cutFrom: 'main' })
			const tip = advanceBranch({ root, branch: 'main' })
			rebaseLot({ root, onto: tip, cut })

			expect({
				base: resolveTddBase({ root, packageJson: {}, wholeBranch: true }),
				baseline: readHygieneBaseline(root)?.head,
			}).toEqual({ base: { commit: tip, source: MAIN_SOURCE }, baseline: tip })
		})

		it('a store lot on base main, main merged into the lot, the base read twice → one hygiene.baseline-moved event from the cut to the new merge-base', () => {
			const { root, cut } = createStoreLotScenario()
			const tip = advanceBranch({ root, branch: 'main' })
			mergeIntoLot({ root, branch: 'main' })

			resolveTddBase({ root, packageJson: {}, wholeBranch: true })
			resolveTddBase({ root, packageJson: {}, wholeBranch: true })

			expect(movedEventsOf(root)).toEqual([{ from: cut, to: tip }])
		})

		it('main rewritten under the lot (it held the cut, now neither reaches the other) → the refusal naming the cut and the merge-base, the baseline unchanged', () => {
			const { root, cut, start } = createLotScenario({ cutFrom: 'main' })
			rewriteBranch({ root, branch: 'main', onto: start })

			expect({
				base: resolveTddBase({ root, packageJson: {}, wholeBranch: true }),
				baseline: readHygieneBaseline(root)?.head,
			}).toEqual({
				base: {
					failure: HYGIENE_BASELINE_REWRITTEN.replaceAll('{ref}', () => 'main')
						.replace('{cut}', () => shortOf({ root, commit: cut }))
						.replace('{mergeBase}', () => shortOf({ root, commit: start })),
				},
				baseline: cut,
			})
		})

		it('no base branch found (no origin, main renamed) and nothing recorded → the cut with the note that no base branch is recorded, the baseline unchanged', () => {
			const { root, cut } = createLotScenario({ cutFrom: 'main' })
			advanceBranch({ root, branch: 'main' })
			mergeIntoLot({ root, branch: 'main' })
			git({ root, args: ['branch', '-m', 'main', 'trunk'] })

			expect({
				base: resolveTddBase({ root, packageJson: {}, wholeBranch: true }),
				baseline: readHygieneBaseline(root)?.head,
			}).toEqual({
				base: {
					commit: cut,
					source: TDD_BASE_SOURCES.worktreeCut,
					note: TDD_BASE_NOTES.noneRecorded,
				},
				baseline: cut,
			})
		})

		it('cut on feat/x ahead of main, nothing recorded → main is behind the cut: the cut with that note, the baseline unchanged', () => {
			const { root, cut } = createLotScenario()

			expect({
				base: resolveTddBase({ root, packageJson: {}, wholeBranch: true }),
				baseline: readHygieneBaseline(root)?.head,
			}).toEqual({
				base: {
					commit: cut,
					source: TDD_BASE_SOURCES.worktreeCut,
					note: TDD_BASE_NOTES.behind.replace('{ref}', () => 'main'),
				},
				baseline: cut,
			})
		})

		it('the baseline records from feat/x, feat/x moved forward but the lot did not take it → the cut, the baseline unchanged', () => {
			const { root, cut } = createLotScenario({ from: BASE_BRANCH })
			advanceBranch({ root, branch: BASE_BRANCH })

			resolveTddBase({ root, packageJson: {}, wholeBranch: true })

			expect(readHygieneBaseline(root)?.head).toBe(cut)
		})

		it('the baseline records from feat/x, feat/x gained a commit merged into the lot → the baseline moved to the new merge-base', () => {
			const { root } = createLotScenario({ from: BASE_BRANCH })
			const tip = advanceBranch({ root, branch: BASE_BRANCH })
			mergeIntoLot({ root, branch: BASE_BRANCH })

			resolveTddBase({ root, packageJson: {}, wholeBranch: true })

			expect(readHygieneBaseline(root)?.head).toBe(commitOf({ root, rev: tip }))
		})

		it('a store lot whose main moved twice, each merged into the lot and the base read after each → two events, the second from the first tip, the baseline at the second tip', () => {
			const { root, cut } = createStoreLotScenario()
			const first = advanceBranch({ root, branch: 'main' })
			mergeIntoLot({ root, branch: 'main' })
			resolveTddBase({ root, packageJson: {}, wholeBranch: true })
			const second = advanceBranch({ root, branch: 'main' })
			mergeIntoLot({ root, branch: 'main' })

			resolveTddBase({ root, packageJson: {}, wholeBranch: true })

			expect({ events: movedEventsOf(root), baseline: readHygieneBaseline(root)?.head }).toEqual({
				events: [
					{ from: cut, to: first },
					{ from: first, to: second },
				],
				baseline: second,
			})
		})

		it('cut on main, the lot merged into main (a merge commit) → the baseline unchanged', () => {
			const { root, cut } = createLotScenario({ cutFrom: 'main' })
			mergeLotInto({ root, branch: 'main' })

			resolveTddBase({ root, packageJson: {}, wholeBranch: true })

			expect(readHygieneBaseline(root)?.head).toBe(cut)
		})

		it('cut on main, main fast-forwarded onto the lot’s own commit (a landing) → the baseline unchanged, never moved onto HEAD', () => {
			const { root, cut } = createLotScenario({ cutFrom: 'main' })
			git({ root, args: ['switch', '-q', 'main'] })
			git({ root, args: ['merge', '-q', '--ff-only', LOT_BRANCH] })
			git({ root, args: ['switch', '-q', LOT_BRANCH] })

			resolveTddBase({ root, packageJson: {}, wholeBranch: true })

			expect(readHygieneBaseline(root)?.head).toBe(cut)
		})
	},
)
