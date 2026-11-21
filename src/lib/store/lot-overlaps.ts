/**
 * The overlaps a lot accepted (`lot start` / `lot scope --overlap-ok --by <who> --reason <text>`, FIX-overlap-ok): one
 * line per other open lot in the lot folder's `overlaps.jsonl`, each naming the met pairs, who accepted and why. Only
 * an overlap that names its paths can be accepted: an other lot whose scope cannot be read, or a damaged one, holds
 * every path or an unknown one.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { appendLine, overLimitMessage } from '../events/write-event.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { forbiddenWordRefusal } from '../review-rounds/option-checks.ts'
import {
	LOT_OVERLAP_DAMAGED_LOT,
	LOT_OVERLAP_KEYS,
	LOT_OVERLAP_OPTIONAL_KEYS,
	LOT_OVERLAP_LINE_LIMIT,
	LOT_OVERLAP_OVER_LIMIT,
	LOT_OVERLAP_MET_SEPARATOR,
	LOT_OVERLAP_SCHEMA,
	LOT_OVERLAP_SEPARATOR,
	LOT_OVERLAP_TEXT,
	LOT_OVERLAP_UNDO_KEYS,
	LOT_OVERLAP_UNDO_VERB,
	LOT_OVERLAP_UNREADABLE,
	LOT_OVERLAP_VERBS,
} from './lot-overlaps.constants.ts'
import { PUBLIC_TEXT_REFUSAL, PUBLIC_TEXT_UNCHECKED_REFUSAL } from './public-text.constants.ts'
import { publicTextLabel } from './public-text.ts'
import { GO_AHEAD_LABELS, STORE_FILES } from './store.constants.ts'

import type {
	LotOverlapRecord,
	LotOverlaps,
	LotOverlapUndo,
	OverlapVerb,
} from './lot-overlaps.types.ts'
import type { LotOverlap } from './store.types.ts'

/**
 * The overlaps the lot folder records, in file order, and how many lines do not read as one (counted, never read, a
 * last line without its line feed among them); none without the file.
 */
export function readLotOverlaps(params: { lotFolder: string }): LotOverlaps {
	let content: string
	try {
		content = readFileSync(lotOverlapsFileOf(params), 'utf8')
	} catch {
		return { overlaps: [], unreadable: 0 }
	}
	const lines = content.split('\n')
	// the text after the last line feed is a line without its end: never trusted, even when it parses
	const torn = lines.pop()
	const overlaps: LotOverlapRecord[] = []
	let unreadable = torn === undefined || torn === '' ? 0 : 1
	for (const text of lines) {
		if (text === '') continue
		const line = parseOverlapLine(text)
		if (line === undefined) unreadable += 1
		else if (line.verb !== LOT_OVERLAP_UNDO_VERB) overlaps.push(line)
		else {
			// an undo cancels the newest record of the same lot and pairs: that add was taken back
			const index = overlaps.map((record) => isUndoneBy({ record, undo: line })).lastIndexOf(true)
			if (index >= 0) overlaps.splice(index, 1)
		}
	}
	return { overlaps, unreadable }
}

/** Appends the records of one call in one write; refused over the line limit. */
export function appendLotOverlaps(params: {
	lotFolder: string
	records: readonly LotOverlapRecord[]
}): void {
	appendLine({
		file: lotOverlapsFileOf(params),
		line: lotOverlapsBufferOf(params.records),
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
		...(overlap.damage !== undefined && { damage: overlap.damage }),
		by,
		reason,
	}))
}

/**
 * Whether a re-check's overlap is one the go-ahead accepted: the same lot, still acceptable, no met pair the check did
 * not show (a lot that widened meanwhile meets more than was accepted), and damaged only if it was damaged when accepted
 * (a lot that turned damaged meanwhile is caught: 33CO 4.7).
 */
export function isCoveredOverlap(params: {
	overlap: LotOverlap
	accepted: readonly LotOverlap[]
}): boolean {
	const { overlap } = params
	const accepted = params.accepted.find((each) => each.name === overlap.name)
	return (
		accepted !== undefined &&
		isAcceptableOverlap(overlap) &&
		overlap.damage === accepted.damage &&
		overlap.met.every((pair) => accepted.met.includes(pair))
	)
}

