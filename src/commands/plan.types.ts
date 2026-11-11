import type { HeavyMarkerCheck } from '../lib/events/heavy-markers.types.ts'
import type { MachineLoad } from '../lib/heavy/machine-load.types.ts'
import type { StateFolderLocation } from '../lib/store/store.types.ts'

/** What `runPlan` reads from the machine, each replaceable by the tests: no `vm_stat`, no `ps`, no clock of the host. */
export type PlanSeams = {
	/** The load and memory reading, instead of `readMachineLoad`. */
	machine?: MachineLoad
	/** The liveness check of the heavy markers' processes. */
	check?: HeavyMarkerCheck
	/** Where the state folder (heavy markers, plan marks) is. */
	state?: StateFolderLocation
	/** The time `plan next` measures how long a heavy step has run against, and stamps a mark with. */
	now?: Date
}

/** The arguments of `runPlan`. */
export type RunPlanParams = { cwd: string; argv: string[]; seams?: PlanSeams }
