import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { recordText, replaceWhole } from '../../store/publish.ts'
import { readHistory } from '../facts/fact-history.ts'
import { currentFactOf } from '../facts/record-fact.ts'
import { ANSWERING_MARKER_FILE, RECORDING_EVENTS } from './ask.constants.ts'
import { isRecord } from './read-report-fields.ts'

import type {
	AnsweringMarker,
	PersonAnsweringMarker,
	RecordedFactOfKeyParams,
	WriteAnsweringMarkerParams,
} from './ask.types.ts'

/**
 * The fact an earlier run recorded for an ask under a marker's key, so a retry records nothing new (R1-4, R2-2): the
 * key's current fact when a `created` or `reused` line of its history names the ask and its lot (R3-1: null outside
 * a lot on both sides). A marker only ever names the key:
 * a fact found otherwise (an ask of the same id in another asks folder) is never taken. Undefined when none.
 */
export function recordedFactOfKey(params: RecordedFactOfKeyParams): string | undefined {
	const { folder, ask } = params
	const current = currentFactOf({ folder, key: params.key })
	if (current === undefined) return undefined
	// only the line that recorded the fact for this ask in this lot: never a `rechecked` or other line naming it (R3-1)
	return readHistory({ folder, id: current.id }).some(
		(line) => RECORDING_EVENTS.includes(line.event) && line.ask === ask && line.lot === params.lot,
	)
		? current.id
		: undefined
}

/**
 * Publishes or updates the round's `answering` marker (R1-4): schema 1, the ask, the round, the nonces its run
 * claims and the key of the fact draft (null until the outcome is answered). Written before any nonce is claimed,
 * whatever the outcome; a marker an earlier run left keeps its nonces (the retry's own) and takes the key.
 */
export function writeAnsweringMarker(params: WriteAnsweringMarkerParams): AnsweringMarker {
	const path = join(params.roundFolder, ANSWERING_MARKER_FILE)
	const earlier = readAnsweringMarker({ roundFolder: params.roundFolder })
	const kept = earlier?.ask === params.ask ? earlier : undefined
	const marker: AnsweringMarker = {
		schema: 1,
		ask: params.ask,
		round: params.round,
		nonces: [...new Set([...(kept?.nonces ?? []), ...params.nonces])],
		key: params.key ?? kept?.key ?? null,
	}
	// written whole: the run holds the round's claim, no other writer
	replaceWhole({ path, text: recordText(marker) })
	return marker
}

/** The round's `answering` marker as written (R1-4); undefined when absent or not of schema 1. */
export function readAnsweringMarker(params: { roundFolder: string }): AnsweringMarker | undefined {
	const value = markerValueOf({ folder: params.roundFolder })
	if (value === undefined || typeof value.round !== 'number' || !Array.isArray(value.nonces))
		return undefined
	const key = value.key
	if (key !== null && typeof key !== 'string') return undefined
	const nonces = value.nonces.filter((nonce): nonce is string => typeof nonce === 'string')
	return { schema: 1, ask: value.ask, round: value.round, nonces, key }
}

/**
 * Publishes the ask's `answering` marker of a person's answer (R2-7): `<ask>/answering.json`, schema 1, the ask and
 * the key of the person fact's draft, before the fact is recorded; a retry finds the fact by it.
 */
export function writePersonAnsweringMarker(params: {
	askFolder: string
	ask: string
	key: string
}): void {
	const marker: PersonAnsweringMarker = { schema: 1, ask: params.ask, key: params.key }
	replaceWhole({ path: join(params.askFolder, ANSWERING_MARKER_FILE), text: recordText(marker) })
}

/** The ask's `answering` marker of a person's answer (R2-7); undefined when absent or not of schema 1. */
export function readPersonAnsweringMarker(params: {
	askFolder: string
}): PersonAnsweringMarker | undefined {
	const value = markerValueOf({ folder: params.askFolder })
	if (value === undefined || typeof value.key !== 'string') return undefined
	return { schema: 1, ask: value.ask, key: value.key }
}

/** Removes a folder's `answering` marker once the record it guards is published (a marker gone stays gone). */
export function removeAnsweringMarker(params: { folder: string }): void {
	rmSync(join(params.folder, ANSWERING_MARKER_FILE), { force: true })
}

/** A folder's `answering.json` parsed: an object of schema 1 naming its ask; undefined otherwise. */
function markerValueOf(params: {
	folder: string
}): (Record<string, unknown> & { ask: string }) | undefined {
	const path = join(params.folder, ANSWERING_MARKER_FILE)
	if (!existsSync(path)) return undefined
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return undefined
	}
	if (!isRecord(value) || value.schema !== 1 || typeof value.ask !== 'string') return undefined
	return { ...value, ask: value.ask }
}
