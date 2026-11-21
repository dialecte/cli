/**
 * The scope step of `gate --hook` (SAFE 3.3): before the design step, a commit of a lot's branch is held to the lot's
 * effective scope over the lot's whole work up to the commit (its base against the index tree being committed).
 */
import { listLotChangePaths } from '../git.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { lotState } from '../store/lot-state.ts'
import { heldPathsOf, scopeGuardOf } from '../store/scope-guard.ts'
import { QUESTIONS_CLOSED_STATES } from '../store/store.constants.ts'
import { HOOK_SCOPE_TEXTS, SCOPE_STEP } from './hook-scope.constants.ts'
import { hasHead, isMergeInProgress } from './hook-tdd.ts'

import type { ScopeRefusal } from '../store/scope-guard.types.ts'
import type { TddBase } from '../tdd/tdd.types.ts'
import type { StepResult } from './gate.types.ts'
import type { HookLot } from './hook-design.types.ts'

/**
 * The hook's scope step for the commit of `tree` in the worktree `cwd`; undefined when no lot is being committed. The
 * skips (a throwaway, a terminal or simulated lot, a first commit, a merge in progress) are decided before the base is
 * read; a damaged lot or a base that cannot be read fails it.
 *
 * @intent stop a commit whose lot's work leaves the lot's scope
 * @internal
 */
export function runHookScopeStep(params: {
	cwd: string
	lot: HookLot | undefined
	base: TddBase | { failure: string } | undefined
	tree: string
}): StepResult | undefined {
	const { cwd, lot, base } = params
	if (lot === undefined || base === undefined) return undefined
	if (lot.kind === 'throwaway')
		return resultOf({ status: 'skipped', reason: HOOK_SCOPE_TEXTS.throwaway })
	const { lotFolder, checked } = lot
	if (checked !== undefined && 'input' in checked) {
		if (checked.input.identity.simulated)
			return resultOf({ status: 'skipped', reason: HOOK_SCOPE_TEXTS.simulated })
		const { state } = lotState(checked.input)
		if (QUESTIONS_CLOSED_STATES.includes(state))
			return resultOf({
				status: 'skipped',
				reason: fillMessage({ template: HOOK_SCOPE_TEXTS.terminal, values: { state } }),
			})
	} else {
		// no path: only the lot's own damage refuses, with its repair line
		const damaged = scopeGuardOf({ lotFolder, paths: [] })
		if (damaged !== undefined) return refusedOf(damaged)
	}
	if (!hasHead(cwd)) return resultOf({ status: 'skipped', reason: HOOK_SCOPE_TEXTS.firstCommit })
	// while MERGE_HEAD is set, the old fork point would name the base's own files too
	if (isMergeInProgress(cwd)) return resultOf({ status: 'skipped', reason: HOOK_SCOPE_TEXTS.merge })
	if ('failure' in base) return resultOf({ status: 'failed', reason: base.failure })
	const paths = listLotChangePaths({ root: cwd, from: base.commit, to: params.tree })
	const refusal = scopeGuardOf({ lotFolder, paths })
	if (refusal !== undefined) return refusedOf(refusal)
	const passed = fillMessage({
		template: HOOK_SCOPE_TEXTS.passed,
		values: { count: String(heldPathsOf(paths).length) },
	})
	return resultOf({
		status: 'passed',
		reason: base.kind === 'head' ? `${passed}${HOOK_SCOPE_TEXTS.heldAgainstHead}` : passed,
	})
}

/** The failed step of a guard's refusal: its reason, the add to run and the glob guidance under it. */
function refusedOf(refusal: ScopeRefusal): StepResult {
	const tail = [...(refusal.next ? [`next: ${refusal.next}`] : []), ...(refusal.globPaths ?? [])]
	return resultOf({
		status: 'failed',
		reason: refusal.reason,
		...(tail.length > 0 && { tail: tail.join('\n') }),
	})
}

/** The step's result. */
function resultOf(params: {
	status: StepResult['status']
	reason: string
	tail?: string
}): StepResult {
	return { step: SCOPE_STEP, counts: {}, restored: [], ...params }
}
