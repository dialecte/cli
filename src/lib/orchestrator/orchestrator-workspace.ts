import type { OrchestratorState, OrchestratorWorkspace } from './orchestrator.types.ts'

export function orchestratorWorkspaceMismatch(params: {
	state: OrchestratorState
	selected: OrchestratorWorkspace
}): string | undefined {
	if (params.state.workspace.root !== params.selected.root)
		return `state.workspace.root must equal selected workspace root ${params.selected.root}`
	if (params.state.workspace.key !== params.selected.key)
		return `state.workspace.key must equal selected workspace key ${params.selected.key}`
	return undefined
}
