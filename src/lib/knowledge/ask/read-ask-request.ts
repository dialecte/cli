import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { BRIEF_EFFORTS } from '../../store/brief.constants.ts'
import { fillMessage } from '../standard/fill-message.ts'
import { ASK_RECORD_REFUSALS, KIND_SLOT_NEEDS, REQUEST_RECORD_FILE } from './ask.constants.ts'
import { isRecord } from './read-report-fields.ts'

import type { AskRequestRecord, ReadAskRequest, ReadAskRequestParams } from './ask.types.ts'

/**
 * The request an ask was made with (`request.json`, D2): absent for an ask made before the readers, refused when the
 * file does not read as schema 1.
 */
export function readAskRequest(params: ReadAskRequestParams): ReadAskRequest {
	const path = join(params.askFolder, REQUEST_RECORD_FILE)
	if (!existsSync(path)) return { absent: true }
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		value = undefined
	}
	if (isRequestRecord(value)) return { request: value }
	return { refused: fillMessage({ template: ASK_RECORD_REFUSALS.damaged, values: { path } }) }
}

/** Whether a value reads as a request record of schema 1, every member of its type present and of its kind. */
function isRequestRecord(value: unknown): value is AskRequestRecord {
	if (!isRecord(value) || value.schema !== 1 || typeof value.question !== 'string') return false
	const texts = [value.about, value.code, value.method, value.package]
	if (!texts.every((text) => text === null || typeof text === 'string')) return false
	if (typeof value.kind !== 'string' || !Object.hasOwn(KIND_SLOT_NEEDS, value.kind)) return false
	if (typeof value.decision !== 'boolean' || typeof value.documents !== 'boolean') return false
	if (typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1)
		return false
	if (!BRIEF_EFFORTS.some((effort) => effort === value.effort)) return false
	return value.standard === null || isRequestStandard(value.standard)
}

/** Whether a value reads as the documents a request records: name, key, folders and each file's manifest entry. */
function isRequestStandard(value: unknown): boolean {
	if (!isRecord(value)) return false
	if (![value.name, value.key].every((text) => text === null || typeof text === 'string'))
		return false
	if (!Array.isArray(value.folders) || !value.folders.every((id) => typeof id === 'string'))
		return false
	return (
		Array.isArray(value.files) &&
		value.files.every(
			(file: unknown) =>
				isRecord(file) &&
				typeof file.id === 'string' &&
				typeof file.sha256 === 'string' &&
				typeof file.lines === 'number',
		)
	)
}
