import type {
	OrchestratorDamage,
	OrchestratorNote,
	OrchestratorState,
	OrchestratorWorkspace,
} from '../lib/orchestrator/orchestrator.types.ts'

/** Arguments of the pure orchestrate command, independent of process output and exit. */
export type RunOrchestrateParams = {
	cwd: string
	argv: readonly string[]
	environment: Record<string, string | undefined>
	/** The home folder the state home falls back to; the command's edge passes the real one. */
	home: string
}

/** What `orchestrate status` found: a valid state, no state, or damage. */
export type OrchestrateStatusOutcome = 'present' | 'missing' | 'damaged'

/** One versioned result of `orchestrate status --json`. */
export type OrchestrateStatusJson = {
	schema: 1
	workspace: OrchestratorWorkspace
	outcome: OrchestrateStatusOutcome
	state: OrchestratorState | null
	statusLine: string
	damage: readonly OrchestratorDamage[]
	notes: readonly OrchestratorNote[]
}
