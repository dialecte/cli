/**
 * The tdd step of `gate --hook` (a package declaring `dialecte.gate.hook`): the receipts prove the commit, so the hook
 * runs no test. A merge commit skips it. Otherwise it fails when the working files are not the commit for a path tdd
 * reads (the receipts were taken on the working files), when a case of the commit (measured from HEAD) lacks its red
 * then green as `gate --fast` judges it, or when a case's newest green was taken before the production changed.
 */
import { computeStateTree } from '../gate-records/state-hash.ts'
import { readGit, tryReadGit } from '../git.ts'
import { checkTddReceipts } from '../tdd/check-tdd-receipts.ts'
import { caseLabel } from '../tdd/select-cases.ts'
import {
	hashProduction,
	isPackageTestCode,
	isProductionPath,
	readLedger,
} from '../tdd/tdd-files.ts'
import { TDD_STEP } from '../tdd/tdd.constants.ts'
import {
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
	if (isMergeInProgress(cwd))
		return {
			step: TDD_STEP,
			status: 'skipped',
			counts: {},
			restored: [],
			reason: HOOK_TDD_MERGE_REASON,
		}
	const differing = listDifferingTddPaths(params)
	if (differing.length > 0)
		return {
			step: TDD_STEP,
			status: 'failed',
			counts: {},
			restored: [],
			reason: HOOK_TDD_NOT_THE_COMMIT_REASON.replace('{paths}', () =>
				differing.join(HOOK_TDD_PATH_SEPARATOR),
			),
			tail: HOOK_TDD_NOT_THE_COMMIT_HINT,
		}
	const check = await checkTddReceipts({
		root: cwd,
		packageJson,
		ref: undefined,
		wholeBranch: false,
	})
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
		tail: stale.map((label) => HOOK_TDD_STALE_LINE.replace('{label}', () => label)).join('\n'),
	}
}

/** A merge is being committed: git keeps MERGE_HEAD until it is. */
function isMergeInProgress(cwd: string): boolean {
	return (
		tryReadGit({ root: cwd, args: ['rev-parse', '-q', '--verify', 'MERGE_HEAD'] }) !== undefined
	)
}

/**
 * The package's paths tdd reads (test code, production) where the working files differ from the commit's tree,
 * relative to the package, sorted: what is staged against what is on disk, untracked files included. None without a
 * HEAD (no receipt is measured there).
 */
function listDifferingTddPaths(params: {
	cwd: string
	packageJson: PackageJson
	tree: string
}): string[] {
	const { cwd, packageJson } = params
	if (tryReadGit({ root: cwd, args: ['rev-parse', '-q', '--verify', 'HEAD'] }) === undefined)
		return []
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
				(isPackageTestCode({ file, packageJson }) || isProductionPath({ file, packageJson })),
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
