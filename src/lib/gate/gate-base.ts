/** The base a scoped step selects against: one answer per run. */
import { realPathOf } from '../file-system.ts'
import { isAncestorCommit, readGit, tryReadGit } from '../git.ts'
import { readLiveHandoverRun } from '../handover/live-handover-run.ts'
import { readPackageJson } from '../package-json.ts'
import { DEFAULT_BASE_BRANCH } from '../worktree/worktree.constants.ts'
import {
	BASE_BRANCH_REFS,
	FULL_OBJECT_ID_PATTERN,
	GATE_BASE_REFUSAL,
	HANDOVER_BASE_IGNORED_REASONS,
	HANDOVER_BASE_VARIABLES,
	HANDOVER_HALF_GIVEN_REASONS,
	NO_BASE_BRANCH_NOTE,
} from './gate-base.constants.ts'
import { GATE_LIST_NAMES } from './gate-config.constants.ts'
import { holdsScopedStep, listHookTestSteps, resolveGateSteps } from './gate-config.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { Refusal } from '../refusal.types.ts'
import type { GateBase, GivenHandoverBase, HandoverBase, UsedGateBase } from './gate-base.types.ts'

/**
 * The base of the gate in the worktree `root`, resolved once per run:
 * 1. `ref` (`--base`): the merge-base of HEAD and the ref, else the commit it names; neither → a refusal;
 * 2. `handoverBase`: honoured when a live hand-over run is that folder's and the base is a full commit id, an
 *    ancestor of (or equal to) HEAD and of the base branch; else ignored, the reason in `ignored`;
 * 3. the base branch (`dialecte.baseBranch`, default main; local, else origin's): its merge-base with HEAD;
 * 4. none of these: the empty tree, with a note naming the base branch.
 *
 * `head` is the commit the base is resolved for (default HEAD): a hand-over resolves it on its lots file's HEAD.
 */
export function resolveGateBase(params: {
	root: string
	ref?: string
	handoverBase?: HandoverBase
	head?: string
}): GateBase | Refusal {
	const { root } = params
	const head = params.head ?? 'HEAD'
	if (params.ref !== undefined) return resolveFlagBase({ root, ref: params.ref, head })
	const branch = readPackageJson(root).dialecte?.baseBranch ?? DEFAULT_BASE_BRANCH
	const branchRef = findBaseBranchRef({ root, branch })
	const ignored =
		params.handoverBase === undefined
			? undefined
			: findHandoverBaseProblem({ root, handoverBase: params.handoverBase, branchRef, head })
	if (params.handoverBase !== undefined && ignored === undefined)
		return { commit: params.handoverBase.commit, source: 'handover' }
	const mergeBase =
		branchRef === undefined
			? undefined
			: tryReadGit({ root, args: ['merge-base', head, branchRef] })?.trim()
	const resolved: GateBase = mergeBase
		? { commit: mergeBase, source: 'base-branch' }
		: {
				commit: readEmptyTree(root),
				source: 'none',
				note: NO_BASE_BRANCH_NOTE.replace('{branch}', branch),
			}
	return ignored === undefined ? resolved : { ...resolved, ignored }
}

/** The id of the empty tree in the repository of `root`, as git computes it (`hash-object -t tree /dev/null`). */
export function readEmptyTree(root: string): string {
	return readGit({ root, args: ['hash-object', '-t', 'tree', '/dev/null'] }).trim()
}

/** True when any resolved gate list (fast, full, release) holds a scoped step. */
export function hasScopedStep(packageJson: PackageJson): boolean {
	return GATE_LIST_NAMES.some(function listHasScopedStep(mode) {
		return holdsScopedStep(resolveGateSteps({ packageJson, mode }))
	})
}

/**
 * The base records of the package at `root` are read against, resolved once on `head` (default HEAD) by rules 3
 * and 4 (the base branch's merge-base, else the empty tree); undefined when no gate list holds a scoped step (no
 * base is read then). The card, the recap, the rehearsal plan, contrib's lookup and a hand-over run use it.
 */
export function resolveConfiguredBase(params: {
	root: string
	packageJson: PackageJson
	head?: string
}): UsedGateBase | undefined {
	if (!hasScopedStep(params.packageJson)) return undefined
	const resolved = resolveGateBase({
		root: params.root,
		...(params.head !== undefined && { head: params.head }),
	})
	// only a `--base` ref is refused, and none is given here
	if ('refusal' in resolved) throw new Error(resolved.refusal)
	return { commit: resolved.commit, source: resolved.source }
}

