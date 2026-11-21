/**
 * The rules every signed store verb shares (KEEP 3.3): the orchestrator recorded as one word, and the verbs a lot's own
 * session may not run - from its worktree or one of its review throwaways - on what a person decided.
 */
import { basename, dirname, join } from 'node:path'

import { ORCHESTRATOR_APPROVER } from '../../commands/lot-approve.constants.ts'
import { realPathOf, realPathThroughAncestors } from '../file-system.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { THROWAWAY_WORKTREE_PATTERN } from '../plan/plan.constants.ts'
import { readIdentity } from './identity.ts'
import { lotOfWorktree } from './resolve-lot.ts'
import { OWN_WORKTREE_REFUSAL } from './signer-rules.constants.ts'
import { workTreeHolding } from './store-folder.ts'

/** The orchestrator in any casing is recorded as the one word every view names. */
export function recordedByOf(params: { by: string }): string {
	const { by } = params
	return by.toLowerCase() === ORCHESTRATOR_APPROVER ? ORCHESTRATOR_APPROVER : by
}

/**
 * The refusal of `command` run from the lot's own worktree, or from a review throwaway beside it (`-round-<n>` or
 * `-verify`, the rule `worktree prune` maps throwaways by); undefined elsewhere.
 */
export function ownWorktreeRefusal(params: {
	lotFolder: string
	cwd: string
	/** The verb's own words the refusal starts with (`lot design: approve`, `lot unkeep`). */
	command: string
}): string | undefined {
	if (!isOwnPlace(params)) return undefined
	return fillMessage({ template: OWN_WORKTREE_REFUSAL, values: { command: params.command } })
}

/** Whether `cwd` lies in the lot's own worktree or in a review throwaway beside it. */
function isOwnPlace(params: { lotFolder: string; cwd: string }): boolean {
	const lotFolder = realPathOf(params.lotFolder)
	const here = lotOfWorktree({ cwd: params.cwd })
	if (here !== undefined && realPathOf(here) === lotFolder) return true
	const workTree = workTreeHolding({ from: params.cwd })
	const worktree = readIdentity({ lotFolder: params.lotFolder })?.worktree
	if (workTree === undefined || typeof worktree !== 'string') return false
	const own = realPathOf(workTree)
	const lotName = THROWAWAY_WORKTREE_PATTERN.exec(basename(own))?.[1]
	// the lot's worktree may be gone: its path resolved through its nearest present ancestor, as git's
	return lotName !== undefined && join(dirname(own), lotName) === realPathThroughAncestors(worktree)
}
