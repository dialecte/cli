/**
 * The tdd step of `gate --hook` (a package declaring `dialecte.gate.hook`): the receipts prove the commit, so the hook
 * runs no test. A first commit and a merge commit skip it. Otherwise it fails when the working files are not the
 * commit for a path tdd reads (the receipts were taken on the working files), when a case of the lot (measured from
 * the lot base, as `gate --full` measures it) lacks its red then green, or when a closed case (green, unchanged,
 * accepted, revised) is not proven passing at the production committed (`isProvenNow`): its last run at its test file
 * now refused it, none ran it there, or it ran at another production. A commit of production alone can make an earlier
 * commit's proof stale.
 */
import { computeStateTree } from '../gate-records/state-hash.ts'
import { readGit, tryReadGit } from '../git.ts'
import { isProvenNow, lastRunOf } from '../tdd/case-status.ts'
import { checkTddReceipts } from '../tdd/check-tdd-receipts.ts'
import { countingReceipts } from '../tdd/counting-receipts.ts'
import { readAcceptances, readRevisions } from '../tdd/lot-declaration.ts'
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
	HOOK_TDD_PROVEN_STATUSES,
	HOOK_TDD_REFUSED_LINE,
	HOOK_TDD_STALE_LINE,
	HOOK_TDD_STALE_REASON,
	HOOK_TDD_UNPROVEN_LINE,
} from './hook-tdd.constants.ts'
import { tddStepResultOf } from './tdd-step.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { JudgedCase, TddBase } from '../tdd/tdd.types.ts'
import type { StepResult } from './gate.types.ts'
import type { StaleCase } from './hook-tdd.types.ts'

/**
 * The hook's tdd step for the commit of `tree` (the index git hands the hook) in the package at `cwd`.
 * @intent the hook refuses exactly when the commit's cases would need a test run
 */
export async function runHookTddStep(params: {
	cwd: string
	packageJson: PackageJson
	/** The tree the commit records. */
	tree: string
	/** The lot base the hook run resolved once (`resolveTddBase`), shared with its design step. */
	base: TddBase | { failure: string }
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
	// the whole lot: a commit of production alone can make an earlier commit's proof stale
	const { base } = params
	if ('failure' in base) return failed({ reason: base.failure })
	const check = await checkTddReceipts({ root: cwd, packageJson, ref: base.commit })
	const result = tddStepResultOf(check)
	if (result.status !== 'passed') return result
	const unproven = listStaleCases({ cwd, packageJson, cases: check.cases ?? [] })
	if (unproven.length === 0) return result
	// the passing count and its evidence no longer stand: the reason and the tail say what is not proven instead (the
	// base line stays, for the record)
	const { note: _passedNote, details: _passedDetails, ...judged } = result
	// a green clears a stale or refused case; an unproven one needs its red first
	const greenAgain = unproven.some((stale) => !stale.needsRed)
	return {
		...judged,
		status: 'failed',
		...(check.baseNote && { details: [check.baseNote] }),
		reason: HOOK_TDD_STALE_REASON.replace('{count}', () => String(unproven.length)),
		tail: [
			...unproven.map((stale) => stale.line),
			...(greenAgain ? [HOOK_TDD_GREEN_AGAIN_LINE] : []),
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

/**
 * The repository has a commit: a first commit has no base to measure a lot from, and no receipt before it.
 *
 * @intent tell a hook step that the commit is the repository's first
 * @internal
 */
export function hasHead(cwd: string): boolean {
	return tryReadGit({ root: cwd, args: ['rev-parse', '-q', '--verify', 'HEAD'] }) !== undefined
}

/**
 * A merge is being committed: git keeps MERGE_HEAD until it is.
 *
 * @intent tell a hook step that the commit is a merge
 * @internal
 */
export function isMergeInProgress(cwd: string): boolean {
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

/**
 * The line of each closed case not proven passing at the production now (`isProvenNow`), in order: `unproven` when it
 * holds no proof receipt and its file is not moved with its bytes (a red gives it one), `refused` when its last run at
 * its test file now refused it, `stale` otherwise. A case skipped as written is never judged.
 */
function listStaleCases(params: {
	cwd: string
	packageJson: PackageJson
	cases: readonly JudgedCase[]
}): StaleCase[] {
	const closed = params.cases.filter(
		(judged) => HOOK_TDD_PROVEN_STATUSES.includes(judged.status) && !judged.skippedAsWritten,
	)
	if (closed.length === 0) return []
	const { cwd } = params
	const ledger = readLedger(cwd)
	const acceptances = readAcceptances(cwd)
	const revisions = readRevisions(cwd)
	// the step passed: its ledger and lot file were read
	if ('failure' in ledger || 'failure' in acceptances || 'failure' in revisions) return []
	const productionHash = hashProduction({ root: cwd, packageJson: params.packageJson })
	return closed.flatMap(function staleCaseOf(judged): StaleCase[] {
		const testCase = {
			file: judged.file ?? '',
			name: judged.name ?? '',
			project: judged.project ?? '',
		}
		const asked = {
			ledger,
			testCase,
			testFileHash: judged.testFileHash ?? '',
			acceptances,
			revisions,
		}
		if (isProvenNow({ ...asked, productionHash })) return []
		const holdsProof = countingReceipts(asked).counting.some(
			(receipt) => receipt.kind !== 'refused',
		)
		const needsRed = !holdsProof && !judged.movedFile
		const template = needsRed
			? HOOK_TDD_UNPROVEN_LINE
			: lastRunOf(asked)?.kind === 'refused'
				? HOOK_TDD_REFUSED_LINE
				: HOOK_TDD_STALE_LINE
		return [{ line: template.replace('{label}', () => judged.label), needsRed }]
	})
}
