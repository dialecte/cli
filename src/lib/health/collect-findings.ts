import { timeOf } from './record-run.ts'
import { findDuplicateWork } from './rule-duplicate-work.ts'
import { findSlowLandings } from './rule-landing-time.ts'
import { findLeakedScratch } from './rule-scratch.ts'
import { findStalledRuns } from './rule-stalled-runs.ts'
import { findSlowWorktreeAdds } from './rule-worktree-adds.ts'
import { findIdleWorktrees } from './rule-worktrees.ts'

import type { CollectFindingsParams } from './collect-findings.types.ts'
import type { HealthFinding, HealthRepository } from './health.types.ts'

/**
 * Runs every rule over every repository (duplicate work first, its findings handed to the landing rule) and the
 * scratch rule once. Red first; within a severity, the findings of runs newest first, then the findings of what lies
 * around (idle worktrees, leaked scratch folders) newest first: a state that stays never hides a run.
 */
export function collectFindings(params: CollectFindingsParams): HealthFinding[] {
	const runFindings = params.repositories.flatMap(function findingsOfRepository(repository) {
		return runFindingsOf({ ...params, repository })
	})
	const stateFindings = [
		...params.repositories.flatMap(function idleOfRepository(repository) {
			return findIdleWorktrees({ repository, now: params.window.now })
		}),
		...findLeakedScratch({
			folders: params.scratch,
			now: params.window.now,
			isAlive: params.isAlive,
		}),
	]
	// a stable sort by severity keeps each severity's run findings before its state findings
	return [...runFindings.sort(compareNewestFirst), ...stateFindings.sort(compareNewestFirst)].sort(
		compareRedFirst,
	)
}

/** The findings of one repository's runs, rule by rule. */
function runFindingsOf(
	params: Omit<CollectFindingsParams, 'repositories' | 'scratch'> & {
		repository: HealthRepository
	},
): HealthFinding[] {
	const { repository, window, isAlive } = params
	const duplicates = findDuplicateWork({ repository, window })
	return [
		...duplicates,
		...findSlowLandings({ repository, window, duplicates }),
		...findStalledRuns({ repository, now: window.now, isAlive }),
		...findSlowWorktreeAdds({ repository, window }),
	]
}

function compareRedFirst(first: HealthFinding, second: HealthFinding): number {
	return Number(first.severity !== 'red') - Number(second.severity !== 'red')
}

function compareNewestFirst(first: HealthFinding, second: HealthFinding): number {
	return timeOf(second.at) - timeOf(first.at)
}
