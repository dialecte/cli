import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { formatDuration } from '../progress/format-duration.ts'
import { WORKTREE_ADD_BUDGET_MS, WORKTREE_ADD_STEPS, WORKTREE_TEXTS } from './health.constants.ts'
import { collectLotRuns, isClosedRun, isInWindow, runDurationMs, timeOf } from './record-run.ts'

import type { LotEvent } from '../events/event.types.ts'
import type { ClosedLotRun, HealthFinding, HealthRepository, HealthWindow } from './health.types.ts'

/**
 * The worktree creations (`worktree-add`, `throwaway-add`) with a start and an end in the window that took longer
 * than their budget: one amber finding each at its start, naming how its `node_modules` came when its end says so.
 * Oldest first.
 */
export function findSlowWorktreeAdds(params: {
	repository: HealthRepository
	window: HealthWindow
}): HealthFinding[] {
	const { repository, window } = params
	return collectLotRuns({ lots: repository.lots })
		.filter(isClosedRun)
		.filter(
			(run) =>
				WORKTREE_ADD_STEPS.has(String(run.end.step)) &&
				isInWindow({ at: run.end.at, ...window }) &&
				runDurationMs({ run }) > WORKTREE_ADD_BUDGET_MS,
		)
		.map((run) => slowAddFinding({ repository, run }))
		.sort((first, second) => timeOf(first.at) - timeOf(second.at))
}

function slowAddFinding(params: {
	repository: HealthRepository
	run: ClosedLotRun
}): HealthFinding {
	const { run } = params
	const nodeModules = nodeModulesOf({ end: run.end })
	return {
		rule: 'worktrees',
		severity: 'amber',
		repository: params.repository.name,
		lot: run.lot,
		at: run.start.at,
		text: fillMessage({
			template: WORKTREE_TEXTS.slowAdd,
			values: { step: String(run.end.step), duration: formatDuration(runDurationMs({ run })) },
		}),
		detail:
			nodeModules === undefined
				? []
				: [fillMessage({ template: WORKTREE_TEXTS.nodeModules, values: { value: nodeModules } })],
	}
}

/** How the creation's `node_modules` came (`cloned`, `pooled`), when its end's `parts` is an object that says it. */
function nodeModulesOf(params: { end: LotEvent }): string | undefined {
	const { parts } = params.end
	if (typeof parts !== 'object' || parts === null || Array.isArray(parts)) return undefined
	if (!('nodeModules' in parts) || parts.nodeModules === undefined) return undefined
	return String(parts.nodeModules)
}