/** The bytes the records of one call are written as, in one append: each record's JSON and a line feed. */
export function lotOverlapsBufferOf(records: readonly LotOverlapRecord[]): Buffer {
	return Buffer.from(records.map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8')
}

/** Why the records of one call cannot be written in one append (over the line limit); undefined when they fit. */
export function overlapsOverLimit(records: readonly LotOverlapRecord[]): string | undefined {
	const bytes = lotOverlapsBufferOf(records).length
	if (bytes <= LOT_OVERLAP_LINE_LIMIT) return undefined
	return LOT_OVERLAP_OVER_LIMIT.replace('{message}', () =>
		overLimitMessage({ bytes, limit: LOT_OVERLAP_LINE_LIMIT }),
	)
}

/**
 * Why `--by` or `--reason` of an accepted overlap (or of a keep) may not be recorded: a person's forbidden word, then
 * (each reaches the public records) a path, a link, a reference or a plan entry id; undefined when both pass.
 */
export function overlapGoAheadRefusal(params: {
	root: string
	verb: string
	by: string
	reason: string
	ids: ReadonlySet<string>
	/** How the refusal names each text: `--by` and `--reason` unless said (a start's keep names `--keep` or `keep`). */
	labels?: { by: string; reason: string }
}): string | undefined {
	const { root, verb } = params
	const labels = params.labels ?? GO_AHEAD_LABELS
	const options = [
		{ option: labels.by, text: params.by },
		{ option: labels.reason, text: params.reason },
	]
	const wordRefusal = forbiddenWordRefusal({ root, verb, options })
	if (wordRefusal) return wordRefusal
	for (const { option, text } of options) {
		let label: string | undefined
		try {
			label = publicTextLabel({ text, root, ids: params.ids })
		} catch (error) {
			return fillMessage({
				template: PUBLIC_TEXT_UNCHECKED_REFUSAL,
				values: { verb, option, reason: (error as Error).message },
			})
		}
		if (label !== undefined)
			return fillMessage({ template: PUBLIC_TEXT_REFUSAL, values: { verb, option, label } })
	}
	return undefined
}

/**
 * An overlap `--overlap-ok` may accept: it names its met paths, its lot's scope reads; a damaged other lot whose scope
 * reads too (33CO behaviour 15), its damage recorded with the go-ahead.
 */
export function isAcceptableOverlap(overlap: LotOverlap): boolean {
	return overlap.everyPath !== true && overlap.met.length > 0
}

/** One line per recorded overlap (`overlaps <lot>: <met> (by <who>: <reason>)`). */
export function lotOverlapLines(records: readonly LotOverlapRecord[]): string[] {
	return records.map(overlapTextOf)
}

/**
 * The recorded overlaps as one text (`overlaps <lot>: <met> (by <who>: <reason>)`, joined), then how many lines do not
 * read; undefined for none of either.
 */
export function lotOverlapsText(params: {
	overlaps: readonly LotOverlapRecord[]
	unreadable?: number
}): string | undefined {
	const unreadable = params.unreadable ?? 0
	const parts = [
		...params.overlaps.map(overlapTextOf),
		...(unreadable > 0
			? [LOT_OVERLAP_UNREADABLE.replace('{count}', () => String(unreadable))]
			: []),
	]
	return parts.length === 0 ? undefined : parts.join(LOT_OVERLAP_SEPARATOR)
}

/** One recorded overlap as text. */
function overlapTextOf(record: LotOverlapRecord): string {
	return fillMessage({
		template: LOT_OVERLAP_TEXT,
		values: {
			lot:
				record.damage === undefined
					? record.lot
					: fillMessage({
							template: LOT_OVERLAP_DAMAGED_LOT,
							values: { lot: record.lot, damage: record.damage },
						}),
			met: record.met.join(LOT_OVERLAP_MET_SEPARATOR),
			by: record.by,
			reason: record.reason,
		},
	})
}

/** The lot folder's `overlaps.jsonl`. */
function lotOverlapsFileOf(params: { lotFolder: string }): string {
	return join(params.lotFolder, STORE_FILES.overlaps)
}

/**
 * Appends, in one write, an undo of each record: the add they were recorded with was taken back, so the overlap no
 * longer stands (`readLotOverlaps` drops the record each undo names).
 */
export function appendLotOverlapUndos(params: {
	lotFolder: string
	records: readonly LotOverlapRecord[]
	at: string
}): void {
	const undos: LotOverlapUndo[] = params.records.map((record) => ({
		schema: LOT_OVERLAP_SCHEMA,
		at: params.at,
		verb: LOT_OVERLAP_UNDO_VERB,
		lot: record.lot,
		met: record.met,
	}))
	appendLine({
		file: lotOverlapsFileOf(params),
		line: Buffer.from(undos.map((undo) => `${JSON.stringify(undo)}\n`).join(''), 'utf8'),
		limit: LOT_OVERLAP_LINE_LIMIT,
	})
}

/** Whether the undo names the record: the same lot and the same met pairs, in order. */
function isUndoneBy(params: { record: LotOverlapRecord; undo: LotOverlapUndo }): boolean {
	const { record, undo } = params
	return (
		record.lot === undo.lot &&
		record.met.length === undo.met.length &&
		record.met.every((pair, index) => pair === undo.met[index])
	)
}

/** The record or undo a line holds; undefined when it reads as neither. */
function parseOverlapLine(text: string): LotOverlapRecord | LotOverlapUndo | undefined {
	let value: unknown
	try {
		value = JSON.parse(text)
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
	const line = value as Record<string, unknown>
	return line.verb === LOT_OVERLAP_UNDO_VERB ? parseOverlapUndo(line) : parseOverlapRecord(line)
}

/** The undo a line holds: its keys alone, each of its type. */
function parseOverlapUndo(line: Record<string, unknown>): LotOverlapUndo | undefined {
	const keys = Object.keys(line)
	if (
		keys.length !== LOT_OVERLAP_UNDO_KEYS.length ||
		!LOT_OVERLAP_UNDO_KEYS.every((key) => key in line)
	)
		return undefined
	const { schema, at, lot, met } = line
	if (schema !== LOT_OVERLAP_SCHEMA || typeof at !== 'string' || at === '') return undefined
	if (typeof lot !== 'string' || lot === '') return undefined
	if (!Array.isArray(met) || !met.every((pair) => typeof pair === 'string')) return undefined
	return line as LotOverlapUndo
}

/** The record a line holds: every key, no other, each of its type; undefined when it does not read as one. */
function parseOverlapRecord(record: Record<string, unknown>): LotOverlapRecord | undefined {
	const keys = Object.keys(record)
	if (
		!LOT_OVERLAP_KEYS.every((key) => key in record) ||
		keys.some((key) => !LOT_OVERLAP_KEYS.includes(key) && !LOT_OVERLAP_OPTIONAL_KEYS.includes(key))
	)
		return undefined
	const { schema, at, verb, lot, met, by, reason, damage } = record
	if (damage !== undefined && (typeof damage !== 'string' || damage === '')) return undefined
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
