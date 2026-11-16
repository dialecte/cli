import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fillMessage } from '../standard/fill-message.ts'
import {
	ASK_RECORD_FILE,
	ASK_RECORD_REFUSALS,
	ASK_STATES,
	CLAIM_MESSAGES,
	NAME_SEPARATOR,
} from './ask.constants.ts'
import { isRecord } from './read-report-fields.ts'

import type { FactSubject } from '../facts/facts.types.ts'
import type {
	AskAngle,
	AskState,
	AskRecordView,
	AskSlice,
	ReadAskRecord,
	ReadAskRecordParams,
} from './ask.types.ts'

/**
 * What a pack reads of an ask's `ask.json`: its question and state, and (an ask that ran the ladder) its subject,
 * angles and slices; a re-ask's record holds the question and state only, the rest read as none. Absent when the
 * folder holds no record; refused when the record does not read.
 */
export function readAskRecord(params: ReadAskRecordParams): ReadAskRecord {
	const path = join(params.askFolder, ASK_RECORD_FILE)
	if (!existsSync(path)) return { absent: true }
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		value = undefined
	}
	const view = viewOf({ value })
	if (view === undefined)
		return { refused: fillMessage({ template: ASK_RECORD_REFUSALS.damaged, values: { path } }) }
	if (!isAskState(view.state))
		return {
			refused: fillMessage({
				template: CLAIM_MESSAGES.askUnknownState,
				values: { path, state: view.state, states: ASK_STATES.join(NAME_SEPARATOR) },
			}),
		}
	return { record: view }
}

/** True when the word is one of the ask states (R1-17). */
export function isAskState(value: unknown): value is AskState {
	return typeof value === 'string' && (ASK_STATES as readonly string[]).includes(value)
}

/** The view of a record holding a question and a state, the other members read when they have their shape. */
function viewOf(params: { value: unknown }): AskRecordView | undefined {
	const { value } = params
	if (!isRecord(value) || typeof value.question !== 'string' || typeof value.state !== 'string')
		return undefined
	return {
		question: value.question,
		state: value.state,
		subject: isSubject(value.subject) ? value.subject : null,
		angles: Array.isArray(value.angles) ? value.angles.filter(isAngle) : [],
		slices: Array.isArray(value.slices) ? value.slices.filter(isSlice) : [],
		...(typeof value.reask === 'string' ? { reask: value.reask } : {}),
	}
}

function isSubject(value: unknown): value is FactSubject {
	return (
		isRecord(value) &&
		Array.isArray(value.tags) &&
		Array.isArray(value.attributes) &&
		Array.isArray(value.codes) &&
		Array.isArray(value.methods)
	)
}

function isAngle(value: unknown): value is AskAngle {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.family === 'string' &&
		Array.isArray(value.terms)
	)
}

function isSlice(value: unknown): value is AskSlice {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.file === 'string' &&
		typeof value.from === 'number' &&
		typeof value.to === 'number' &&
		Array.isArray(value.angles)
	)
}
