/**
 * The overlaps a lot accepted (`lot start` / `lot scope --overlap-ok --by <who> --reason <text>`, FIX-overlap-ok): one
 * line per other open lot in the lot folder's `overlaps.jsonl`, each naming the met pairs, who accepted and why. Only
 * an overlap that names its paths can be accepted: an other lot whose scope cannot be read, or a damaged one, holds
 * every path or an unknown one.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { appendLine } from '../events/write-event.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import {
	LOT_OVERLAP_KEYS,
	LOT_OVERLAP_LINE_LIMIT,
	LOT_OVERLAP_MET_SEPARATOR,
	LOT_OVERLAP_SCHEMA,
	LOT_OVERLAP_SEPARATOR,
	LOT_OVERLAP_TEXT,
	LOT_OVERLAP_VERBS,
} from './lot-overlaps.constants.ts'
import { STORE_FILES } from './store.constants.ts'

import type { LotOverlapRecord, OverlapVerb } from './lot-overlaps.types.ts'
import type { LotOverlap } from './store.types.ts'

/** The overlaps the lot folder records, in file order; none without the file. A line that does not read is skipped. */
export function readLotOverlaps(params: { lotFolder: string }): LotOverlapRecord[] {
	let content: string
	try {
		content = readFileSync(lotOverlapsFileOf(params), 'utf8')
	} catch {
		return []
	}
	const lines = content.split('\n')
	// the text after the last line feed is a line without its end: never trusted
	lines.pop()
	return lines.flatMap((text) => {
		const record = parseOverlapRecord(text)
		return record === undefined ? [] : [record]
	})
}

/** Appends the records of one call in one write; refused over the line limit. */
export function appendLotOverlaps(params: {
	lotFolder: string
	records: readonly LotOverlapRecord[]
}): void {
	appendLine({
		file: lotOverlapsFileOf(params),
		line: Buffer.from(
			params.records.map((record) => `${JSON.stringify(record)}\n`).join(''),
			'utf8',
		),
		limit: LOT_OVERLAP_LINE_LIMIT,
	})
}

/** The records of the overlaps a verb accepted at `at`, by who and why. */
export function overlapRecordsOf(params: {
	overlaps: readonly LotOverlap[]
	verb: OverlapVerb
	at: string
	by: string
	reason: string
}): LotOverlapRecord[] {
	const { verb, at, by, reason } = params
	return params.overlaps.map((overlap) => ({
		schema: LOT_OVERLAP_SCHEMA,
		at,
		verb,
		lot: overlap.name,
		met: overlap.met,
		by,
		reason,
	}))
}

/** An overlap `--overlap-ok` may accept: it names its met paths (its lot's scope reads, and the lot is not damaged). */
export function isAcceptableOverlap(overlap: LotOverlap): boolean {
	return overlap.everyPath !== true && overlap.damage === undefined && overlap.met.length > 0
}

/** The recorded overlaps as one text (`overlaps <lot>: <met> (by <who>: <reason>)`, joined); undefined for none. */
export function lotOverlapsText(records: readonly LotOverlapRecord[]): string | undefined {
	if (records.length === 0) return undefined
	return records
		.map((record) =>
			fillMessage({
				template: LOT_OVERLAP_TEXT,
				values: {
					lot: record.lot,
					met: record.met.join(LOT_OVERLAP_MET_SEPARATOR),
					by: record.by,
					reason: record.reason,
				},
			}),
		)
		.join(LOT_OVERLAP_SEPARATOR)
}

/** The lot folder's `overlaps.jsonl`. */
function lotOverlapsFileOf(params: { lotFolder: string }): string {
	return join(params.lotFolder, STORE_FILES.overlaps)
}

/** The record a line holds: every key, no other, each of its type; undefined when it does not read as one. */
function parseOverlapRecord(text: string): LotOverlapRecord | undefined {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	const record = value as Record<string, unknown>
	const keys = Object.keys(record)
	if (keys.length !== LOT_OVERLAP_KEYS.length || !LOT_OVERLAP_KEYS.every((key) => key in record))
		return undefined
	const { schema, at, verb, lot, met, by, reason } = record
	if (
		schema !== LOT_OVERLAP_SCHEMA ||
		typeof verb !== 'string' ||
		!LOT_OVERLAP_VERBS.includes(verb)
	)
		return undefined
	if (![at, lot, by, reason].every((field) => typeof field === 'string' && field !== ''))
		return undefined
	if (!Array.isArray(met) || !met.every((pair) => typeof pair === 'string')) return undefined
	return record as LotOverlapRecord
}
