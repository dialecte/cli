import { findEventReruns } from './duplicate-event-reruns.ts'
import { findRehearsalPlans } from './duplicate-rehearsal-plans.ts'
import { findStorePairs } from './duplicate-store-pairs.ts'
import { collectLotRuns, timeOf } from './record-run.ts'
import { recordsByTreeOf } from './records-by-tree.ts'

import type {
	DuplicateWorkInput,
	HealthFinding,
	HealthRepository,
	HealthWindow,
} from './health.types.ts'

/**
 * Runs that checked a tree although a green record of it existed before they started: a record re-run after a
 * green one (store pairs), a lot a rehearsal re-ran (rehearsal plans), and a step run twice with one key (the
 * events). Sorted by time, oldest first.
 */
export function findDuplicateWork(params: {
	repository: HealthRepository
	window: HealthWindow
}): HealthFinding[] {
	const { repository, window } = params
	const input: DuplicateWorkInput = {
		repository,
		window,
		runs: collectLotRuns({ lots: repository.lots }),
		recordsByTree: recordsByTreeOf({ records: repository.records }),
	}
	const storePairs = findStorePairs(input)
	const findings = [
		...storePairs.findings,
		...findRehearsalPlans(input),
		...findEventReruns({ ...input, namedEnds: storePairs.namedEnds }),
	]
	return findings.sort((first, second) => timeOf(first.at) - timeOf(second.at))
}
