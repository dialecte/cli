/**
 * One table of log events, each checked against `parseOrchestratorEvent` and against the shipped
 * `orchestrator-event.schema.json`, so the parser and the schema agree on every row.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { schemaFaultsOf } from '../../../test/json-schema-faults.ts'
import { parseOrchestratorEvent } from './parse-orchestrator-event.ts'

import { describe, expect, it } from 'vitest'

import type { JsonSchema } from '../../../test/json-schema-faults.types.ts'

type FaultView = { code: unknown; field: unknown; message: string }
type ParsedView = { event: unknown } | FaultView
type ThrownView = FaultView & { isError: boolean; name: string }
type EventRow = { value: Record<string, unknown>; parsed: ParsedView; schemaValid: boolean }

const EVENT_SCHEMA = join(import.meta.dirname, 'orchestrator-event.schema.json')

/** The parser's answer for `text`: the event, or whether the fault is an Error, its name, code, field and message. */
function parsedOf(params: { text: string }): { event: unknown } | ThrownView {
	try {
		return { event: parseOrchestratorEvent(params) }
	} catch (error) {
		const fault = error as { code?: unknown; field?: unknown }
		return {
			isError: error instanceof Error,
			name: error instanceof Error ? error.name : typeof error,
			code: fault.code,
			field: fault.field,
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

/** Whether `value` validates against the shipped event schema; the reason when the schema cannot be read. */
function schemaValidOf(params: { value: unknown }): boolean | string {
	if (!existsSync(EVENT_SCHEMA)) return 'orchestrator-event.schema.json missing'
	const schema = JSON.parse(readFileSync(EVENT_SCHEMA, 'utf8')) as JsonSchema
	try {
		return schemaFaultsOf({ value: params.value, schema }).length === 0
	} catch (error) {
		return String(error)
	}
}

const EVENT = {
	schema: 1,
	id: 'event-a',
	at: '2026-11-26T09:00:00.000Z',
	kind: 'station',
	subject: 'lot-a',
	facts: { state: 'working' },
}

/** The expected answer of a row: a fault is an Error named OrchestratorFault. */
function expectedParsed(parsed: ParsedView): unknown {
	return 'code' in parsed ? { isError: true, name: 'OrchestratorFault', ...parsed } : parsed
}

/** `EVENT` without `field`. */
function without(field: string): Record<string, unknown> {
	return Object.fromEntries(Object.entries(EVENT).filter(([key]) => key !== field))
}

const CASES: Record<string, EventRow> = {
	'whole event -> the typed event, valid for the schema': {
		value: EVENT,
		parsed: { event: EVENT },
		schemaValid: true,
	},
	'event with empty facts -> the typed event, valid for the schema': {
		value: { ...EVENT, facts: {} },
		parsed: { event: { ...EVENT, facts: {} } },
		schemaValid: true,
	},
	'event with nested facts -> the typed event, facts kept whole, valid for the schema': {
		value: { ...EVENT, facts: { lot: { id: 'lot-a', attempt: 2 }, notes: ['a', 'b'] } },
		parsed: { event: { ...EVENT, facts: { lot: { id: 'lot-a', attempt: 2 }, notes: ['a', 'b'] } } },
		schemaValid: true,
	},
	'schema 2 -> unknown-schema on schema, invalid for the schema': {
		value: { ...EVENT, schema: 2 },
		parsed: { code: 'unknown-schema', field: 'schema', message: 'schema: unknown version 2' },
		schemaValid: false,
	},
	'schema missing -> missing-field on schema, invalid for the schema': {
		value: without('schema'),
		parsed: { code: 'missing-field', field: 'schema', message: 'schema: expected 1' },
		schemaValid: false,
	},
	'id missing -> missing-field on id, invalid for the schema': {
		value: without('id'),
		parsed: { code: 'missing-field', field: 'id', message: 'id: expected string' },
		schemaValid: false,
	},
	'id a number -> invalid-value on id, invalid for the schema': {
		value: { ...EVENT, id: 7 },
		parsed: { code: 'invalid-value', field: 'id', message: 'id: expected string' },
		schemaValid: false,
	},
	'at missing -> missing-field on at, invalid for the schema': {
		value: without('at'),
		parsed: { code: 'missing-field', field: 'at', message: 'at: expected string' },
		schemaValid: false,
	},
	'kind missing -> missing-field on kind, invalid for the schema': {
		value: without('kind'),
		parsed: { code: 'missing-field', field: 'kind', message: 'kind: expected string' },
		schemaValid: false,
	},
	'subject a boolean -> invalid-value on subject, invalid for the schema': {
		value: { ...EVENT, subject: true },
		parsed: { code: 'invalid-value', field: 'subject', message: 'subject: expected string' },
		schemaValid: false,
	},
	'facts missing -> missing-field on facts, invalid for the schema': {
		value: without('facts'),
		parsed: { code: 'missing-field', field: 'facts', message: 'facts: expected object' },
		schemaValid: false,
	},
	'facts an array -> invalid-value on facts, invalid for the schema': {
		value: { ...EVENT, facts: ['working'] },
		parsed: { code: 'invalid-value', field: 'facts', message: 'facts: expected object' },
		schemaValid: false,
	},
	'unknown field -> unknown-field on it, after every known field passed, invalid for the schema': {
		value: { ...EVENT, zzz: 1, extra: true },
		parsed: { code: 'unknown-field', field: 'extra', message: 'event: unknown field "extra"' },
		schemaValid: false,
	},
	'a missing field before an unknown one -> the missing field wins, invalid for the schema': {
		value: { ...without('id'), extra: true },
		parsed: { code: 'missing-field', field: 'id', message: 'id: expected string' },
		schemaValid: false,
	},
}

describe('parseOrchestratorEvent and the event schema, one table', function parseorchestratoreventAndTheEventSchema() {
	it.each(Object.entries(CASES))('%s', function checksCase(_title, row) {
		expect({
			parsed: parsedOf({ text: JSON.stringify(row.value) }),
			schemaValid: schemaValidOf({ value: row.value }),
		}).toEqual({ parsed: expectedParsed(row.parsed), schemaValid: row.schemaValid })
	})

	it('a line that is not JSON -> not-json, no field, exact message', function aLineThatIsNot() {
		expect(parsedOf({ text: '{"schema":1,"id":"event-' })).toEqual({
			isError: true,
			name: 'OrchestratorFault',
			code: 'not-json',
			field: undefined,
			message: 'invalid JSON',
		})
	})
})
