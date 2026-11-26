import { mkdirSync } from 'node:fs'

import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendLine } from '../events/write-event.ts'
import { recordText, replaceWhole } from '../store/publish.ts'
import { orchestratorWorkspaceMismatch } from './orchestrator-workspace.ts'
import { parseOrchestratorState } from './parse-orchestrator-state.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'
import { renderOrchestratorState } from './render-orchestrator-state.ts'

import type { AppendOrchestratorEventParams } from './orchestrator.types.ts'

export function appendOrchestratorEvent(params: AppendOrchestratorEventParams): void {
	const state = parseOrchestratorState({ text: recordText(params.state) })
	const mismatch = orchestratorWorkspaceMismatch({ state, selected: params.paths.workspace })
	if (mismatch !== undefined) throw new Error(mismatch)
	mkdirSync(params.paths.folder, { recursive: true })
	appendLine({
		file: params.paths.log,
		line: Buffer.from(`${JSON.stringify(params.event)}\n`, 'utf8'),
		limit: EVENT_LINE_LIMIT,
	})
	const log = readOrchestratorLog({ path: params.paths.log })
	replaceWhole({
		path: params.paths.render,
		text: renderOrchestratorState({ state, records: log.records }),
	})
}
