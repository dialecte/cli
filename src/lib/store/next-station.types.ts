import type { STATION_VERDICTS } from '../events/station-event.constants.ts'
import type { BriefEffort } from './brief.types.ts'
import type { STATION_NAMES } from './next-station.constants.ts'
import type { LotStateName } from './store.types.ts'

/** One of the loop's seven stations. */
export type StationName = (typeof STATION_NAMES)[number]

/** A verdict a station end may carry (`STATION_VERDICTS`). */
export type StationVerdict = (typeof STATION_VERDICTS)[number]

/** A check a worktree's records or step events prove. */
export type CheckName = 'tdd-red' | 'tdd-green' | 'gate-fast' | 'gate-full' | 'contrib'

/** One entry of the reader's timeline: the index is the order (`at`, then file position). */
export type TimelineEntry =
	| {
			kind: 'station.start'
			run: string
			station: string
			step?: number
			round?: number
			at: string
	  }
	| {
			kind: 'station.end'
			run: string
			station: string
			step?: number
			round?: number
			verdict?: StationVerdict
			exit?: number
			/** The hash of the worktree's state the station handed over (D29); absent in older events. */
			stateHash?: string
	  }
	| {
			kind: 'check'
			check: CheckName
			passed: boolean
			throwaway: boolean
			/** The hash of the state the check ran on (D29). */
			stateHash?: string
	  }
	| { kind: 'snapshot'; round: number }

/** What `nextStation` reads: pure, built by the reader of the lot's records. */
export type StationRecords = {
	/** The lot's derived state. */
	state: LotStateName
	/** The first open question's id. */
	openQuestion: string | null
	/** The brief's step count (at least 1). */
	steps: number
	effort: BriefEffort | undefined
	/** The package is a producer (a contrib check is needed). */
	producer: boolean
	/** A registry entry holds the lot folder. */
	registered: boolean
	/** Where checks come from; `none`: neither step events nor worktree records are readable. */
	checks: 'events' | 'records' | 'none'
	/** The worktree holds a tdd ledger or gate records. */
	worktreeRecords: boolean
	/** The review rounds a go-ahead row allows above the cap. */
	beyondCap: number[]
	timeline: TimelineEntry[]
}

export type NextStationKind =
	| 'none'
	| 'answer'
	| 'running'
	| 'station'
	| 'check'
	| 'snapshot'
	| 'question'
	| 'handover-write'
	| 'unknown'

/** The check a `check` position asks for; `tdd-green-and-gate-fast` needs both. */
export type NextCheckName =
	| 'tdd-red'
	| 'tdd-green-and-gate-fast'
	| 'gate-fast'
	| 'gate-full'
	| 'contrib'

/** The next station, as `lot status` shows it. */
export type NextStation = {
	kind: NextStationKind
	/** For `station` and `running`: the station to run (or running). */
	station: string | null
	/** For `check`: the check to run. */
	check: NextCheckName | null
	step: number | null
	round: number | null
	/** One line. */
	why: string
	/** Station ends that could not be placed. */
	unplaced: number
	/** Run ids of starts with no end that later events passed. */
	noEnd: string[]
}

/** A station end the walk can place: a known station with the step or round it needs, one per run. */
export type PlacedEnd = {
	/** The end's index in the timeline. */
	position: number
	station: StationName
	step: number | null
	round: number | null
	verdict: StationVerdict | undefined
	exit: number | undefined
	/** The index of its run's start in the timeline; null for an end recorded alone. */
	start: number | null
	/** The state hash of the tree the station handed over (D29); undefined in older events. */
	stateHash: string | undefined
}

/** A check entry that may count: never a throwaway; with the state hash it ran on, when known (D29). */
export type CheckPoint = { position: number; passed: boolean; stateHash: string | undefined }

/** A start with no end anywhere in the timeline. */
export type OpenStart = Extract<TimelineEntry, { kind: 'station.start' }>

/** What one pass over the timeline finds, indexed by position for the walk. */
export type TimelineIndex = {
	/** The step stations' ends, by step. */
	stepEnds: Map<number, PlacedEnd[]>
	/** The round stations' ends of the review rounds, by round. */
	roundEnds: Map<number, PlacedEnd[]>
	/** The `independent-reviewer` ends. */
	independentEnds: PlacedEnd[]
	/** The `fixer` ends that follow an independent review's `fix-then-repass`. */
	independentFixerEnds: PlacedEnd[]
	/** The non-throwaway entries of each check, in order. */
	checks: Map<CheckName, CheckPoint[]>
	/** The rounds with a snapshot. */
	snapshots: Set<number>
	/** The positions of every start and end of an edit station, ascending. */
	editPositions: number[]
	/** The start with no end that no later station event or snapshot follows (checks may, D32). */
	running: OpenStart | null
	/** Whether the timeline holds any station start or end. */
	stationRecorded: boolean
	unplaced: number
	noEnd: string[]
}

/** What every phase of the walk reads. */
export type StationWalk = { records: StationRecords; index: TimelineIndex }

/** A review round's outcome: the next station inside it, or the round approved or fixed and checked. */
export type RoundOutcome = NextStation | 'approved' | 'fixed'

/** The `why` values of a template, by placeholder. */
export type WhyValues = Record<string, string | number>
