import { mkdirSync } from 'node:fs'

import { recordText, replaceWhole } from '../store/publish.ts'
import { OrchestratorFault } from './orchestrator-fault.ts'
import { orchestratorWorkspaceMismatch } from './orchestrator-workspace.ts'
import { parseStateJson } from './parse-state-json.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'
import { renderOrchestratorState } from './render-orchestrator-state.ts'

import type { WriteOrchestratorStateParams } from './orchestrator.types.ts'

/**
 * Writes a whole state: checks it (an `OrchestratorFault`, nothing written: `state-invalid` for a state the parser
 * refuses, `workspace-mismatch` for one of another workspace), makes the folder, replaces `state.json`, then `STATE.md` rendered from the same state and the log's tail.
 * A crash between the two replaces leaves a stale render, which a reader notes and the next write repairs.
 */
export function writeOrchestratorState(params: WriteOrchestratorStateParams): void {
	const stateText = recordText(params.state)
	const state = parseStateJson({ text: stateText })
	const mismatch = orchestratorWorkspaceMismatch({ state, selected: params.paths.workspace })
	if (mismatch !== undefined)
		throw new OrchestratorFault({ code: 'workspace-mismatch', message: mismatch })
	mkdirSync(params.paths.folder, { recursive: true })
	const log = readOrchestratorLog({ path: params.paths.log })
	const render = renderOrchestratorState({ state, records: log.records })
	replaceWhole({
		path: params.paths.state,
		text: stateText,
		afterTemporaryWritten: params.afterStateTemporaryWritten,
	})
	replaceWhole({ path: params.paths.render, text: render })
}
