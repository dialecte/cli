import type { LotStateName, StateFolderLocation } from '../store/store.types.ts'
import type {
	ORCHESTRATOR_HELD_BY,
	ORCHESTRATOR_LANE_MODES,
	ORCHESTRATOR_WAITING_KINDS,
} from './orchestrator.constants.ts'

export type ParseOrchestratorStateParams = { text: string }

export type ParseOrchestratorEventParams = { text: string }

/** One value the parsers read, and the path naming it in a fault (`lanes[0].mode`). */
export type OrchestratorJsonValue = { value: unknown; path: string }

export type WriteOrchestratorStateParams = {
	paths: OrchestratorPaths
	state: OrchestratorState
	/** Called after the state temporary file is complete, before either final file is replaced. */
	afterStateTemporaryWritten?: (temporary: string) => void
}

export type OrchestratorEvent = {
	schema: 1
	id: string
	at: string
	kind: string
	subject: string
	facts: Readonly<Record<string, unknown>>
}

export type ReadOrchestratorLogParams = { path: string }

export type ReadOrchestratorLogResult = {
	records: readonly OrchestratorEvent[]
	/** JSON lines that are not a valid event, and a last line without its newline. */
	damaged: number
	/** Complete lines that are not JSON (the sealed remains of a torn append, or an empty line). */
	skipped: number
}

export type AppendOrchestratorEventParams = {
	paths: OrchestratorPaths
	event: OrchestratorEvent
}

/** The faults of the orchestrator parsers: the JSON, the schema version, a missing, unknown or invalid field. */
export type OrchestratorParserFaultCode =
	| 'not-json'
	| 'unknown-schema'
	| 'missing-field'
	| 'unknown-field'
	| 'invalid-value'

/** Every code an `OrchestratorFault` carries: the parsers', then the append's refusals. */
export type OrchestratorFaultCode =
	| OrchestratorParserFaultCode
	| 'state-missing'
	| 'state-unreadable'
	| 'state-invalid'
	| 'workspace-mismatch'
	| 'event-invalid'

export type OrchestratorFaultParams = {
	code: OrchestratorFaultCode
	/** The first broken field, as a path (`workspace.root`, `lanes[0].mode`); none when no field is to blame. */
	field?: string
	message: string
}

/** What makes a reading of the orchestrator folder damaged. */
export type OrchestratorDamageCode =
	| 'state-missing'
	| 'state-invalid'
	| 'state-unreadable'
	| 'workspace-mismatch'
	| 'log-damaged'
	| 'log-unreadable'

export type OrchestratorDamage = {
	source: 'state' | 'log'
	code: OrchestratorDamageCode
	message: string
}

/** What a reading notes without being damaged: the render is only a view of state.json, a skipped line is sealed. */
export type OrchestratorNoteCode =
	| 'render-missing'
	| 'render-stale'
	| 'render-unreadable'
	| 'log-skipped'

export type OrchestratorNote = {
	source: 'render' | 'log'
	code: OrchestratorNoteCode
	message: string
}

export type ReadOrchestratorStateParams = { paths: OrchestratorPaths }

export type ReadOrchestratorStateResult = {
	state: OrchestratorState | null
	damage: readonly OrchestratorDamage[]
	/** Empty when `state` is null: nothing was rendered against. */
	notes: readonly OrchestratorNote[]
	records: readonly OrchestratorEvent[]
}

export type RenderOrchestratorStateParams = {
	state: OrchestratorState
	records: readonly OrchestratorEvent[]
}

export type OrchestratorWorkspace = { root: string; key: string }

/** The selected workspace and where the state home is; `home` is required, the command's edge passes the real one. */
export type OrchestratorPathsParams = Omit<StateFolderLocation, 'home'> & {
	workspace: string
	home: string
}

export type OrchestratorPaths = {
	workspace: OrchestratorWorkspace
	folder: string
	state: string
	render: string
	log: string
}

export type OrchestratorLane = {
	name: string
	repos: readonly string[]
	holds: readonly string[]
	owns: readonly string[]
	mode: (typeof ORCHESTRATOR_LANE_MODES)[number]
	plan: string
	queue: readonly string[]
	pin?: string
}

export type OrchestratorLot = {
	id: string
	lane: string
	repo: string
	state: LotStateName
	station: string
	attempt: number
	pr: string
	head: string
	run?: { runner: string; handle: string }
}

export type OrchestratorRun = {
	id: string
	kind: string
	subject: string
	runner: string
	attempt: number
	status: string
	started: string
	until?: string
}

export type OrchestratorRunner = {
	id: string
	available: boolean
	until?: string
	tokensSinceReset: number
	usage?: string
}

export type HeldItem = {
	item: string
	by: (typeof ORCHESTRATOR_HELD_BY)[number]
	since: string
	until?: string
}

export type WaitingItem = {
	id: string
	kind: (typeof ORCHESTRATOR_WAITING_KINDS)[number]
	text: string
	line?: string
	options?: readonly string[]
}

export type OrchestratorChangeRequest = {
	repo: string
	head: string
	ci: string
	review: string
}

export type NextItem = { lane: string; lot: string }

export type SeenItem = { source: string; event: string }

export type OrchestratorState = {
	schema: 1
	workspace: OrchestratorWorkspace
	updatedAt: string
	lanes: readonly OrchestratorLane[]
	lots: readonly OrchestratorLot[]
	runs: readonly OrchestratorRun[]
	runners: readonly OrchestratorRunner[]
	held: readonly HeldItem[]
	waitingOnYou: readonly WaitingItem[]
	prs: readonly OrchestratorChangeRequest[]
	next: readonly NextItem[]
	seen: readonly SeenItem[]
}
