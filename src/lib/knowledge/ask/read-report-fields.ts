import { TIER_NAMES } from '../../models/model-tiers.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import {
	REPORT_FAULT_TEMPLATE,
	REPORT_FAULTS,
	REPORT_PATH_FIELD,
	REPORT_PATH_ITEM,
	REPORT_PATH_ROOT,
	REPORT_TIER_FIELD,
} from './ask.constants.ts'

import type { ModelTierName } from '../../models/model-tiers.types.ts'
import type {
	FaultWording,
	FieldReadParams,
	FieldResult,
	ListReadParams,
	WordReadParams,
} from './ask.types.ts'

/** True for a JSON object (not null, not a list). */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One fault: where, what failed, the fix (`{allowed}` in the fix is filled when given). */
export function faultOf(params: { path: string; wording: FaultWording; allowed?: string }): string {
	const fix = fillMessage({
		template: params.wording.fix,
		values: { allowed: params.allowed ?? '' },
	})
	return fillMessage({
		template: REPORT_FAULT_TEMPLATE,
		values: { path: params.path, problem: params.wording.problem, fix },
	})
}

/**
 * The optional `tier` of a report (R1-19): absent reads as none, else one of the tier names, refused otherwise.
 */
export function readTier(params: {
	record: Record<string, unknown>
}): FieldResult<ModelTierName | undefined> {
	const field = rootFieldOf({ record: params.record, field: REPORT_TIER_FIELD })
	if (field.value === undefined) return { read: undefined }
	return readWord({ ...field, allowed: TIER_NAMES })
}

/** The faults of the results that failed, in order. */
export function faultsOf(params: { results: FieldResult<unknown>[] }): string[] {
	return params.results.flatMap((result) => ('faults' in result ? result.faults : []))
}

/** The params to read one field of an object: its path under the parent's. */
export function fieldOf(params: {
	record: Record<string, unknown>
	field: string
	path: string
}): FieldReadParams {
	return {
		value: params.record[params.field],
		path: fillMessage({
			template: REPORT_PATH_FIELD,
			values: { path: params.path, field: params.field },
		}),
	}
}

/** A field of the report object, its path starting at the report's root. */
export function rootFieldOf(params: {
	record: Record<string, unknown>
	field: string
}): FieldReadParams {
	return fieldOf({ ...params, path: REPORT_PATH_ROOT })
}

/** A failed read: one fault at the path of the params. */
function failure(params: { read: FieldReadParams; wording: FaultWording }): { faults: string[] } {
	return { faults: [faultOf({ path: params.read.path, wording: params.wording })] }
}

/** A string (possibly empty), or a fault. */
export function readString(params: FieldReadParams): FieldResult<string> {
	if (params.value === undefined) return failure({ read: params, wording: REPORT_FAULTS.missing })
	if (typeof params.value !== 'string')
		return failure({ read: params, wording: REPORT_FAULTS.notString })
	return { read: params.value }
}

/** A non-empty string, or a fault. */
export function readText(params: FieldReadParams): FieldResult<string> {
	if (params.value === undefined) return failure({ read: params, wording: REPORT_FAULTS.missing })
	if (typeof params.value !== 'string' || params.value.trim() === '')
		return failure({ read: params, wording: REPORT_FAULTS.notText })
	return { read: params.value }
}

/** A string or null, or a fault. */
export function readNullableString(params: FieldReadParams): FieldResult<string | null> {
	if (params.value === undefined) return failure({ read: params, wording: REPORT_FAULTS.missing })
	if (params.value !== null && typeof params.value !== 'string')
		return failure({ read: params, wording: REPORT_FAULTS.notNullableString })
	return { read: params.value }
}

/** A whole number, or a fault. */
export function readInteger(params: FieldReadParams): FieldResult<number> {
	if (params.value === undefined) return failure({ read: params, wording: REPORT_FAULTS.missing })
	if (typeof params.value !== 'number' || !Number.isInteger(params.value))
		return failure({ read: params, wording: REPORT_FAULTS.notInteger })
	return { read: params.value }
}

/** One of the allowed words, or a fault naming them. */
export function readWord<Word extends string>(params: WordReadParams<Word>): FieldResult<Word> {
	if (params.value === undefined) return failure({ read: params, wording: REPORT_FAULTS.missing })
	const word = params.allowed.find((allowed) => allowed === params.value)
	if (word !== undefined) return { read: word }
	return {
		faults: [
			faultOf({
				path: params.path,
				wording: REPORT_FAULTS.notWord,
				allowed: params.allowed.join(', '),
			}),
		],
	}
}

/** A list read item by item, every faulty item named at its own path. */
export function readList<Item>(params: ListReadParams<Item>): FieldResult<Item[]> {
	if (params.value === undefined) return failure({ read: params, wording: REPORT_FAULTS.missing })
	if (!Array.isArray(params.value)) return failure({ read: params, wording: REPORT_FAULTS.notList })
	const reads: Item[] = []
	const faults: string[] = []
	for (const [index, value] of params.value.entries()) {
		const result = params.readItem({
			value,
			path: fillMessage({
				template: REPORT_PATH_ITEM,
				values: { path: params.path, index: String(index) },
			}),
		})
		if ('faults' in result) faults.push(...result.faults)
		else reads.push(result.read)
	}
	return faults.length > 0 ? { faults } : { read: reads }
}

/** A list of strings, or the faults. */
export function readStringList(params: FieldReadParams): FieldResult<string[]> {
	return readList({ ...params, readItem: readString })
}

/** An object item of a list, or a fault. */
export function readObjectItem(params: FieldReadParams): FieldResult<Record<string, unknown>> {
	if (isRecord(params.value)) return { read: params.value }
	return failure({ read: params, wording: REPORT_FAULTS.notObjectItem })
}