/**
 * True when the test steps `gate --hook` runs (the resolved `full` steps counting tests) hold a scoped step: the
 * hook then resolves a base, and a hand-over hands one down and keys its hook records with it.
 */
export function hasScopedHookStep(packageJson: PackageJson): boolean {
	return holdsScopedStep(listHookTestSteps(resolveGateSteps({ packageJson, mode: 'full' })))
}

/**
 * The hand-over base in `environment` (the one the cli was given): both variables give it; one without the other
 * is ignored, with why; neither gives nothing.
 */
export function readGivenHandoverBase(environment: Readonly<NodeJS.ProcessEnv>): GivenHandoverBase {
	const commit = environment[HANDOVER_BASE_VARIABLES.base]
	const folder = environment[HANDOVER_BASE_VARIABLES.folder]
	if (commit !== undefined && folder !== undefined) return { handoverBase: { commit, folder } }
	if (commit !== undefined)
		return { ignored: HANDOVER_HALF_GIVEN_REASONS.baseOnly.replace('{value}', commit) }
	if (folder !== undefined)
		return { ignored: HANDOVER_HALF_GIVEN_REASONS.folderOnly.replace('{value}', folder) }
	return {}
}

/** Rule 1: the merge-base of `head` and `ref`, else the commit `ref` names, else a refusal naming it. */
function resolveFlagBase(params: { root: string; ref: string; head: string }): GateBase | Refusal {
	const { root, ref } = params
	const commit =
		tryReadGit({ root, args: ['merge-base', params.head, ref] }) ??
		tryReadGit({ root, args: ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`] })
	return commit
		? { commit: commit.trim(), source: 'flag' }
		: { refusal: GATE_BASE_REFUSAL.replace('{ref}', ref) }
}

/** The ref of the base branch `branch`: the local branch, else origin's; undefined when neither exists. */
function findBaseBranchRef(params: { root: string; branch: string }): string | undefined {
	return BASE_BRANCH_REFS.map((pattern) => pattern.replace('{branch}', params.branch)).find(
		function refExists(ref) {
			return (
				tryReadGit({
					root: params.root,
					args: ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
				}) !== undefined
			)
		},
	)
}

/**
 * Why the hand-over base cannot be honoured, or undefined when it can: the live run, then the id, then the base
 * branch, then the ancestry (`head` first).
 */
function findHandoverBaseProblem(params: {
	root: string
	handoverBase: HandoverBase
	branchRef: string | undefined
	head: string
}): string | undefined {
	const { root, branchRef } = params
	const { commit, folder } = params.handoverBase
	const live = readLiveHandoverRun(root)
	function reason(template: string): string {
		return template
			.replace('{base}', commit)
			.replace('{folder}', folder)
			.replace('{live}', live?.folder ?? '')
			.replace('{ref}', branchRef ?? '')
	}
	if (live === undefined) return reason(HANDOVER_BASE_IGNORED_REASONS.noLiveRun)
	if (realPathOf(live.folder) !== realPathOf(folder))
		return reason(HANDOVER_BASE_IGNORED_REASONS.otherFolder)
	if (!isFullCommitId({ root, commit })) return reason(HANDOVER_BASE_IGNORED_REASONS.notACommit)
	if (branchRef === undefined) return reason(HANDOVER_BASE_IGNORED_REASONS.noBaseBranch)
	if (!isAncestorCommit({ root, ancestor: commit, descendant: params.head }))
		return reason(HANDOVER_BASE_IGNORED_REASONS.notAncestorOfHead)
	if (!isAncestorCommit({ root, ancestor: commit, descendant: branchRef }))
		return reason(HANDOVER_BASE_IGNORED_REASONS.notAncestorOfBaseBranch)
	return undefined
}

/** `commit` is spelled as a full object id and names a commit the repository holds. */
function isFullCommitId(params: { root: string; commit: string }): boolean {
	if (!FULL_OBJECT_ID_PATTERN.test(params.commit)) return false
	return (
		tryReadGit({ root: params.root, args: ['cat-file', '-t', params.commit] })?.trim() === 'commit'
	)
}
