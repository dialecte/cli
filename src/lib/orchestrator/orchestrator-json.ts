/**
 * The readers the orchestrator parsers share: each narrows one JSON value named by its path, or throws an
 * `OrchestratorFault` carrying the code and the field (`missing-field` when the value is absent, `invalid-value` when
 * it has the wrong shape), so the state and the event are checked by the same rules.
 */
import { isMapping } from '../config/config-checks.ts'
import { OrchestratorFault } from './orchestrator-fault.ts'

import type { OrchestratorJsonValue } from './orchestrator.types.ts'

/** The JSON value of `text`, or a `not-json` fault without a field. */
export function parseOrchestratorJson(params: { text: string }): unknown {
	try {
		return JSON.parse(params.text)
	} catch (error) {
		if (error instanceof SyntaxError)
			throw new OrchestratorFault({ code: 'not-json', message: 'invalid JSON' })
		throw error
	}
}

/** The fault of a value that is absent (`missing-field`) or of the wrong shape (`invalid-value`). */
export function expectedFault(
	params: OrchestratorJsonValue & { expected: string },
): OrchestratorFault {
	return new OrchestratorFault({
		code: params.value === undefined ? 'missing-field' : 'invalid-value',
		field: params.path,
		message: `${params.path}: expected ${params.expected}`,
	})
}

/** The schema version, 1; `unknown-schema` for any other value. */
export function readSchemaVersion(params: OrchestratorJsonValue): 1 {
	if (params.value === undefined) throw expectedFault({ ...params, expected: '1' })
	if (params.value !== 1)
		throw new OrchestratorFault({
			code: 'unknown-schema',
			field: params.path,
			message: `${params.path}: unknown version ${String(params.value)}`,
		})
	return 1
}

/** An object. */
export function readRecord(params: OrchestratorJsonValue): Record<string, unknown> {
	if (!isMapping(params.value)) throw expectedFault({ ...params, expected: 'object' })
	return params.value
}

/** An object, or undefined when absent. */
export function readOptionalRecord(
	params: OrchestratorJsonValue,
): Record<string, unknown> | undefined {
	if (params.value === undefined) return undefined
	return readRecord(params)
}

/** A list, each item read by `read` under the path `<path>[<index>]`. */
export function readList<Item>(
	params: OrchestratorJsonValue & { read: (item: OrchestratorJsonValue) => Item },
): Item[] {
	if (!Array.isArray(params.value)) throw expectedFault({ ...params, expected: 'array' })
	const values: unknown[] = params.value
	return values.map(function readItem(value, index) {
		return params.read({ value, path: `${params.path}[${String(index)}]` })
	})
}

/** A list of texts. */
export function readStringList(params: OrchestratorJsonValue): string[] {
	return readList({ ...params, read: readString })
}

/** A list of texts, or undefined when absent. */
export function readOptionalStringList(params: OrchestratorJsonValue): string[] | undefined {
	if (params.value === undefined) return undefined
	return readStringList(params)
}

/** A text. */
export function readString(params: OrchestratorJsonValue): string {
	if (typeof params.value !== 'string') throw expectedFault({ ...params, expected: 'string' })
	return params.value
}

/** A text, or undefined when absent. */
export function readOptionalString(params: OrchestratorJsonValue): string | undefined {
	if (params.value === undefined) return undefined
	return readString(params)
}

/** A finite number. */
export function readNumber(params: OrchestratorJsonValue): number {
	if (typeof params.value !== 'number' || !Number.isFinite(params.value))
		throw expectedFault({ ...params, expected: 'number' })
	return params.value
}

/** A boolean. */
export function readBoolean(params: OrchestratorJsonValue): boolean {
	if (typeof params.value !== 'boolean') throw expectedFault({ ...params, expected: 'boolean' })
	return params.value
}

/** One of the `allowed` words; the fault names `expected`. */
export function readOneOf<Word extends string>(
	params: OrchestratorJsonValue & { allowed: readonly Word[]; expected: string },
): Word {
	const allowed: readonly unknown[] = params.allowed
	if (allowed.includes(params.value)) return params.value as Word
	throw expectedFault(params)
}

/**
 * Refuses the first key of `record` outside `allowed`, in lexical order: an `unknown-field` fault whose field is the
 * key below `path` (the key alone at the document's root).
 */
export function rejectUnknown(params: {
	record: Record<string, unknown>
	path: string
	allowed: readonly string[]
	root?: boolean
}): void {
	const key = Object.keys(params.record)
		.filter(function isUnknown(candidate) {
			return !params.allowed.includes(candidate)
		})
		.sort()[0]
	if (key === undefined) return
	throw new OrchestratorFault({
		code: 'unknown-field',
		field: params.root === true ? key : `${params.path}.${key}`,
		message: `${params.path}: unknown field "${key}"`,
	})
}
