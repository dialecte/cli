/**
 * The design step of `gate --hook` (DESIGN-GATE section 3, DG2): the first step of every hook run in a lot's own
 * worktree, whatever `dialecte.gate.hook` declares. A commit holding a production path fails while the lot's required
 * design is missing, unapproved or stale; a commit of tests or docs only passes; a first commit and a merge commit
 * skip it. Outside a lot's own worktree it gives no line. It takes the lot base the run resolved.
 */
import { basename } from 'node:path'

import { designGateOf, ownLotFolderOf } from '../design/design-gate.ts'
import { designNextOf, designStateText, designStateWithReasons } from '../design/design-line.ts'
import { readGit } from '../git.ts'
import { resolveTddBase } from '../tdd/tdd-base.ts'
import { isProductionPath } from '../tdd/tdd-files.ts'
import { DESIGN_STEP, HOOK_DESIGN_TEXTS } from './hook-design.constants.ts'
import { hasHead, isMergeInProgress } from './hook-tdd.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { TddBase } from '../tdd/tdd.types.ts'
import type { StepResult } from './gate.types.ts'

/**
 * The lot base a hook run resolves once, for its design step and its tdd step: resolved when the worktree `cwd` is a
 * lot's own or the package declares a hook list (its tdd step reads it); undefined otherwise (nothing reads it).
 *
 * @intent resolve a hook run's one lot base, only when a step reads it
 * @internal
 */
export function resolveHookLotBase(params: {
	cwd: string
	packageJson: PackageJson
}): TddBase | { failure: string } | undefined {
	const { cwd, packageJson } = params
	if (packageJson.dialecte?.gate?.hook === undefined && ownLotFolderOf({ cwd }) === undefined)
		return undefined
	return resolveTddBase({ root: cwd, packageJson })
}

/**
 * The hook's design step for the commit in the worktree `cwd`; undefined outside a lot's own worktree.
 *
 * @intent stop a commit of production code whose lot's design is not approved
 * @internal
 */
export function runHookDesignStep(params: {
	cwd: string
	packageJson: PackageJson
	base: TddBase | { failure: string }
}): StepResult | undefined {
	const { cwd, packageJson, base } = params
	const lotFolder = ownLotFolderOf({ cwd })
	if (lotFolder === undefined) return undefined
	if (!hasHead(cwd)) return resultOf({ status: 'skipped', reason: HOOK_DESIGN_TEXTS.firstCommit })
	if (isMergeInProgress(cwd))
		return resultOf({ status: 'skipped', reason: HOOK_DESIGN_TEXTS.merge })
	const staged = readGit({ root: cwd, args: ['diff', '--cached', '--name-only', '--relative'] })
		.split('\n')
		.filter(Boolean)
	const production = staged.some(function isProduction(file) {
		return isProductionPath({ root: cwd, file, packageJson })
	})
	if (!production) return resultOf({ status: 'passed', reason: HOOK_DESIGN_TEXTS.noProduction })
	if ('failure' in base) return resultOf({ status: 'failed', reason: base.failure })
	const gate = designGateOf({
		lotFolder,
		root: cwd,
		base: base.commit,
		paths: staged,
		verb: 'commit',
	})
	if (gate.refusal === undefined)
		return resultOf({ status: 'passed', reason: designStateText(gate.standing) })
	return resultOf({
		status: 'failed',
		reason: designStateWithReasons(gate.standing),
		tail: designNextOf({ standing: gate.standing, lot: basename(lotFolder) }),
	})
}

/** The step's result. */
function resultOf(params: {
	status: StepResult['status']
	reason: string
	tail?: string
}): StepResult {
	return { step: DESIGN_STEP, counts: {}, restored: [], ...params }
}
