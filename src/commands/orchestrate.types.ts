import type {
	OrchestratorDamage,
	OrchestratorState,
	OrchestratorWorkspace,
} from '../lib/orchestrator/orchestrator.types.ts'

/** Arguments of the pure orchestrate command, independent of process output and exit. */
export type RunOrchestrateParams = {
	cwd: string
	argv: readonly string[]
	environment?: Record<string, string | undefined>
	home?: string
}

/** One versioned result of `orchestrate status --json`. */
export type OrchestrateStatusJson = {
	schema: 1
	workspace: OrchestratorWorkspace
	outcome: 'present' | 'missing' | 'damaged'
	state: OrchestratorState | null
	statusLine: string
	damage: readonly OrchestratorDamage[]
}
