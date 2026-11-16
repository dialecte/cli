/**
 * The tdd step of `gate --hook` (a package declaring `dialecte.gate.hook`): the receipts prove the commit, so the hook
 * runs no test. A first commit and a merge commit skip it. Otherwise it fails when the working files are not the
 * commit for a path tdd reads (the receipts were taken on the working files), when a case of the lot (measured from
 * the lot base, as `gate --full` measures it) lacks its red then green, or when a case's newest green was taken before
 * the production changed: a commit of production alone can make an earlier commit's green stale.
 */
import { computeStateTree } from '../gate-records/state-hash.ts'
import { readGit, tryReadGit } from '../git.ts'
import { checkTddReceipts } from '../tdd/check-tdd-receipts.ts'
import { caseLabel } from '../tdd/select-cases.ts'
import { resolveTddBase, shortCommitOf } from '../tdd/tdd-base.ts'
import {
	hashProduction,
	isPackageTestCode,
	isProductionPath,
	readLedger,
} from '../tdd/tdd-files.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'
import {
	HOOK_TDD_FIRST_COMMIT_REASON,
	HOOK_TDD_GREEN_AGAIN_LINE,
	HOOK_TDD_MERGE_REASON,
	HOOK_TDD_NOT_THE_COMMIT_HINT,
	HOOK_TDD_NOT_THE_COMMIT_REASON,
	HOOK_TDD_PATH_SEPARATOR,
	HOOK_TDD_STALE_LINE,
	HOOK_TDD_STALE_REASON,
} from './hook-tdd.constants.ts'
import { tddStepResultOf } from './tdd-step.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { TddLedger, TddReceipt } from '../tdd/tdd.types.ts'
import type { StepResult } from './gate.types.ts'

/**
 * The hook's tdd step for the commit of `tree` (the index git hands the hook) in the package at `cwd`.
 * @intent the hook refuses exactly when the commit's cases would need a test run
 */
export async function runHookTddStep(params: {
	cwd: string
	packageJson: PackageJson
	/** The tree the commit records. */
	tree: string
}): Promise<StepResult> {
	const { cwd, packageJson } = params
	if (!hasHead(cwd)) return skipped(HOOK_TDD_FIRST_COMMIT_REASON)
	if (isMergeInProgress(cwd)) return skipped(HOOK_TDD_MERGE_REASON)
	const differing = listDifferingTddPaths(params)
	if (differing.length > 0)
		return failed({
			reason: HOOK_TDD_NOT_THE_COMMIT_REASON.replace('{paths}', () =>
				differing.join(HOOK_TDD_PATH_SEPARATOR),
			),
			tail: HOOK_TDD_NOT_THE_COMMIT_HINT,
		})
	// the whole lot: a commit of production alone can make an earlier commit's green stale
	const base = resolveTddBase({ root: cwd, packageJson, wholeBranch: true })
	if ('failure' in base) return failed({ reason: base.failure })
	const check = await checkTddReceipts({ root: cwd, packageJson, ref: base.commit })
	const result = tddStepResultOf(check)
	if (result.status !== 'passed') return result
	const greens = (result.cases ?? [])
		.filter((judged) => judged.status === 'green')
		.map((judged) => judged.label)
	const stale = listStaleGreens({ cwd, packageJson, labels: greens })
	if (stale.length === 0) return result
	// the passing count no longer stands: the reason says what is stale instead
	const { note: _passedNote, ...judged } = result
	return {
		...judged,
		status: 'failed',
		reason: HOOK_TDD_STALE_REASON.replace('{count}', () => String(stale.length)),
		tail: [
			...stale.map((label) => HOOK_TDD_STALE_LINE.replace('{label}', () => label)),
			HOOK_TDD_GREEN_AGAIN_LINE.replace('{base}', () =>
				shortCommitOf({ root: cwd, commit: base.commit }),
			),
		].join('\n'),
	}
}

/** The step skipped for `reason`. */
function skipped(reason: string): StepResult {
	return { step: TDD_STEP, status: 'skipped', counts: {}, restored: [], reason }
}

/** The step failed for `reason`, with the lines under it. */
function failed(params: { reason: string; tail?: string }): StepResult {
	return { step: TDD_STEP, status: 'failed', counts: {}, restored: [], ...params }
}

/** The repository has a commit: a first commit has no base to measure a lot from, and no receipt before it. */
function hasHead(cwd: string): boolean {
	return tryReadGit({ root: cwd, args: ['rev-parse', '-q', '--verify', 'HEAD'] }) !== undefined
}

/** A merge is being committed: git keeps MERGE_HEAD until it is. */
function isMergeInProgress(cwd: string): boolean {
	return (
		tryReadGit({ root: cwd, args: ['rev-parse', '-q', '--verify', 'MERGE_HEAD'] }) !== undefined
	)
}

/**
 * The package's paths tdd reads (test code, production) where the working files differ from the commit's tree,
 * relative to the package, sorted: what is staged against what is on disk, untracked files included.
 */
function listDifferingTddPaths(params: {
	cwd: string
	packageJson: PackageJson
	tree: string
}): string[] {
	const { cwd, packageJson } = params
	const working = computeStateTree(cwd)
	return readGit({
		root: cwd,
		args: [
			'diff-tree',
			'-r',
			'-z',
			'--name-only',
			'--no-renames',
			'--relative',
			params.tree,
			working,
		],
	})
		.split('\0')
		.filter(
			(file) =>
				file !== '' &&
				(isPackageTestCode({ root: cwd, file, packageJson }) ||
					isProductionPath({ root: cwd, file, packageJson })),
		)
		.sort()
}

/** The cases among `labels` whose newest green receipt was taken at another production than now, in order. */
function listStaleGreens(params: {
	cwd: string
	packageJson: PackageJson
	labels: readonly string[]
}): string[] {
	if (params.labels.length === 0) return []
	const ledger = readLedger(params.cwd)
	// the step passed: its ledger was read
	if ('failure' in ledger) return []
	const now = hashProduction({ root: params.cwd, packageJson: params.packageJson })
	return params.labels.filter((label) => newestGreenOf({ ledger, label })?.productionHash !== now)
}

/** The newest green receipt of the case `label`. */
function newestGreenOf(params: { ledger: TddLedger; label: string }): TddReceipt | undefined {
	return params.ledger.entries
		.filter(
			(entry): entry is TddReceipt => entry.kind === 'green' && caseLabel(entry) === params.label,
		)
		.at(-1)
}
