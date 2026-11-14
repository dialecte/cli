/**
 * Scratch repositories for the tests of the whole-branch tdd base: a lot branch cut from a base branch, with the
 * hygiene baseline `worktree add` would have written at the cut, and the moves the base branch makes afterwards.
 */
import { TDD_BASE_SOURCES } from '../src/lib/tdd/tdd.constants.ts'
import { writeHygieneBaseline } from '../src/lib/worktree/hygiene.ts'
import { writeStoreLot } from './brief-workspace.ts'
import { linkLot } from './lot-stores.ts'
import { commitEmpty, commitOf } from './rule-gaps-base-branch.ts'
import { git, initializeRepository, temporaryFolder, writeFiles } from './scratch-repository.ts'
import {
	BASE_BRANCH,
	BASE_FILE,
	LOT_BRANCH,
	OWN_FILE,
	SCENARIO_LOT_NAME,
	SCENARIO_NOW,
} from './tdd-bugs-follows-lot.constants.ts'

import type { BriefWorkspace } from './brief-workspace.types.ts'
import type { LotScenario } from './tdd-bugs-follows-lot.types.ts'

/**
 * A repository (`root` when given, else a new one on `main`) whose branch `cutFrom` (`feat/x`, made from `main`,
 * unless it is `main`) gains the base file; the lot branch is cut there, the hygiene baseline written at the cut
 * (`from` recorded when given), and the lot makes its own commit (adds `src/own.ts`) unless `ownCommit` is false.
 * The lot branch is left checked out.
 */
export function createLotScenario(
	params: { root?: string; cutFrom?: string; from?: string; ownCommit?: boolean } = {},
): LotScenario {
	const root =
		params.root ?? initializeRepository({ root: temporaryFolder('dialecte-follows-lot-') })
	const cutFrom = params.cutFrom ?? BASE_BRANCH
	const start = commitOf({ root, rev: 'HEAD' })
	if (cutFrom === 'main') git({ root, args: ['switch', '-q', 'main'] })
	else git({ root, args: ['switch', '-q', '-c', cutFrom, 'main'] })
	commitFile({ root, file: BASE_FILE })
	const cut = commitOf({ root, rev: 'HEAD' })
	git({ root, args: ['switch', '-q', '-c', LOT_BRANCH] })
	writeHygieneBaseline({
		root,
		now: SCENARIO_NOW,
		...(params.from !== undefined && { from: params.from }),
	})
	if (params.ownCommit !== false) commitFile({ root, file: OWN_FILE })
	return { root, start, cut }
}

/** Links a store lot of the workspace's repository to its worktree (the repository itself), the identity's base ref being `baseRef`. */
export function linkStoreLot(params: {
	workspace: BriefWorkspace
	baseRef: string
	/** The commit the lot was cut at, recorded beside the ref. */
	cut: string
}): void {
	const { workspace } = params
	const lotFolder = writeStoreLot({
		workspace,
		name: SCENARIO_LOT_NAME,
		scope: ['src/'],
		base: { ref: params.baseRef, commit: params.cut },
	})
	linkLot({ worktree: workspace.repository, lotFolder })
}

/** `branch` gains an empty commit, the checked out branch left as it was; the new tip. */
export function advanceBranch(params: { root: string; branch: string }): string {
	const { root } = params
	const current = git({ root, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()
	git({ root, args: ['switch', '-q', params.branch] })
	const tip = commitEmpty({ root, message: `feat: ${params.branch} moves on` })
	git({ root, args: ['switch', '-q', current] })
	return tip
}

/** `branch` merged into the checked out branch with a merge commit. */
export function mergeIntoLot(params: { root: string; branch: string }): void {
	git({
		root: params.root,
		args: ['merge', '-q', '--no-ff', '-m', `merge ${params.branch}`, params.branch],
	})
}

/** The lot branch merged into `branch` with a merge commit, the lot branch checked out again. */
export function mergeLotInto(params: { root: string; branch: string }): void {
	const { root } = params
	git({ root, args: ['switch', '-q', params.branch] })
	git({ root, args: ['merge', '-q', '--no-ff', '-m', `merge ${LOT_BRANCH}`, LOT_BRANCH] })
	git({ root, args: ['switch', '-q', LOT_BRANCH] })
}

/** The source text `worktree from <ref>`. */
export function fromSource(ref: string): string {
	return TDD_BASE_SOURCES.worktreeFrom.replace('{ref}', () => ref)
}

/** The checked out lot branch's own commits replayed onto `onto`, from `cut` (`git rebase --onto <onto> <cut>`). */
export function rebaseLot(params: { root: string; onto: string; cut: string }): void {
	git({ root: params.root, args: ['rebase', '-q', '--onto', params.onto, params.cut] })
}

/** The checked out branch moved onto `branch`'s tip, which it must hold. */
export function fastForwardLot(params: { root: string; branch: string }): void {
	git({ root: params.root, args: ['merge', '-q', '--ff-only', params.branch] })
}

/** `branch` made to point at a new commit on top of `onto`, as a force-push of a rewritten branch leaves it. */
export function rewriteBranch(params: { root: string; branch: string; onto: string }): void {
	const { root } = params
	const rewritten = git({
		root,
		args: [
			'commit-tree',
			`${params.onto}^{tree}`,
			'-p',
			params.onto,
			'-m',
			`rewritten ${params.branch}`,
		],
	}).trim()
	git({ root, args: ['branch', '-q', '-f', params.branch, rewritten] })
}

/** The local branch `branch` deleted, merged or not. */
export function deleteBranch(params: { root: string; branch: string }): void {
	git({ root: params.root, args: ['branch', '-q', '-D', params.branch] })
}

/** A tag `tag` at `at` (a rev). */
export function tagAt(params: { root: string; tag: string; at: string }): void {
	git({ root: params.root, args: ['tag', params.tag, params.at] })
}

/** The short id of `commit`, as the gate's note spells it. */
export function shortOf(params: { root: string; commit: string }): string {
	return git({ root: params.root, args: ['rev-parse', '--short', params.commit] }).trim()
}

/** Commits `file` (a one-line module) on the checked out branch. */
function commitFile(params: { root: string; file: string }): void {
	const { root, file } = params
	writeFiles({ root, files: { [file]: `export const value = '${file}'\n` } })
	git({ root, args: ['add', file] })
	git({ root, args: ['commit', '-q', '-m', `feat: add ${file}`] })
}
