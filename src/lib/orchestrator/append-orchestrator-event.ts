import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { appendLine } from '../events/write-event.ts'
import { replaceWhole } from '../store/publish.ts'
import { loadOrchestratorState } from './load-orchestrator-state.ts'
import { OrchestratorFault } from './orchestrator-fault.ts'
import { parseOrchestratorEvent } from './parse-orchestrator-event.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'
import { renderOrchestratorState } from './render-orchestrator-state.ts'

import type { AppendOrchestratorEventParams, OrchestratorEvent } from './orchestrator.types.ts'

/**
 * Appends one event to `log.jsonl` in one bounded write, then replaces `STATE.md` with the render of `state.json` on
 * disk and the new tail. Refuses, writing nothing, in this order: a missing, unreadable or invalid `state.json`, a
 * state of another workspace, an event the one event check refuses (`event-invalid`), a line over the byte limit.
 */
export function appendOrchestratorEvent(params: AppendOrchestratorEventParams): void {
	const state = loadOrchestratorState({ paths: params.paths })
	const event = checkedEvent({ event: params.event })
	appendLine({
		file: params.paths.log,
		line: Buffer.from(`${JSON.stringify(event)}\n`, 'utf8'),
		limit: EVENT_LINE_LIMIT,
	})
	const log = readOrchestratorLog({ path: params.paths.log })
	replaceWhole({
		path: params.paths.render,
		text: renderOrchestratorState({ state, records: log.records }),
	})
}

/** The event as the one event check reads it; an `event-invalid` fault keeping the check's field and message. */
function checkedEvent(params: { event: OrchestratorEvent }): OrchestratorEvent {
	try {
		return parseOrchestratorEvent({ text: JSON.stringify(params.event) })
	} catch (error) {
		if (!(error instanceof OrchestratorFault)) throw error
		throw new OrchestratorFault({
			code: 'event-invalid',
			field: error.field,
			message: `event: ${error.message}`,
		})
	}
}
