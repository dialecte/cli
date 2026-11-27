import {
	parseOrchestratorJson,
	readRecord,
	readSchemaVersion,
	readString,
	rejectUnknown,
} from './orchestrator-json.ts'
import { ORCHESTRATOR_EVENT_FIELDS } from './orchestrator.constants.ts'

import type { OrchestratorEvent, ParseOrchestratorEventParams } from './orchestrator.types.ts'

/**
 * The one check of an orchestrator log event, used by the log reader and by the append: the typed event of a JSON
 * line, or an `OrchestratorFault` carrying its code, the first broken field and the message (known fields in schema
 * order, then the unknown keys in lexical order).
 */
export function parseOrchestratorEvent(params: ParseOrchestratorEventParams): OrchestratorEvent {
	const event = readRecord({ value: parseOrchestratorJson(params), path: 'event' })
	const value: OrchestratorEvent = {
		schema: readSchemaVersion({ value: event.schema, path: 'schema' }),
		id: readString({ value: event.id, path: 'id' }),
		at: readString({ value: event.at, path: 'at' }),
		kind: readString({ value: event.kind, path: 'kind' }),
		subject: readString({ value: event.subject, path: 'subject' }),
		facts: { ...readRecord({ value: event.facts, path: 'facts' }) },
	}
	rejectUnknown({ record: event, path: 'event', allowed: ORCHESTRATOR_EVENT_FIELDS, root: true })
	return value
}
