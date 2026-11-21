/**
 * The design step of `gate --hook` (DESIGN-GATE section 3, DG2): the first step of every hook run committing a lot's
 * branch, whatever `dialecte.gate.hook` declares. A commit holding a production path fails while the lot's required
 * design is missing, unapproved or stale; a commit of tests or docs only passes; a first commit, a merge commit and a
 * review throwaway skip it. The lot is found by the branch being committed, from any worktree; a branch no lot names
 * gives no line. It takes the lot base the run resolved.
 */
import { basename, join } from 'node:path'

import { designGateOf } from '../design/design-gate.ts'
import { designNextOf, designStateText, designStateWithReasons } from '../design/design-line.ts'
import { realPathOf } from '../file-system.ts'
import { readGit, tryReadGit } from '../git.ts'
import { readCheckedLotState, registryOfLotFolder } from '../store/lot-records.ts'
import { listLotIdentities, locateStore } from '../store/store-folder.ts'
import { resolveTddBase } from '../tdd/tdd-base.ts'
import { isProductionPath } from '../tdd/tdd-files.ts'
import {
	DESIGN_STEP,
	HOOK_DESIGN_TEXTS,
	ROUND_NUMBER_PATTERN,
	THROWAWAY_BRANCH_INFIX,
} from './hook-design.constants.ts'
import { hasHead, isMergeInProgress } from './hook-tdd.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { TddBase } from '../tdd/tdd.types.ts'
import type { StepResult } from './gate.types.ts'
import type { HookLot } from './hook-design.types.ts'

/**
 * The lot base a hook run resolves once, for its scope, design and tdd steps: resolved when a lot is being committed
 * or the package declares a hook list (its tdd step reads it); undefined otherwise (nothing reads it).
 *
 * @intent resolve a hook run's one lot base, only when a step reads it
 * @internal
 */
export function resolveHookLotBase(params: {
	cwd: string
	packageJson: PackageJson
	/** The lot being committed (`hookLotOf`), resolved once for the run. */
	lot: HookLot | undefined
}): TddBase | { failure: string } | undefined {
	const { cwd, packageJson } = params
	if (packageJson.dialecte?.gate?.hook === undefined && params.lot === undefined) return undefined
	return resolveTddBase({ root: cwd, packageJson })
}

/**
 * The hook's design step for the commit of the lot `lot` (the run's one `hookLotOf`) in the worktree `cwd`; undefined
 * when no lot is being committed.
 *
 * @intent stop a commit of production code whose lot's design is not approved
 * @internal
 */
export function runHookDesignStep(params: {
	cwd: string
	packageJson: PackageJson
	lot: HookLot | undefined
	base: TddBase | { failure: string }
}): StepResult | undefined {
	const { cwd, packageJson, base } = params
	const held = params.lot
	if (held === undefined) return undefined
	if (held.kind === 'throwaway')
		return resultOf({ status: 'skipped', reason: HOOK_DESIGN_TEXTS.throwaway })
	const { lotFolder } = held
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

/**
 * The lot the commit in `cwd` belongs to, found by the branch being committed, not by the worktree: the store lot whose
 * branch it is (the newest when several were), wherever it is committed from; or a review throwaway of one, on its own
 * branch `<lot branch>-round-<n>`; undefined for a branch no lot names. A lot's records are read once, with it.
 *
 * @intent find the lot a commit belongs to, from any worktree
 * @internal
 */
export function hookLotOf(params: { cwd: string }): HookLot | undefined {
	const branch = tryReadGit({
		root: params.cwd,
		args: ['symbolic-ref', '--short', '-q', 'HEAD'],
	})?.trim()
	const store = locateStore({ from: params.cwd })?.store
	if (!branch || store === undefined) return undefined
	const lots = listLotIdentities({ store })
	const own = lots.filter(function onTheBranch(entry) {
		return entry.identity.branch === branch
	})
	const newest = own.at(-1)
	if (newest !== undefined) {
		const lotFolder = realPathOf(join(store, newest.name))
		return {
			kind: 'lot',
			lotFolder,
			checked: readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) }),
		}
	}
	const throwaway = lots.some(function ownsTheRound(entry) {
		return (
			branch.startsWith(`${entry.identity.branch}${THROWAWAY_BRANCH_INFIX}`) &&
			ROUND_NUMBER_PATTERN.test(
				branch.slice(entry.identity.branch.length + THROWAWAY_BRANCH_INFIX.length),
			)
		)
	})
	return throwaway ? { kind: 'throwaway' } : undefined
}

/** The step's result. */
function resultOf(params: {
	status: StepResult['status']
	reason: string
	tail?: string
}): StepResult {
	return { step: DESIGN_STEP, counts: {}, restored: [], ...params }
}
