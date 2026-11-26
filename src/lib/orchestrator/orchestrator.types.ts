import type { StateFolderLocation } from '../store/store.types.ts'

export type ParseOrchestratorStateParams = { text: string }

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
	damaged: number
}

export type AppendOrchestratorEventParams = {
	paths: OrchestratorPaths
	state: OrchestratorState
	event: OrchestratorEvent
}

export type OrchestratorDamage = {
	source: 'state' | 'render' | 'log'
	message: string
}

export type ReadOrchestratorStateParams = { paths: OrchestratorPaths }

export type ReadOrchestratorStateResult = {
	state: OrchestratorState | null
	damage: readonly OrchestratorDamage[]
	records: readonly OrchestratorEvent[]
}

export type ReadOrchestratorStateFileResult = {
	state: OrchestratorState | null
	damage?: OrchestratorDamage
}

export type RenderOrchestratorStateParams = {
	state: OrchestratorState
	records: readonly OrchestratorEvent[]
}

export type OrchestratorWorkspace = { root: string; key: string }

export type OrchestratorPathsParams = StateFolderLocation & { workspace: string }

export type OrchestratorPaths = {
	workspace: OrchestratorWorkspace
	folder: string
	state: string
	render: string
	log: string
	runs: string
	reviews: string
	answers: string
}

export type OrchestratorLane = {
	name: string
	repos: readonly string[]
	holds: readonly string[]
	owns: readonly string[]
	mode: 'running' | 'hold' | 'paused'
	plan: string
	queue: readonly string[]
	pin?: string
}

export type OrchestratorLot = {
	id: string
	lane: string
	repo: string
	state: 'working' | 'ready' | 'failed' | 'canceled' | 'input-required' | 'committed'
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
	by: 'user' | 'runner' | 'overlap'
	since: string
	until?: string
}

export type WaitingItem = {
	id: string
	kind: 'gate' | 'question'
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
