import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../standard/fill-message.ts'
import {
	ASK_RECORD_REFUSALS,
	PACK_RECORD_FILE,
	READER_LETTERS,
	ROUND_FOLDER_PATTERN,
	ROUNDS_FOLDER,
	SKIPPED_RECORD_FILE,
	VERDICT_RECORD_FILE,
} from './ask.constants.ts'
import { isRecord } from './read-report-fields.ts'

import type {
	AskRound,
	AskRoundsOf,
	AskRoundsOfParams,
	PackRecord,
	SkippedRecord,
	VerdictRecord,
} from './ask.types.ts'

/**
 * The rounds of an ask in round order (D6): each round's folder, its `pack.json`, its `verdict.json` and its
 * `skipped.json` (J-15; each null while absent); the refusal naming a record that does not read as schema 1.
 */
export function askRoundsOf(params: AskRoundsOfParams): AskRoundsOf {
	const roundsFolder = join(params.askFolder, ROUNDS_FOLDER)
	if (!existsSync(roundsFolder)) return { rounds: [] }
	const numbered = readdirSync(roundsFolder)
		.map((name) => ({ name, match: ROUND_FOLDER_PATTERN.exec(name) }))
		.filter((entry) => entry.match !== null)
		.map((entry) => ({ folder: join(roundsFolder, entry.name), round: Number(entry.match?.[1]) }))
		.sort((first, second) => first.round - second.round)
	const rounds: AskRound[] = []
	for (const { folder, round } of numbered) {
		const pack = recordOf({ path: join(folder, PACK_RECORD_FILE), isRecord: isPackRecord })
		if ('refused' in pack) return pack
		const verdict = recordOf({ path: join(folder, VERDICT_RECORD_FILE), isRecord: isVerdictRecord })
		if ('refused' in verdict) return verdict
		const skipped = recordOf({ path: join(folder, SKIPPED_RECORD_FILE), isRecord: isSkippedRecord })
		if ('refused' in skipped) return skipped
		rounds.push({
			round,
			folder,
			pack: pack.record,
			verdict: verdict.record,
			skipped: skipped.record,
		})
	}
	return { rounds }
}

/** Whether a value reads as a `skipped.json` of schema 1 (J-15): the ask, the round, needs-person, a reason, a time. */
function isSkippedRecord(value: unknown): value is SkippedRecord {
	return (
		isRecord(value) &&
		value.schema === 1 &&
		typeof value.ask === 'string' &&
		typeof value.round === 'number' &&
		value.state === 'needs-person' &&
		typeof value.reason === 'string' &&
		typeof value.at === 'string'
	)
}

/** A record read from its file: null when absent, refused when it does not read as its schema. */
function recordOf<Record>(params: {
	path: string
	isRecord: (value: unknown) => value is Record
}): { record: Record | null } | { refused: string } {
	if (!existsSync(params.path)) return { record: null }
	let value: unknown
	try {
		value = JSON.parse(readFileSync(params.path, 'utf8'))
	} catch {
		value = undefined
	}
	if (params.isRecord(value)) return { record: value }
	return {
		refused: fillMessage({ template: ASK_RECORD_REFUSALS.damaged, values: { path: params.path } }),
	}
}

/** Whether a value reads as a `pack.json` of schema 1: its round and each reader's letter, nonce and slice ids. */
function isPackRecord(value: unknown): value is PackRecord {
	if (!isRecord(value) || value.schema !== 1 || typeof value.round !== 'number') return false
	if (typeof value.ask !== 'string' || !Array.isArray(value.readers)) return false
	return value.readers.every(
		(reader: unknown) =>
			isRecord(reader) &&
			READER_LETTERS.some((letter) => letter === reader.letter) &&
			typeof reader.nonce === 'string' &&
			isTextList(reader.slices) &&
			Array.isArray(reader.ranges) &&
			reader.ranges.every(isPackRange),
	)
}

/** Whether a value reads as a range a pack recorded given (I-6): its id, file, lines, clause and linked flag. */
function isPackRange(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.file === 'string' &&
		typeof value.from === 'number' &&
		typeof value.to === 'number' &&
		(value.clause === null || typeof value.clause === 'string') &&
		typeof value.linked === 'boolean'
	)
}

/** Whether a value reads as a `verdict.json` of schema 1, as far as the next pack reads it: its state and angles. */
function isVerdictRecord(value: unknown): value is VerdictRecord {
	return (
		isRecord(value) &&
		value.schema === 1 &&
		typeof value.state === 'string' &&
		isTextList(value.verifiedAngles) &&
		(value.next === null || typeof value.next === 'string')
	)
}

function isTextList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
