import type { HeavyMarkerCheck } from '../events/heavy-markers.types.ts'
import type { MachineLoad } from '../heavy/machine-load.types.ts'
import type { StateFolderLocation } from '../store/store.types.ts'
import type { PlanStates } from './entry-state.types.ts'
import type { PlanBlock } from './plan-block.types.ts'
import type { PlanFacts } from './plan.types.ts'

/** The arguments of `readPlanHeavy`. */
export type ReadPlanHeavyParams = {
	block: PlanBlock
	facts: PlanFacts
	states: PlanStates
	/** The machine's load and memory now (read by the command, injected by the tests). */
	machine: MachineLoad
	/** Where the heavy markers are: the state folder's location. */
	location?: StateFolderLocation
	/** The liveness check of the markers' processes (injected by the tests). */
	check?: HeavyMarkerCheck
}
