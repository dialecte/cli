import type { MachineLoad, MemorySource } from '../heavy/machine-load.types.ts'
import type { EntryStatus, PlanStates } from './entry-state.types.ts'
import type { PlanBlock } from './plan-block.types.ts'
import type {
	Held,
	PlanCounts,
	PlanHeavyMarker,
	PlanHeavyReading,
	PlanProposals,
	Proposal,
	SpecWork,
} from './propose.types.ts'

/** Everything `plan next` answers from: the plan as given, its block, the states, the proposals, the machine. */
export type PlanNextReport = {
	/** The plan file as the person gave it (`33-LOT-ENGINE.md`). */
	plan: string
	/** The plan file's absolute path: spec files are said relative to its folder. */
	planPath: string
	block: PlanBlock
	states: PlanStates
	proposals: PlanProposals
	heavy: PlanHeavyReading
	machine: MachineLoad
	/** The time the age of a running heavy step is measured against. */
	now: Date
	/** `--all`: the done entries are listed, not only counted. */
	all: boolean
}

/** One entry of `plan next --json` (33N section 9). */
export type PlanNextEntryJson = Pick<
	EntryStatus,
	'id' | 'kind' | 'state' | 'lotState' | 'realizedBy' | 'waitsFor' | 'spec'
> & { group: string | null; parked: string | null }

/** What `plan next --json` prints (33N section 9). */
export type PlanNextJson = {
	plan: string
	repositories: string[]
	counts: PlanCounts
	entries: PlanNextEntryJson[]
	proposals: Proposal[]
	held: Held[]
	specWork: SpecWork[]
	heavy: {
		markers: PlanHeavyMarker[]
		load: { now: number; limit: number; cores: number }
		memory: { available: number | null; limit: number; source: MemorySource }
		short: boolean
	}
	unknown: { id: string; reason: string }[]
}
