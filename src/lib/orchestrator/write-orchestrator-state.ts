import { mkdirSync } from 'node:fs'

import { recordText, replaceWhole } from '../store/publish.ts'
import { orchestratorWorkspaceMismatch } from './orchestrator-workspace.ts'
import { parseOrchestratorState } from './parse-orchestrator-state.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'
import { renderOrchestratorState } from './render-orchestrator-state.ts'

import type { WriteOrchestratorStateParams } from './orchestrator.types.ts'

export function writeOrchestratorState(params: WriteOrchestratorStateParams): void {
	const stateText = recordText(params.state)
	const state = parseOrchestratorState({ text: stateText })
	const mismatch = orchestratorWorkspaceMismatch({ state, selected: params.paths.workspace })
	if (mismatch !== undefined) throw new Error(mismatch)
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
