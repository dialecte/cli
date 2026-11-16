import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../standard/fill-message.ts'
import {
	ADJUDICATOR_BRIEF_FILES,
	ADJUDICATOR_READER,
	ASK_RECORD_REFUSALS,
} from './ask.constants.ts'
import { isRecord } from './read-report-fields.ts'

import type { AdjudicatorBriefJson } from './ask.types.ts'

/**
 * The adjudicator's brief of a round folder, as its report is checked against it (its round, nonce and cited
 * ranges); absent when the folder holds none; refused when it does not read as schema 1.
 */
export function readAdjudicatorBrief(params: {
	folder: string
}): { brief: AdjudicatorBriefJson } | { absent: true } | { refused: string } {
	const path = join(params.folder, ADJUDICATOR_BRIEF_FILES.json)
	if (!existsSync(path)) return { absent: true }
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		value = undefined
	}
	if (isAdjudicatorBrief(value)) return { brief: value }
	return { refused: fillMessage({ template: ASK_RECORD_REFUSALS.damaged, values: { path } }) }
}

/** Whether a value reads as an adjudicator's brief of schema 1: its round, nonce and ranges (file and lines). */
function isAdjudicatorBrief(value: unknown): value is AdjudicatorBriefJson {
	if (!isRecord(value) || value.schema !== 1 || value.reader !== ADJUDICATOR_READER) return false
	if (typeof value.round !== 'number' || typeof value.nonce !== 'string') return false
	return (
		Array.isArray(value.ranges) &&
		value.ranges.every(
			(range: unknown) =>
				isRecord(range) &&
				typeof range.file === 'string' &&
				typeof range.from === 'number' &&
				typeof range.to === 'number',
		)
	)
}
